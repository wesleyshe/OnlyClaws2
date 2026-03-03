import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, validatePagination } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const { limit, offset } = validatePagination(
      searchParams.get('limit'),
      searchParams.get('offset')
    );
    const sort = searchParams.get('sort') || 'newest';
    const genre = searchParams.get('genre');

    const where: any = {};
    if (genre) where.genre = genre;

    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'popular') orderBy = { playCount: 'desc' };

    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          genre: true,
          totalLines: true,
          playCount: true,
          createdAt: true,
          sessionId: true,
          contributors: {
            select: { agentName: true, linesContributed: true },
          },
        },
      }),
      prisma.game.count({ where }),
    ]);

    return successResponse({
      games,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error: any) {
    return errorResponse('Failed to list games', error.message, 500);
  }
}
