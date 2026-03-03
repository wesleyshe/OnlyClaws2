import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';
import { validatePythonCode, countLines, checkGameHealth } from '@/lib/utils/code-validator';
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
    const session = await prisma.session.findUnique({
      where: { id },
      include: { participants: true },
    });
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

    // Check if agent already contributed this round
    const alreadyContributed = await prisma.contribution.findFirst({
      where: { sessionId: id, agentId: agent.id, round: session.currentRound },
    });
    if (alreadyContributed) {
      return errorResponse(
        'Already contributed this round',
        `You already submitted code for round ${session.currentRound}. Wait for other agents to finish this round.`,
        400
      );
    }

    const body = await req.json();
    const { code, description, pass } = body;
    const participantCount = session.participants.length;
    const perAgentBudget = Math.floor(session.lineLimit / participantCount);
    const previousLines = countLines(session.mergedCode || '');

    // Handle pass — agent is happy with the current code
    if (pass === true) {
      const lastContribution = await prisma.contribution.findFirst({
        where: { sessionId: id, round: session.currentRound },
        orderBy: { order: 'desc' },
      });
      const order = lastContribution ? lastContribution.order + 1 : 1;

      await prisma.contribution.create({
        data: {
          sessionId: id,
          agentId: agent.id,
          code: session.mergedCode || '',
          lineCount: previousLines,
          round: session.currentRound,
          order,
          description: 'Passed — no changes',
        },
      });

      await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });
      await checkAndAdvancePhase(id);

      const updatedSession = await prisma.session.findUnique({ where: { id } });

      return successResponse({
        message: 'Passed this round — no changes made',
        round: session.currentRound,
        maxRounds: session.maxRounds,
        currentRound: updatedSession?.currentRound ?? session.currentRound,
        phase: updatedSession?.phase ?? session.phase,
      });
    }

    // Regular code submission
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return errorResponse('Missing code', 'Submit the FULL game code in the "code" field, or send {"pass": true} to skip this round.', 400);
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

    // Check total line limit
    const totalLines = countLines(code);
    if (totalLines > session.lineLimit) {
      return errorResponse(
        'Line limit exceeded',
        `The game has ${totalLines} lines but the session limit is ${session.lineLimit}. Shorten the code.`,
        400
      );
    }

    // Check per-agent line budget (how many NEW lines they're adding)
    const linesAdded = totalLines - previousLines;
    if (linesAdded > perAgentBudget) {
      return errorResponse(
        'Per-agent line budget exceeded',
        `You added ${linesAdded} new lines but your budget is ${perAgentBudget} lines per round (${session.lineLimit} total / ${participantCount} agents). You can modify existing code freely, but can only ADD up to ${perAgentBudget} new lines.`,
        400
      );
    }

    // Determine order
    const lastContribution = await prisma.contribution.findFirst({
      where: { sessionId: id, round: session.currentRound },
      orderBy: { order: 'desc' },
    });
    const order = lastContribution ? lastContribution.order + 1 : 1;

    // Store contribution
    const contribution = await prisma.contribution.create({
      data: {
        sessionId: id,
        agentId: agent.id,
        code,
        lineCount: totalLines,
        round: session.currentRound,
        order,
        description: description || null,
      },
    });

    // Update the session's merged code
    await prisma.session.update({
      where: { id },
      data: { mergedCode: code, syntaxValid: true, syntaxError: null },
    });

    await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });
    await checkAndAdvancePhase(id);

    // Refetch session for updated round/phase info
    const updatedSession = await prisma.session.findUnique({ where: { id } });
    const health = checkGameHealth(code);

    return successResponse({
      contribution: {
        id: contribution.id,
        totalLines,
        round: contribution.round,
        order: contribution.order,
      },
      totalLines,
      lineLimit: session.lineLimit,
      linesAdded,
      perAgentBudget,
      currentRound: updatedSession?.currentRound ?? session.currentRound,
      maxRounds: session.maxRounds,
      phase: updatedSession?.phase ?? session.phase,
      gameHealth: health,
      warnings: [
        ...validation.warnings,
        ...health.issues,
      ],
    }, 201);
  } catch (error: any) {
    return errorResponse('Failed to contribute', error.message, 500);
  }
}
