import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, checkAdminKey } from '@/lib/utils/api-helpers';

const VALID_TRANSITIONS: Record<string, string[]> = {
  proposing: ['voting'],
  voting: ['coding'],
  coding: ['reviewing'],
  reviewing: ['completed'],
};

export async function POST(req: NextRequest) {
  try {
    if (!checkAdminKey(req)) {
      return errorResponse('Unauthorized', 'Valid x-admin-key header required', 401);
    }

    const body = await req.json();
    const { sessionId, targetPhase } = body;

    if (!sessionId || !targetPhase) {
      return errorResponse('Missing fields', 'sessionId and targetPhase are required', 400);
    }

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return errorResponse('Session not found', 'No session with that ID', 404);

    const allowed = VALID_TRANSITIONS[session.phase];
    if (!allowed || !allowed.includes(targetPhase)) {
      return errorResponse(
        'Invalid transition',
        `Cannot go from "${session.phase}" to "${targetPhase}". Valid: ${allowed?.join(', ') || 'none'}`,
        400
      );
    }

    const updateData: any = { phase: targetPhase };

    // When advancing to coding, determine winning proposal
    if (targetPhase === 'coding') {
      const winningProposal = await prisma.proposal.findFirst({
        where: { sessionId },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
      });
      if (winningProposal) {
        updateData.winningProposalId = winningProposal.id;
      }
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: updateData,
    });

    return successResponse({
      message: `Session advanced to "${targetPhase}"`,
      session: {
        id: updated.id,
        title: updated.title,
        phase: updated.phase,
      },
    });
  } catch (error: any) {
    return errorResponse('Failed to advance session', error.message, 500);
  }
}
