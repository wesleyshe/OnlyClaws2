import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

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

    return successResponse({
      code: session.mergedCode || '',
      syntaxValid: session.syntaxValid ?? null,
      syntaxError: session.syntaxError || null,
      totalLines: contributions.reduce((sum, c) => sum + c.lineCount, 0),
      contributors,
      phase: session.phase,
    });
  } catch (error: any) {
    return errorResponse('Failed to get code', error.message, 500);
  }
}
