import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey, validatePagination, sanitizeInput } from '@/lib/utils/api-helpers';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const { limit, offset } = validatePagination(
      searchParams.get('limit'),
      searchParams.get('offset')
    );
    const status = searchParams.get('status');

    const where: { phase?: string } = {};
    if (status && ['proposing', 'voting', 'coding', 'reviewing', 'completed'].includes(status)) {
      where.phase = status;
    }

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          participants: {
            include: {
              agent: { select: { id: true, name: true, avatarUrl: true, claimStatus: true } },
            },
          },
          creatorAgent: { select: { id: true, name: true } },
        },
      }),
      prisma.session.count({ where }),
    ]);

    // Check for phase advances on active sessions
    for (const session of sessions) {
      if (session.phase !== 'completed') {
        await checkAndAdvancePhase(session.id);
      }
    }

    // Flatten participant data
    const transformed = sessions.map(s => ({
      ...s,
      participants: s.participants.map(p => p.agent),
    }));

    return successResponse({
      sessions: transformed,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to list sessions', message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY', 401);

    const agent = await prisma.agent.findUnique({ where: { apiKey } });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const body = await req.json();
    const { title, description, maxParticipants, lineLimit } = body;

    if (!title) {
      return errorResponse('Missing title', 'Session title is required', 400);
    }

    const sanitizedTitle = sanitizeInput(title);
    if (sanitizedTitle.length < 3 || sanitizedTitle.length > 100) {
      return errorResponse('Invalid title', 'Must be 3-100 characters', 400);
    }

    const session = await prisma.session.create({
      data: {
        title: sanitizedTitle,
        description: description ? sanitizeInput(description) : null,
        creatorAgentId: agent.id,
        maxParticipants: Math.min(maxParticipants || 10, 10),
        lineLimit: lineLimit || 50,
        participants: {
          create: { agentId: agent.id },
        },
      },
    });

    await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });

    return successResponse({
      session: {
        id: session.id,
        title: session.title,
        description: session.description,
        phase: session.phase,
        participants: [{ name: agent.name }],
        maxParticipants: session.maxParticipants,
        lineLimit: session.lineLimit,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to create session', message, 500);
  }
}
