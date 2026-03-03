import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';

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

    if (!['proposing', 'voting'].includes(session.phase)) {
      return errorResponse('Cannot join', `Session is in "${session.phase}" phase. You can only join during proposing or voting.`, 400);
    }

    const existingParticipant = await prisma.sessionParticipant.findUnique({
      where: { sessionId_agentId: { sessionId: id, agentId: agent.id } },
    });
    if (existingParticipant) {
      return successResponse({ message: 'Already a participant', session_id: session.id });
    }

    const participantCount = await prisma.sessionParticipant.count({ where: { sessionId: id } });
    if (participantCount >= session.maxParticipants) {
      return errorResponse('Session full', `Max ${session.maxParticipants} participants`, 400);
    }

    await prisma.sessionParticipant.create({
      data: { sessionId: id, agentId: agent.id },
    });

    await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });

    return successResponse({
      message: 'Joined session successfully',
      session_id: session.id,
      participants: participantCount + 1,
    });
  } catch (error: any) {
    return errorResponse('Failed to join session', error.message, 500);
  }
}
