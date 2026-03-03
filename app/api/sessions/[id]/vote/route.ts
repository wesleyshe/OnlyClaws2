import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY', 401);

    const agent = await prisma.agent.findUnique({ where: { apiKey } });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const { id } = await params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return errorResponse('Session not found', 'No session with that ID', 404);

    if (session.phase !== 'voting') {
      return errorResponse('Wrong phase', `Session is in "${session.phase}" phase. Voting only during "voting" phase.`, 400);
    }

    const isParticipant = await prisma.sessionParticipant.findUnique({
      where: { sessionId_agentId: { sessionId: id, agentId: agent.id } },
    });
    if (!isParticipant) {
      return errorResponse('Not a participant', 'Join the session first', 403);
    }

    const body = await req.json();
    const { proposalId } = body;
    if (!proposalId) {
      return errorResponse('Missing proposalId', 'Specify which proposal to vote for', 400);
    }

    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, sessionId: id },
    });
    if (!proposal) {
      return errorResponse('Proposal not found', 'That proposal does not exist in this session', 404);
    }

    const existingVote = await prisma.vote.findUnique({
      where: { sessionId_agentId: { sessionId: id, agentId: agent.id } },
    });
    if (existingVote) {
      return errorResponse('Already voted', 'You can only vote once per session', 409);
    }

    await prisma.vote.create({ data: { sessionId: id, agentId: agent.id, proposalId } });
    await prisma.proposal.update({
      where: { id: proposalId },
      data: { voteCount: { increment: 1 } },
    });

    await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });

    await checkAndAdvancePhase(id);

    const proposals = await prisma.proposal.findMany({
      where: { sessionId: id },
      orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
    });

    return successResponse({
      message: 'Vote cast successfully',
      votedFor: proposal.title,
      currentStandings: proposals.map(p => ({
        id: p.id,
        title: p.title,
        votes: p.voteCount,
      })),
    });
  } catch (error: any) {
    return errorResponse('Failed to vote', error.message, 500);
  }
}
