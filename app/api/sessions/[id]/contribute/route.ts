import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';
import { validatePythonCode, countLines, checkGameHealth } from '@/lib/utils/code-validator';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

function isTimeoutAutoContributionDescription(description: string | null | undefined): boolean {
  return (
    description === 'Auto-pass due to round timeout.' ||
    description === 'Auto-generated minimal round-1 scaffold due to timeout.'
  );
}

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
      select: { id: true, order: true, description: true },
    });
    const canReplaceTimeoutAutofill =
      !!alreadyContributed && isTimeoutAutoContributionDescription(alreadyContributed.description);
    if (alreadyContributed && !canReplaceTimeoutAutofill) {
      return errorResponse(
        'Already contributed this round',
        `You already submitted code for round ${session.currentRound}. Wait for other agents to finish this round.`,
        400
      );
    }

    const roundContributions = await prisma.contribution.findMany({
      where: { sessionId: id, round: session.currentRound },
      select: { agentId: true, order: true },
      orderBy: { order: 'asc' },
    });
    const contributedAgentIds = new Set(roundContributions.map((c) => c.agentId));
    const orderedParticipants = [...session.participants].sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const nextContributor = orderedParticipants.find((p) => !contributedAgentIds.has(p.agentId));
    if (nextContributor && nextContributor.agentId !== agent.id) {
      return errorResponse(
        'Not your coding turn',
        'Another participant must contribute first this round.',
        409
      );
    }

    const body = await req.json();
    const { code, description, pass } = body;
    const previousLines = countLines(session.mergedCode || '');

    // Handle pass — agent is happy with the current code
    if (pass === true) {
      if (session.currentRound === 1) {
        return errorResponse(
          'Pass not allowed in round 1',
          'Round 1 requires a code submission. Submit a minimal runnable game scaffold if needed.',
          400
        );
      }

      if (canReplaceTimeoutAutofill && alreadyContributed) {
        await prisma.contribution.update({
          where: { id: alreadyContributed.id },
          data: {
            code: session.mergedCode || '',
            lineCount: previousLines,
            description: 'Passed — no changes',
          },
        });
      } else {
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
      }

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
      return errorResponse(
        'Missing code',
        'Submit the FULL game code in the "code" field, or send {"pass": true} to skip this round (rounds 2/3 only).',
        400
      );
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

    const totalLines = countLines(code);
    const linesAdded = totalLines - previousLines;

    if (session.currentRound === 1) {
      const baselineCode = (session.mergedCode || '').trim();
      if (totalLines <= 0) {
        return errorResponse(
          'Round 1 requires runnable code',
          'Round 1 submission must include at least one non-comment code line.',
          400
        );
      }
      if (code.trim() === baselineCode) {
        return errorResponse(
          'No changes in round 1',
          'Round 1 requires a real code change compared to current merged code.',
          400
        );
      }
    }

    // Determine order
    let contribution: { id: string; round: number; order: number };
    if (canReplaceTimeoutAutofill && alreadyContributed) {
      contribution = await prisma.contribution.update({
        where: { id: alreadyContributed.id },
        data: {
          code,
          lineCount: totalLines,
          description: description || null,
        },
        select: { id: true, round: true, order: true },
      });
    } else {
      const lastContribution = await prisma.contribution.findFirst({
        where: { sessionId: id, round: session.currentRound },
        orderBy: { order: 'desc' },
      });
      const order = lastContribution ? lastContribution.order + 1 : 1;

      // Store contribution
      contribution = await prisma.contribution.create({
        data: {
          sessionId: id,
          agentId: agent.id,
          code,
          lineCount: totalLines,
          round: session.currentRound,
          order,
          description: description || null,
        },
        select: { id: true, round: true, order: true },
      });
    }

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
      perAgentBudget: null,
      currentRound: updatedSession?.currentRound ?? session.currentRound,
      maxRounds: session.maxRounds,
      phase: updatedSession?.phase ?? session.phase,
      gameHealth: health,
      warnings: [
        ...validation.warnings,
        ...health.issues,
      ],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to contribute', message, 500);
  }
}
