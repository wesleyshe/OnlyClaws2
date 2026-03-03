import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

const PROPOSAL_SEEDS = [
  {
    genre: 'adventure',
    title: 'Midnight Station Escape',
    description: 'A text adventure where the player solves clues to escape a looping train station.',
  },
  {
    genre: 'puzzle',
    title: 'Codebreaker Alley',
    description: 'A puzzle game with layered riddles, pattern matching, and escalating difficulty.',
  },
  {
    genre: 'trivia',
    title: 'Arcade Quiz Rush',
    description: 'A fast trivia challenge with streak bonuses and category choices.',
  },
  {
    genre: 'rpg',
    title: 'Pocket Dungeon Logbook',
    description: 'A lightweight RPG where choices branch into different encounters and endings.',
  },
  {
    genre: 'simulation',
    title: 'Tiny Cafe Shift',
    description: 'A management simulation where the player balances time, inventory, and customer mood.',
  },
  {
    genre: 'strategy',
    title: 'Outpost Tactician',
    description: 'A turn-based strategy game about allocating resources under pressure.',
  },
];

function pickProposal(agentName: string) {
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    hash = (hash * 31 + agentName.charCodeAt(i)) >>> 0;
  }
  const seed = PROPOSAL_SEEDS[hash % PROPOSAL_SEEDS.length];
  return {
    ...seed,
    title: `${seed.title} ${agentName}`,
  };
}

function waitAction(reason: string, pollAfterSec: number, sessionId?: string) {
  return {
    type: 'wait',
    reason,
    pollAfterSec,
    sessionId: sessionId || null,
  };
}

function getBaseUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function actionRequest(path: string, method: 'GET' | 'POST', body?: unknown) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const apiPath = normalizedPath.startsWith('/api/') ? normalizedPath.slice(4) : normalizedPath;
  const apiBase = `${getBaseUrl()}/api`;
  return {
    method,
    // Canonical fields:
    path: apiPath,                   // e.g. "/sessions/123/join"
    url: `${apiBase}${apiPath}`,     // e.g. "https://.../api/sessions/123/join"
    // Backward compatibility field for older clients:
    endpoint: `/api${apiPath}`,
    body: body ?? {},
  };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = extractApiKey(req.headers.get('authorization'));
    if (!apiKey) {
      return errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY', 401);
    }

    const agent = await prisma.agent.findUnique({ where: { apiKey } });
    if (!agent) return errorResponse('Invalid API key', 'Agent not found', 401);

    await prisma.agent.update({
      where: { id: agent.id },
      data: { lastActive: new Date() },
    });

    const activeSessions = await prisma.session.findMany({
      where: {
        phase: { in: ['proposing', 'voting', 'coding', 'reviewing'] },
        participants: { some: { agentId: agent.id } },
      },
      include: {
        participants: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    // Keep phase progression moving even when only autonomous agents are polling /agents/next.
    for (const session of activeSessions) {
      await checkAndAdvancePhase(session.id);
    }

    const refreshedActiveSessions = await prisma.session.findMany({
      where: {
        phase: { in: ['proposing', 'voting', 'coding', 'reviewing'] },
        participants: { some: { agentId: agent.id } },
      },
      include: {
        participants: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    for (const session of refreshedActiveSessions) {
      if (session.phase === 'proposing') {
        const existingProposal = await prisma.proposal.findUnique({
          where: { sessionId_agentId: { sessionId: session.id, agentId: agent.id } },
        });

        if (!existingProposal) {
          const suggestion = pickProposal(agent.name);
          return successResponse({
            agent: { id: agent.id, name: agent.name },
            action: {
              type: 'submit_proposal',
              reason: 'You are in proposing phase and have not submitted a proposal yet.',
              sessionId: session.id,
              request: actionRequest(`/sessions/${session.id}/proposals`, 'POST', suggestion),
            },
          });
        }

        return successResponse({
          agent: { id: agent.id, name: agent.name },
          action: waitAction('Proposal already submitted. Waiting for phase change.', 20, session.id),
        });
      }

      if (session.phase === 'voting') {
        const existingVote = await prisma.vote.findUnique({
          where: { sessionId_agentId: { sessionId: session.id, agentId: agent.id } },
        });

        if (!existingVote) {
          const proposals = await prisma.proposal.findMany({
            where: { sessionId: session.id },
            orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
          });

          if (proposals.length === 0) {
            return successResponse({
              agent: { id: agent.id, name: agent.name },
              action: waitAction('No proposals are available yet.', 20, session.id),
            });
          }

          const preferred = proposals.find((p) => p.agentId !== agent.id) || proposals[0];
          return successResponse({
            agent: { id: agent.id, name: agent.name },
            action: {
              type: 'cast_vote',
              reason: 'You are in voting phase and have not voted yet.',
              sessionId: session.id,
              request: actionRequest(`/sessions/${session.id}/vote`, 'POST', { proposalId: preferred.id }),
            },
          });
        }

        return successResponse({
          agent: { id: agent.id, name: agent.name },
          action: waitAction('Vote already cast. Waiting for coding phase.', 20, session.id),
        });
      }

      if (session.phase === 'coding') {
        const existingContribution = await prisma.contribution.findFirst({
          where: { sessionId: session.id, agentId: agent.id, round: session.currentRound },
        });

        if (!existingContribution) {
          return successResponse({
            agent: { id: agent.id, name: agent.name },
            action: {
              type: 'contribute_code',
              reason: 'It is coding phase and you have not contributed this round.',
              sessionId: session.id,
              request: {
                ...actionRequest(`/sessions/${session.id}/contribute`, 'POST'),
                bodyHint: {
                  code: 'FULL_UPDATED_GAME_CODE',
                  description: 'What you improved this round',
                  pass: 'Use {"pass": true} if no changes are needed',
                },
                prerequisite: actionRequest(`/sessions/${session.id}/code`, 'GET'),
              },
            },
          });
        }

        return successResponse({
          agent: { id: agent.id, name: agent.name },
          action: waitAction(`Round ${session.currentRound} already submitted. Waiting for other agents.`, 25, session.id),
        });
      }

      if (session.phase === 'reviewing') {
        return successResponse({
          agent: { id: agent.id, name: agent.name },
          action: {
            type: 'finalize_game',
            reason: 'Session is ready for finalization.',
            sessionId: session.id,
            request: actionRequest(`/sessions/${session.id}/finalize`, 'POST'),
          },
        });
      }
    }

    if (refreshedActiveSessions.length > 0) {
      return successResponse({
        agent: { id: agent.id, name: agent.name },
        action: waitAction('No immediate action in active sessions.', 20),
      });
    }

    const joinableCandidates = await prisma.session.findMany({
      where: {
        phase: { in: ['proposing', 'voting'] },
        participants: { none: { agentId: agent.id } },
      },
      include: { participants: true },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });

    const joinable =
      joinableCandidates.find((s) => s.phase === 'proposing' && s.participants.length < s.maxParticipants) ||
      joinableCandidates.find((s) => s.phase === 'voting' && s.participants.length < s.maxParticipants);

    if (joinable) {
      return successResponse({
        agent: { id: agent.id, name: agent.name },
        action: {
          type: 'join_session',
          reason: 'A joinable active session exists.',
          sessionId: joinable.id,
          request: actionRequest(`/sessions/${joinable.id}/join`, 'POST'),
        },
      });
    }

    return successResponse({
      agent: { id: agent.id, name: agent.name },
      action: {
        type: 'create_session',
        reason: 'No active or joinable sessions found.',
        request: actionRequest('/sessions', 'POST', {
          title: `Game Jam ${new Date().toISOString().slice(0, 10)}`,
          description: 'Autonomous collaborative game jam session',
          maxParticipants: 10,
          lineLimit: 80,
        }),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to compute next action', message, 500);
  }
}
