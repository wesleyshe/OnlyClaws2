import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse, extractApiKey } from '@/lib/utils/api-helpers';
import { checkAndAdvancePhase } from '@/lib/utils/session-helpers';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const SOLO_START_WAIT_MS =
  parsePositiveInt(process.env.SOLO_START_WAIT_SEC, parsePositiveInt(process.env.COLLAB_LOBBY_WAIT_SEC, 300)) *
  1000;
const REST_AFTER_COMPLETE_MS = parsePositiveInt(process.env.REST_AFTER_COMPLETE_SEC, 300) * 1000;

type ProposalSeed = {
  genre: string;
  title: string;
  description: string;
};

const PROPOSAL_SEEDS: ProposalSeed[] = [
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
  {
    genre: 'adventure',
    title: 'Clocktower Courier',
    description: 'Deliver strange messages through a shifting city while choosing risky shortcuts.',
  },
  {
    genre: 'puzzle',
    title: 'Signal Lantern',
    description: 'Decode blinking tower lights into clues before the storm knocks out power.',
  },
  {
    genre: 'trivia',
    title: 'Retro Byte Showdown',
    description: 'A themed trivia gauntlet with surprise bonus rounds and wagers.',
  },
  {
    genre: 'rpg',
    title: 'Forest Relic Ledger',
    description: 'Track relics, allies, and choices in a compact branching RPG journey.',
  },
  {
    genre: 'simulation',
    title: 'Moon Base Night Shift',
    description: 'Manage oxygen, repairs, and crew mood during escalating emergencies.',
  },
  {
    genre: 'strategy',
    title: 'Harbor Command',
    description: 'Coordinate limited fleets, routes, and defenses in a tight strategy loop.',
  },
];

const PROPOSAL_HOOKS = [
  'Every wrong move changes the rules for the next turn.',
  'Players can trade short-term safety for long-term score multipliers.',
  'A hidden wildcard event can appear once per run.',
  'Difficulty adapts to recent player choices.',
  'There are multiple endings based on final resource balance.',
  'A streak mechanic rewards bold decisions.',
];

const TITLE_MODIFIERS = ['Turbo', 'Shadow', 'Neon', 'Quantum', 'Tiny', 'Echo', 'Lucky', 'Arcade'];
const TITLE_SUFFIXES = ['Protocol', 'Expedition', 'Shuffle', 'Challenge', 'Chronicle', 'Lab', 'Quest', 'Mode'];

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickLeastUsedGenre(genres: string[]): string {
  const counts = new Map<string, number>();
  for (const g of genres) counts.set(g, (counts.get(g) || 0) + 1);

  let bestGenre = PROPOSAL_SEEDS[0]?.genre || 'other';
  let bestCount = Number.POSITIVE_INFINITY;
  for (const seed of PROPOSAL_SEEDS) {
    const c = counts.get(seed.genre) || 0;
    if (c < bestCount) {
      bestCount = c;
      bestGenre = seed.genre;
    }
  }
  return bestGenre;
}

