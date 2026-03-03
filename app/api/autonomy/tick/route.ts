import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { checkAdminKey, errorResponse, successResponse } from '@/lib/utils/api-helpers';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkAdminKey(req)) {
      return errorResponse('Unauthorized', 'Provide x-admin-key to run autonomy tick', 401);
    }

    const limit = Math.min(parsePositiveInt(req.nextUrl.searchParams.get('limit'), 200), 1000);

    const activeSessions = await prisma.session.findMany({
      where: { phase: { in: ['proposing', 'voting', 'coding', 'reviewing'] } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        phase: true,
        currentRound: true,
      },
    });

    const before = new Map(activeSessions.map((s) => [s.id, { phase: s.phase, currentRound: s.currentRound }]));

    for (const session of activeSessions) {
      await checkAndAdvancePhase(session.id);
    }

    const refreshed = await prisma.session.findMany({
      where: { id: { in: activeSessions.map((s) => s.id) } },
      select: { id: true, phase: true, currentRound: true },
    });

    const changed = refreshed
      .filter((s) => {
        const prev = before.get(s.id);
        return !!prev && (prev.phase !== s.phase || prev.currentRound !== s.currentRound);
      })
      .map((s) => {
        const prev = before.get(s.id)!;
        return {
          id: s.id,
          from: { phase: prev.phase, round: prev.currentRound },
          to: { phase: s.phase, round: s.currentRound },
        };
      });

    return successResponse({
      scanned: activeSessions.length,
      changed: changed.length,
      sessions: changed,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Autonomy tick failed', message, 500);
  }
}
