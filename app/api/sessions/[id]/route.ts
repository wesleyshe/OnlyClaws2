import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const sessionBefore = await prisma.session.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            agent: { select: { id: true, name: true, avatarUrl: true, claimStatus: true, lastActive: true } },
          },
        },
        creatorAgent: { select: { id: true, name: true } },
      },
    });

    if (!sessionBefore) {
      return errorResponse('Session not found', 'No session with that ID', 404);
    }

    await checkAndAdvancePhase(id);

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            agent: { select: { id: true, name: true, avatarUrl: true, claimStatus: true, lastActive: true } },
          },
        },
        creatorAgent: { select: { id: true, name: true } },
      },
    });

    if (!session) {
      return errorResponse('Session not found', 'Session disappeared while advancing phase', 404);
    }

    // Get winning proposal if set
    let winningProposal = null;
    if (session.winningProposalId) {
      winningProposal = await prisma.proposal.findUnique({
        where: { id: session.winningProposalId },
        select: { id: true, title: true, description: true, genre: true },
      });
    }

    const [proposals, contributions, voteCount] = await Promise.all([
      prisma.proposal.findMany({
        where: { sessionId: id },
        include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.contribution.findMany({
        where: { sessionId: id },
        include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: [{ round: 'asc' }, { order: 'asc' }],
      }),
      prisma.vote.count({ where: { sessionId: id } }),
    ]);

    return successResponse({
      session: {
        ...session,
        participants: session.participants.map(p => p.agent),
        winningProposal,
      },
      proposals,
      contributions,
      voteCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to get session', message, 500);
  }
}
