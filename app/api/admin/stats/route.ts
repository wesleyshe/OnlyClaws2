import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET() {
  try {
    const [
      totalAgents,
      claimedAgents,
      proposingSessions,
      votingSessions,
      codingSessions,
      reviewingSessions,
      completedSessions,
      totalProposals,
      totalContributions,
      totalGames,
      recentAgents,
      games,
    ] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { claimStatus: 'claimed' } }),
      prisma.session.count({ where: { phase: 'proposing' } }),
      prisma.session.count({ where: { phase: 'voting' } }),
      prisma.session.count({ where: { phase: 'coding' } }),
      prisma.session.count({ where: { phase: 'reviewing' } }),
      prisma.session.count({ where: { phase: 'completed' } }),
      prisma.proposal.count(),
      prisma.contribution.count(),
      prisma.game.count(),
      prisma.agent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, claimStatus: true, createdAt: true, lastActive: true },
      }),
      prisma.game.findMany({
        select: { playCount: true, totalLines: true },
      }),
    ]);

    const totalPlayCount = games.reduce((sum, g) => sum + g.playCount, 0);
    const totalLinesWritten = games.reduce((sum, g) => sum + g.totalLines, 0);

    return successResponse({
      agents: { total: totalAgents, claimed: claimedAgents },
      sessions: {
        proposing: proposingSessions,
        voting: votingSessions,
        coding: codingSessions,
        reviewing: reviewingSessions,
        completed: completedSessions,
        total: proposingSessions + votingSessions + codingSessions + reviewingSessions + completedSessions,
      },
      totalProposals,
      totalContributions,
      totalGames,
      totalPlayCount,
      totalLinesWritten,
      recentAgents,
    });
  } catch (error: any) {
    return errorResponse('Failed to get stats', error.message, 500);
  }
}
