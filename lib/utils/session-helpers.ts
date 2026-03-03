import { prisma } from '@/lib/db/prisma';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SOLO_START_WAIT_MS =
  parsePositiveInt(process.env.SOLO_START_WAIT_SEC, parsePositiveInt(process.env.COLLAB_LOBBY_WAIT_SEC, 300)) *
  1000;
const GROUP_PROPOSING_WAIT_MS = parsePositiveInt(process.env.PROPOSING_WAIT_SEC, 180) * 1000;

function getLastParticipantChangeAt(participants: { joinedAt: Date }[]): Date {
  if (participants.length === 0) return new Date(0);
  return participants.reduce((latest, p) => (p.joinedAt > latest ? p.joinedAt : latest), participants[0].joinedAt);
}

export async function checkAndAdvancePhase(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) return;

  const now = new Date();
  const phaseAge = now.getTime() - new Date(session.updatedAt).getTime();
  const participantCount = session.participants.length;
  const participantStableAge = now.getTime() - getLastParticipantChangeAt(session.participants).getTime();

  if (session.phase === 'proposing') {
    const proposalCount = await prisma.proposal.count({ where: { sessionId } });
    if (participantCount <= 1) {
      if (proposalCount >= 1 && participantStableAge > SOLO_START_WAIT_MS) {
        await prisma.session.update({ where: { id: sessionId }, data: { phase: 'voting' } });
      }
      return;
    }

    // For collaborative rooms, move on when everyone proposed or safety timeout is reached.
    if (proposalCount >= participantCount || (proposalCount >= 1 && phaseAge > GROUP_PROPOSING_WAIT_MS)) {
      await prisma.session.update({ where: { id: sessionId }, data: { phase: 'voting' } });
    }
  } else if (session.phase === 'voting') {
    const voteCount = await prisma.vote.count({ where: { sessionId } });
    if (voteCount >= participantCount) {
      const rankedProposals = await prisma.proposal.findMany({
        where: { sessionId },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
      });
      const topVoteCount = rankedProposals[0]?.voteCount ?? 0;
      const topProposals = rankedProposals.filter((p) => p.voteCount === topVoteCount);
      const winningProposal =
        topProposals[Math.floor(Math.random() * topProposals.length)] ?? rankedProposals[0] ?? null;
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          phase: 'coding',
          winningProposalId: winningProposal?.id || null,
        },
      });
      // Delete losing proposals and their votes
      if (winningProposal) {
        await prisma.proposal.deleteMany({
          where: { sessionId, id: { not: winningProposal.id } },
        });
      }
    }
  } else if (session.phase === 'coding') {
    // Count distinct agents who contributed (or passed) in this round
    const contributorGroups = await prisma.contribution.groupBy({
      by: ['agentId'],
      where: { sessionId, round: session.currentRound },
    });
    if (contributorGroups.length >= participantCount) {
      if (session.currentRound < session.maxRounds) {
        // Move to next round
        await prisma.session.update({
          where: { id: sessionId },
          data: { currentRound: session.currentRound + 1 },
        });
      } else {
        // All rounds done → advance to reviewing
        await prisma.session.update({
          where: { id: sessionId },
          data: { phase: 'reviewing' },
        });
      }
    }
  } else if (session.phase === 'reviewing') {
    const reviews = await prisma.sessionReview.findMany({
      where: { sessionId, reviewRound: session.reviewRound },
      orderBy: { createdAt: 'asc' },
    });

    const hasRework = reviews.some((r) => r.decision === 'rework');
    if (hasRework) {
      await prisma.contribution.deleteMany({
        where: { sessionId, round: session.maxRounds },
      });
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          phase: 'coding',
          currentRound: session.maxRounds,
          reviewRound: session.reviewRound + 1,
        },
      });
    }
  }
}
