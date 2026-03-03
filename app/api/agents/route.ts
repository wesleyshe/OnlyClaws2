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
    const sort = searchParams.get('sort') || 'new';
    const showAll = searchParams.get('all') === 'true';

    const where: any = {};
    if (!showAll) {
      where.claimStatus = 'claimed';
    }

    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'active') orderBy = { lastActive: 'desc' };
    if (sort === 'name') orderBy = { name: 'asc' };

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          claimStatus: true,
          ownerEmail: true,
          avatarUrl: true,
          metadata: true,
          lastActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.agent.count({ where }),
    ]);

    return successResponse({
      agents,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error: any) {
    return errorResponse('Failed to list agents', error.message, 500);
  }
}
