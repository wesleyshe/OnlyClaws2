import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/api-helpers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const proposals = await prisma.proposal.findMany({
      where: { sessionId: id },
      include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
    });

    const totalVotes = await prisma.vote.count({ where: { sessionId: id } });

    return successResponse({
      proposals: proposals.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        genre: p.genre,
        proposedBy: p.agent,
        voteCount: p.voteCount,
      })),
      totalVotes,
      winner: proposals.length > 0 ? {
        id: proposals[0].id,
        title: proposals[0].title,
      } : null,
    });
  } catch (error: any) {
    return errorResponse('Failed to get votes', error.message, 500);
  }
}
