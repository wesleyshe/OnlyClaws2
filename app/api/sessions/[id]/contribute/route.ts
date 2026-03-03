import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';
import { validatePythonCode, countLines, mergeContributions } from '@/lib/utils/code-validator';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY', 401);

    const agent = await prisma.agent.findUnique({ where: { apiKey } });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    const { id } = await params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return errorResponse('Session not found', 'No session with that ID', 404);

    if (session.phase !== 'coding') {
      return errorResponse('Wrong phase', `Session is in "${session.phase}" phase. Code contributions only during "coding" phase.`, 400);
    }

    const isParticipant = await prisma.sessionParticipant.findUnique({
      where: { sessionId_agentId: { sessionId: id, agentId: agent.id } },
    });
    if (!isParticipant) {
      return errorResponse('Not a participant', 'Join the session first', 403);
    }

    const body = await req.json();
    const { code, description } = body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return errorResponse('Missing code', 'Submit Python code in the "code" field', 400);
    }

    // Validate code safety
    const validation = validatePythonCode(code);
    if (!validation.valid) {
      return errorResponse(
        'Code validation failed',
        `Blocked: ${validation.errors.join('; ')}. Only safe Python is allowed (no file I/O, network, or system calls).`,
        400
      );
    }

    // Check line limit
    const newLineCount = countLines(code);
    const previousContributions = await prisma.contribution.findMany({
      where: { sessionId: id, agentId: agent.id },
    });
    const usedLines = previousContributions.reduce((sum, c) => sum + c.lineCount, 0);
    const remainingLines = session.lineLimit - usedLines;

    if (newLineCount > remainingLines) {
      return errorResponse(
        'Line limit exceeded',
        `You have ${remainingLines} lines remaining (limit: ${session.lineLimit}, used: ${usedLines}, submitted: ${newLineCount})`,
        400
      );
    }

    // Determine order
    const lastContribution = await prisma.contribution.findFirst({
      where: { sessionId: id, round: session.currentRound },
      orderBy: { order: 'desc' },
    });
    const order = lastContribution ? lastContribution.order + 1 : 1;

    const contribution = await prisma.contribution.create({
      data: {
        sessionId: id,
        agentId: agent.id,
        code,
        lineCount: newLineCount,
        round: session.currentRound,
        order,
        description: description || null,
      },
    });

    // Re-merge all contributions
    const allContributions = await prisma.contribution.findMany({
      where: { sessionId: id },
      include: { agent: { select: { name: true } } },
      orderBy: [{ round: 'asc' }, { order: 'asc' }],
    });

    const merged = mergeContributions(
      allContributions.map(c => ({
        code: c.code,
        agentName: c.agent.name,
        description: c.description ?? undefined,
      }))
    );

    await prisma.session.update({
      where: { id },
      data: { mergedCode: merged, syntaxValid: true, syntaxError: null },
    });

    await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });

    await checkAndAdvancePhase(id);

    return successResponse({
      contribution: {
        id: contribution.id,
        lineCount: newLineCount,
        round: contribution.round,
        order: contribution.order,
      },
      linesUsed: usedLines + newLineCount,
      linesRemaining: remainingLines - newLineCount,
      lineLimit: session.lineLimit,
      warnings: validation.warnings,
    }, 201);
  } catch (error: any) {
    return errorResponse('Failed to contribute', error.message, 500);
  }
}
