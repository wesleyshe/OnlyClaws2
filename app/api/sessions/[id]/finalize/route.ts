import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey, checkAdminKey } from '@/lib/utils/api-helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const isAdmin = checkAdminKey(req);

    if (!isAdmin) {
      const apiKey = extractApiKey(req.headers.get('authorization'));
      if (!apiKey) return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY or x-admin-key header', 401);
      const agent = await prisma.agent.findUnique({ where: { apiKey } });
      if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);
    }

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return errorResponse('Session not found', 'No session with that ID', 404);

    if (!isAdmin && session.phase !== 'reviewing') {
      return errorResponse('Wrong phase', 'Session must be in "reviewing" phase to finalize (or use admin key)', 400);
    }

    if (!session.mergedCode) {
      return errorResponse('No code', 'Session has no code contributions to finalize', 400);
    }

    const existingGame = await prisma.game.findUnique({ where: { sessionId: id } });
    if (existingGame) {
      return successResponse({
        message: 'Game already finalized',
        game: existingGame,
      });
    }

    // Get winning proposal info
    let title = session.title;
    let description = '';
    let genre = 'other';

    if (session.winningProposalId) {
      const proposal = await prisma.proposal.findUnique({
        where: { id: session.winningProposalId },
      });
      if (proposal) {
        title = proposal.title;
        description = proposal.description;
        genre = proposal.genre;
      }
    }

    // Calculate contributor stats
    const contributions = await prisma.contribution.findMany({
      where: { sessionId: id },
      include: { agent: { select: { id: true, name: true } } },
    });

    const contributorMap = new Map<string, { agentId: string; agentName: string; lines: number }>();
    for (const c of contributions) {
      const existing = contributorMap.get(c.agentId);
      if (existing) {
        existing.lines += c.lineCount;
      } else {
        contributorMap.set(c.agentId, {
          agentId: c.agentId,
          agentName: c.agent.name,
          lines: c.lineCount,
        });
      }
    }

    const contributorsList = Array.from(contributorMap.values());
    const totalLines = contributorsList.reduce((sum, c) => sum + c.lines, 0);

    const game = await prisma.game.create({
      data: {
        sessionId: id,
        title,
        description,
        genre,
        code: session.mergedCode,
        totalLines,
        contributors: {
          create: contributorsList.map(c => ({
            agentId: c.agentId,
            agentName: c.agentName,
            linesContributed: c.lines,
          })),
        },
      },
      include: { contributors: true },
    });

    await prisma.session.update({ where: { id }, data: { phase: 'completed' } });

    return successResponse({
      message: 'Game finalized successfully!',
      game: {
        id: game.id,
        title: game.title,
        description: game.description,
        genre: game.genre,
        totalLines: game.totalLines,
        contributors: game.contributors,
      },
    }, 201);
  } catch (error: any) {
    return errorResponse('Failed to finalize', error.message, 500);
  }
}
