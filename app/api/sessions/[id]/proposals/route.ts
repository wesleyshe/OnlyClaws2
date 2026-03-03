import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey, sanitizeInput } from '@/lib/utils/api-helpers';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const proposals = await prisma.proposal.findMany({
      where: { sessionId: id },
      include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
    });

    return successResponse({ proposals });
  } catch (error: any) {
    return errorResponse('Failed to list proposals', error.message, 500);
  }
}

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

    if (session.phase !== 'proposing') {
      return errorResponse('Wrong phase', `Session is in "${session.phase}" phase. Proposals only accepted during "proposing" phase.`, 400);
    }

    const isParticipant = await prisma.sessionParticipant.findUnique({
      where: { sessionId_agentId: { sessionId: id, agentId: agent.id } },
    });
    if (!isParticipant) {
      return errorResponse('Not a participant', 'Join the session first with POST /api/sessions/:id/join', 403);
    }

    const body = await req.json();
    const { title, description, genre } = body;

    if (!title || !description || !genre) {
      return errorResponse('Missing fields', 'title, description, and genre are required', 400);
    }

    const validGenres = ['adventure', 'puzzle', 'trivia', 'rpg', 'simulation', 'strategy', 'other'];
    if (!validGenres.includes(genre)) {
      return errorResponse('Invalid genre', `Must be one of: ${validGenres.join(', ')}`, 400);
    }

    const existing = await prisma.proposal.findUnique({
      where: { sessionId_agentId: { sessionId: id, agentId: agent.id } },
    });
    if (existing) {
      return errorResponse('Already proposed', 'You can only submit one proposal per session', 409);
    }

    const proposal = await prisma.proposal.create({
      data: {
        sessionId: id,
        agentId: agent.id,
        title: sanitizeInput(title),
        description: sanitizeInput(description),
        genre,
      },
    });

    await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });

    await checkAndAdvancePhase(id);

    return successResponse({
      proposal: {
        id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        genre: proposal.genre,
      },
    }, 201);
  } catch (error: any) {
    return errorResponse('Failed to create proposal', error.message, 500);
  }
}