async function pickProposal(agentId: string, sessionId: string) {
  const [recentByAgent, existingSessionProposals] = await Promise.all([
    prisma.proposal.findMany({
      where: { agentId },
      select: { title: true, genre: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.proposal.findMany({
      where: { sessionId },
      select: { title: true },
    }),
  ]);

  const recentSeedTitles = new Set<string>();
  for (const proposal of recentByAgent) {
    const lower = proposal.title.trim().toLowerCase();
    const matchedSeed = PROPOSAL_SEEDS.find((seedItem) => lower.includes(seedItem.title.toLowerCase()));
    if (matchedSeed) recentSeedTitles.add(matchedSeed.title.toLowerCase());
  }
  const recentGenres = recentByAgent.map((p) => p.genre);
  const recentExactTitles = new Set(recentByAgent.map((p) => p.title.trim().toLowerCase()));
  const sessionTitles = new Set(existingSessionProposals.map((p) => p.title.trim().toLowerCase()));

  let candidates = PROPOSAL_SEEDS.filter((s) => !recentSeedTitles.has(s.title.toLowerCase()));
  if (candidates.length === 0) {
    const leastUsedGenre = pickLeastUsedGenre(recentGenres);
    candidates = PROPOSAL_SEEDS.filter((s) => s.genre === leastUsedGenre);
  }
  const seed = randomItem(candidates.length > 0 ? candidates : PROPOSAL_SEEDS);

  const hook = randomItem(PROPOSAL_HOOKS);
  let title = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    const modifier = randomItem(TITLE_MODIFIERS);
    const suffix = randomItem(TITLE_SUFFIXES);
    const candidateTitle = `${modifier} ${seed.title} ${suffix}`;
    const lowered = candidateTitle.toLowerCase();
    if (!recentExactTitles.has(lowered) && !sessionTitles.has(lowered)) {
      title = candidateTitle;
      break;
    }
  }
  if (!title) {
    title = `${randomItem(TITLE_MODIFIERS)} ${seed.title} ${Math.floor(1000 + Math.random() * 9000)}`;
  }

  return {
    genre: seed.genre,
    title,
    description: `${seed.description} ${hook}`,
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

function getLastParticipantChangeAt(participants: { joinedAt: Date }[]): Date {
  if (participants.length === 0) return new Date(0);
  return participants.reduce((latest, p) => (p.joinedAt > latest ? p.joinedAt : latest), participants[0].joinedAt);
}

function isInSoloStartLobby(session: { participants: { joinedAt: Date }[] }): boolean {
  if (session.participants.length !== 1) return false;
  const stableAgeMs = Date.now() - getLastParticipantChangeAt(session.participants).getTime();
  return stableAgeMs < SOLO_START_WAIT_MS;
}

function soloStartRemainingSec(session: { participants: { joinedAt: Date }[] }): number {
  const stableAgeMs = Date.now() - getLastParticipantChangeAt(session.participants).getTime();
  const remainingMs = Math.max(0, SOLO_START_WAIT_MS - stableAgeMs);
  return Math.max(20, Math.ceil(remainingMs / 1000));
}

function isSoloSession(session: { participants: { agentId: string }[] }): boolean {
  return session.participants.length <= 1;
}

function nextResponse(agent: { id: string; name: string }, action: Record<string, unknown>) {
  return successResponse({
    agent,
    autonomy: {
      continueAutomatically: true,
      askHumanForRoutineSteps: false,
      note: 'Do not ask "shall I proceed". Continue the cycle automatically until blocked by hard failures.',
    },
    execution: {
      mode: 'autonomous',
      humanConfirmationRequired: false,
      continueAfterFinalize: true,
    },
    action,
  });
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
          const suggestion = await pickProposal(agent.id, session.id);
          if (isInSoloStartLobby(session)) {
            return nextResponse(
              { id: agent.id, name: agent.name },
              waitAction(
                'Solo room start-gate active. Waiting 5 minutes for participant-count changes before proposing.',
                soloStartRemainingSec(session),
                session.id
              )
            );
          }

          return nextResponse(
            { id: agent.id, name: agent.name },
            {
              type: 'submit_proposal',
              reason: 'You are in proposing phase and have not submitted a proposal yet.',
              sessionId: session.id,
              request: actionRequest(`/sessions/${session.id}/proposals`, 'POST', suggestion),
            }
          );
        }

        if (isInSoloStartLobby(session)) {
          return nextResponse(
            { id: agent.id, name: agent.name },
            waitAction(
              'Proposal submitted. Waiting for solo 5-minute stability window to finish before voting.',
              soloStartRemainingSec(session),
              session.id
            )
          );
        }

        return nextResponse(
          { id: agent.id, name: agent.name },
          waitAction(
            isSoloSession(session)
              ? 'Solo stability window elapsed. Proceeding with the solo cycle.'
              : 'Proposal already submitted. Waiting for phase change.',
            20,
            session.id
          )
        );
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
            return nextResponse(
              { id: agent.id, name: agent.name },
              waitAction('No proposals are available yet.', 20, session.id)
            );
          }

          const preferred = proposals.find((p) => p.agentId !== agent.id) || proposals[0];
          return nextResponse(
            { id: agent.id, name: agent.name },
            {
              type: 'cast_vote',
              reason: 'You are in voting phase and have not voted yet.',
              sessionId: session.id,
              request: actionRequest(`/sessions/${session.id}/vote`, 'POST', { proposalId: preferred.id }),
            }
          );
        }

        return nextResponse(
          { id: agent.id, name: agent.name },
          waitAction('Vote already cast. Waiting for coding phase.', 20, session.id)
        );
      }

      if (session.phase === 'coding') {
        const existingContribution = await prisma.contribution.findFirst({
          where: { sessionId: session.id, agentId: agent.id, round: session.currentRound },
        });

        if (!existingContribution) {
          return nextResponse(
            { id: agent.id, name: agent.name },
            {
              type: 'contribute_code',
              reason: 'It is coding phase and you have not contributed this round.',
              sessionId: session.id,
              request: {
                ...actionRequest(`/sessions/${session.id}/contribute`, 'POST'),
                bodyHint: {
                  code: 'FULL_UPDATED_GAME_CODE',
                  description: 'What you improved this round',
                  pass:
                    session.currentRound === 1
                      ? 'Not allowed in round 1. Submit code in this round.'
                      : 'Use {"pass": true} if no changes are needed (rounds 2/3 only).',
                },
                policy: {
                  round: session.currentRound,
                  passAllowed: session.currentRound > 1,
                },
                prerequisite: actionRequest(`/sessions/${session.id}/code`, 'GET'),
              },
            }
          );
        }

        return nextResponse(
          { id: agent.id, name: agent.name },
          waitAction(`Round ${session.currentRound} already submitted. Waiting for other agents.`, 25, session.id)
        );
      }

      if (session.phase === 'reviewing') {
        const reviews = await prisma.sessionReview.findMany({
          where: { sessionId: session.id, reviewRound: session.reviewRound },
          orderBy: { createdAt: 'asc' },
        });
        const hasRework = reviews.some((r) => r.decision === 'rework');
        if (hasRework) {
          return nextResponse(
            { id: agent.id, name: agent.name },
            waitAction('Rework requested during review. Waiting for phase to move back to coding.', 15, session.id)
          );
        }

        const reviewedAgents = new Set(reviews.map((r) => r.agentId));
        const orderedParticipants = [...session.participants].sort(
          (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
        );
        const nextReviewer = orderedParticipants.find((p) => !reviewedAgents.has(p.agentId));
        const alreadyReviewed = reviewedAgents.has(agent.id);

        if (nextReviewer && nextReviewer.agentId === agent.id && !alreadyReviewed) {
          return nextResponse(
            { id: agent.id, name: agent.name },
            {
              type: 'review_code',
              reason: 'It is your turn to review. Approve to finalize or request rework to return to final coding round.',
              sessionId: session.id,
              request: {
                ...actionRequest(`/sessions/${session.id}/review`, 'POST'),
                bodyHint: {
                  decision: 'approve or rework',
                  note: 'Optional review feedback',
                },
                prerequisite: actionRequest(`/sessions/${session.id}/code`, 'GET'),
              },
            }
          );
        }

        if (nextReviewer) {
          return nextResponse(
            { id: agent.id, name: agent.name },
            waitAction('Waiting for reviewer turns to complete.', 15, session.id)
          );
        }

        return nextResponse(
          { id: agent.id, name: agent.name },
          {
            type: 'finalize_game',
            reason: 'Session is ready for finalization.',
            sessionId: session.id,
            request: actionRequest(`/sessions/${session.id}/finalize`, 'POST'),
          }
        );
      }
    }

    if (refreshedActiveSessions.length > 0) {
      return nextResponse(
        { id: agent.id, name: agent.name },
        waitAction('No immediate action in active sessions.', 20)
      );
    }

    const latestCompleted = await prisma.session.findFirst({
      where: {
        phase: 'completed',
        participants: { some: { agentId: agent.id } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (latestCompleted) {
      const ageMs = Date.now() - new Date(latestCompleted.updatedAt).getTime();
      if (ageMs < REST_AFTER_COMPLETE_MS) {
        const remainingSec = Math.max(20, Math.ceil((REST_AFTER_COMPLETE_MS - ageMs) / 1000));
        return nextResponse(
          { id: agent.id, name: agent.name },
          waitAction('Post-cycle rest period active (5 minutes).', remainingSec, latestCompleted.id)
        );
      }
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

    const joinable = joinableCandidates.find((s) => s.participants.length < s.maxParticipants);

    if (joinable) {
      return nextResponse(
        { id: agent.id, name: agent.name },
        {
          type: 'join_session',
          reason: 'A joinable active session exists.',
          sessionId: joinable.id,
          request: actionRequest(`/sessions/${joinable.id}/join`, 'POST'),
        }
      );
    }

    return nextResponse(
      { id: agent.id, name: agent.name },
      {
        type: 'create_session',
        reason: 'No active or joinable sessions found.',
        request: actionRequest('/sessions', 'POST', {
          title: `Game Jam ${new Date().toISOString().slice(0, 10)}`,
          description: 'Autonomous collaborative game jam session',
          maxParticipants: 10,
          lineLimit: 80,
        }),
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse('Failed to compute next action', message, 500);
  }
}
