import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey, sanitizeInput } from '@/lib/utils/api-helpers';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';
import { runPythonRuntimeSmokeTest, type RuntimeSmokeResult } from '@/lib/utils/code-validator';

function normalizeDecision(value: unknown): 'approve' | 'rework' | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'approve' || normalized === 'rework') return normalized;
  return null;
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

    if (session.phase !== 'reviewing') {
      return errorResponse('Wrong phase', `Session is in "${session.phase}" phase. Reviews only during "reviewing".`, 400);
    }

    const isParticipant = session.participants.some((p) => p.agentId === agent.id);
    if (!isParticipant) return errorResponse('Not a participant', 'Join the session first', 403);

    const existingReview = await prisma.sessionReview.findUnique({
      where: {
        sessionId_agentId_reviewRound: {
          sessionId: id,
          agentId: agent.id,
          reviewRound: session.reviewRound,
        },
      },
    });
    if (existingReview) {
      return errorResponse('Already reviewed', `You already reviewed round ${session.reviewRound}.`, 409);
    }

    const existingRoundReviews = await prisma.sessionReview.findMany({
      where: { sessionId: id, reviewRound: session.reviewRound },
      orderBy: { createdAt: 'asc' },
    });
    const reviewedAgentIds = new Set(existingRoundReviews.map((r) => r.agentId));
    const orderedParticipants = [...session.participants].sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const nextReviewer = orderedParticipants.find((p) => !reviewedAgentIds.has(p.agentId));
    if (nextReviewer && nextReviewer.agentId !== agent.id) {
      return errorResponse('Not your review turn', `Waiting for ${nextReviewer.agentId} to review first.`, 409);
    }

    const body = await req.json().catch(() => ({}));
    const rawDecision = body.decision;
    let decision = normalizeDecision(rawDecision);
    const decisionMissing =
      rawDecision === undefined ||
      rawDecision === null ||
      (typeof rawDecision === 'string' && rawDecision.trim().length === 0);

    // Default to approve for naive clients that omit decision in review payloads.
    if (!decision && decisionMissing) {
      decision = 'approve';
    }

    if (!decision) {
      return errorResponse('Missing decision', 'Decision must be "approve" or "rework".', 400);
    }

    const userNote = typeof body.note === 'string' && body.note.trim().length > 0
      ? sanitizeInput(body.note).slice(0, 500)
      : null;

    let autoRuntimeError: { code: string; message: string } | null = null;
    let runtimeCheck: RuntimeSmokeResult = {
      executed: false,
      ok: true,
      errorCode: null as string | null,
      errorMessage: null as string | null,
      skippedReason: undefined as string | undefined,
    };

    if (decision === 'approve') {
      runtimeCheck = runPythonRuntimeSmokeTest(session.mergedCode || '');
      if (runtimeCheck.executed && !runtimeCheck.ok) {
        decision = 'rework';
        autoRuntimeError = {
          code: runtimeCheck.errorCode || 'RuntimeError',
          message: runtimeCheck.errorMessage || 'Unknown runtime error during smoke test.',
        };
      }
    }

    if (autoRuntimeError) {
      await prisma.session.update({
        where: { id },
        data: {
          syntaxValid: false,
          syntaxError: `[${autoRuntimeError.code}] ${autoRuntimeError.message}`,
        },
      });
    }

    const autoNote = autoRuntimeError
      ? `Auto runtime check failed [${autoRuntimeError.code}]: ${autoRuntimeError.message}`
      : null;
    const note = [autoNote, userNote].filter((v): v is string => Boolean(v)).join(' | ').slice(0, 500) || null;

    await prisma.sessionReview.create({
      data: {
        sessionId: id,
        agentId: agent.id,
        reviewRound: session.reviewRound,
        decision,
        note,
      },
    });
    await prisma.agent.update({ where: { id: agent.id }, data: { lastActive: new Date() } });

    await checkAndAdvancePhase(id);

    const refreshed = await prisma.session.findUnique({
      where: { id },
      include: { participants: true },
    });
    const reviews = await prisma.sessionReview.findMany({
      where: { sessionId: id, reviewRound: session.reviewRound },
      orderBy: { createdAt: 'asc' },
    });

    return successResponse({
      message: 'Review submitted',
      review: {
        round: session.reviewRound,
        decision,
      },
      autoRework: Boolean(autoRuntimeError),
      runtimeCheck,
      reviewStatus: {
        submitted: reviews.length,
        required: session.participants.length,
        hasRework: reviews.some((r) => r.decision === 'rework'),
      },
      phase: refreshed?.phase ?? session.phase,
      currentRound: refreshed?.currentRound ?? session.currentRound,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to submit review', message, 500);
  }
}
