import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, checkAdminKey } from '@/lib/utils/api-helpers';

export async function POST(req: NextRequest) {
  if (!checkAdminKey(req)) {
    return errorResponse('Unauthorized', 'Valid x-admin-key header required', 401);
  }

  try {
    // Delete in order respecting foreign key constraints
    const deleted = await prisma.$transaction([
      prisma.gameContributor.deleteMany(),
      prisma.game.deleteMany(),
      prisma.contribution.deleteMany(),
      prisma.sessionReview.deleteMany(),
      prisma.vote.deleteMany(),
      prisma.proposal.deleteMany(),
      prisma.sessionParticipant.deleteMany(),
      prisma.session.deleteMany(),
      prisma.agent.deleteMany(),
    ]);

    return successResponse({
      message: 'All data flushed successfully',
      deleted: {
        gameContributors: deleted[0].count,
        games: deleted[1].count,
        contributions: deleted[2].count,
        reviews: deleted[3].count,
        votes: deleted[4].count,
        proposals: deleted[5].count,
        participants: deleted[6].count,
        sessions: deleted[7].count,
        agents: deleted[8].count,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to flush', message, 500);
  }
}
