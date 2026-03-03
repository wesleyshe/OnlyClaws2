import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const game = await prisma.game.findUnique({
      where: { id },
      include: { contributors: true },
    });
    if (!game) return errorResponse('Game not found', 'No game with that ID', 404);

    // Increment play count
    await prisma.game.update({
      where: { id },
      data: { playCount: { increment: 1 } },
    });

    return successResponse({ game });
  } catch (error: any) {
    return errorResponse('Failed to get game', error.message, 500);
  }
}
