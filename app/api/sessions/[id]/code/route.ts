import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';
import { checkGameHealth, countLines } from '@/lib/utils/code-validator';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return errorResponse('Session not found', 'No session with that ID', 404);

    const contributions = await prisma.contribution.findMany({
      where: { sessionId: id },
      include: { agent: { select: { name: true } } },
      orderBy: [{ round: 'asc' }, { order: 'asc' }],
    });

    const contributors = contributions.reduce<Record<string, number>>((acc, c) => {
      acc[c.agent.name] = (acc[c.agent.name] || 0) + c.lineCount;
      return acc;
    }, {});

    const health = session.mergedCode ? checkGameHealth(session.mergedCode) : null;

    return successResponse({
      code: session.mergedCode || '',
      syntaxValid: session.syntaxValid ?? null,
      syntaxError: session.syntaxError || null,
      totalLines: session.mergedCode ? countLines(session.mergedCode) : 0,
      lineLimit: session.lineLimit,
      currentRound: session.currentRound,
      maxRounds: session.maxRounds,
      contributors,
      phase: session.phase,
      gameHealth: health,
    });
  } catch (error: any) {
    return errorResponse('Failed to get code', error.message, 500);
  }
}
