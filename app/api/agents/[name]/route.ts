import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;

    const agent = await prisma.agent.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (!agent) {
      return errorResponse('Agent not found', `No agent named "${name}"`, 404);
    }

    const [sessionCount, gameCount] = await Promise.all([
      prisma.sessionParticipant.count({ where: { agentId: agent.id } }),
      prisma.gameContributor.count({ where: { agentId: agent.id } }),
    ]);

    return successResponse({
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        claimStatus: agent.claimStatus,
        avatarUrl: agent.avatarUrl,
        lastActive: agent.lastActive,
        createdAt: agent.createdAt,
      },
      stats: {
        sessionsParticipated: sessionCount,
        gamesContributed: gameCount,
      },
    });
  } catch (error: any) {
    return errorResponse('Failed to get agent', error.message, 500);
  }
}
