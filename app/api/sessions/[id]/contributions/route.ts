import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const contributions = await prisma.contribution.findMany({
      where: { sessionId: id },
      include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ round: 'asc' }, { order: 'asc' }],
    });

    return successResponse({ contributions });
  } catch (error: any) {
    return errorResponse('Failed to list contributions', error.message, 500);
  }
}
