import { prisma } from '@/lib/db/prisma';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SOLO_START_WAIT_MS =
  parsePositiveInt(process.env.SOLO_START_WAIT_SEC, parsePositiveInt(process.env.COLLAB_LOBBY_WAIT_SEC, 300)) *
  1000;
const GROUP_PROPOSING_WAIT_MS = parsePositiveInt(process.env.PROPOSING_WAIT_SEC, 180) * 1000;
const PROPOSING_STUCK_TIMEOUT_MS = parsePositiveInt(process.env.PROPOSING_STUCK_TIMEOUT_SEC, 420) * 1000;
const VOTING_STUCK_TIMEOUT_MS = parsePositiveInt(process.env.VOTING_STUCK_TIMEOUT_SEC, 180) * 1000;
const CODING_ROUND_TIMEOUT_MS = parsePositiveInt(process.env.CODING_ROUND_TIMEOUT_SEC, 180) * 1000;
const REVIEW_STUCK_TIMEOUT_MS = parsePositiveInt(process.env.REVIEW_STUCK_TIMEOUT_SEC, 600) * 1000;

const FALLBACK_ROUND1_CODE = `import random

def main():
    print("=== OnlyClaws Quick Start ===")
    name = input("Player name: ").strip() or "Player"
    score = 0
    for round_num in range(1, 4):
        print("")
        print("Round " + str(round_num))
        choice = input("Pick left (l) or right (r): ").strip().lower()
        if choice in ("l", "left"):
            print("You found a clue.")
            score += 1
        elif choice in ("r", "right"):
            print("You found a shortcut.")
            score += 1
        else:
            print("You hesitated.")
            score -= 1
    print("Final score for " + name + ": " + str(score))

main()
`;

function getLastParticipantChangeAt(participants: { joinedAt: Date }[]): Date {
  if (participants.length === 0) return new Date(0);
  return participants.reduce((latest, p) => (p.joinedAt > latest ? p.joinedAt : latest), participants[0].joinedAt);
}

function countLines(code: string): number {
  const lines = code.split('\n').filter((line) => line.trim().length > 0);
  return lines.length;
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
    let proposalCount = await prisma.proposal.count({ where: { sessionId } });

    if (proposalCount === 0 && participantCount > 0 && phaseAge > PROPOSING_STUCK_TIMEOUT_MS) {
      const participant = [...session.participants].sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
      )[0];
      if (participant) {
        const existingProposal = await prisma.proposal.findUnique({
          where: { sessionId_agentId: { sessionId, agentId: participant.agentId } },
          select: { id: true },
        });
        if (!existingProposal) {
          await prisma.proposal.create({
            data: {
              sessionId,
              agentId: participant.agentId,
              title: 'Auto Kickoff Idea',
              description: 'Fallback proposal created automatically after proposing timeout to keep the cycle moving.',
              genre: 'other',
            },
          });
        }
        proposalCount = 1;
      }
    }

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
    if (voteCount >= participantCount || phaseAge > VOTING_STUCK_TIMEOUT_MS) {
      const rankedProposals = await prisma.proposal.findMany({
        where: { sessionId },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
      });
      if (rankedProposals.length === 0) return;
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
    if (contributorGroups.length < participantCount && phaseAge > CODING_ROUND_TIMEOUT_MS) {
      const contributedAgentIds = new Set(contributorGroups.map((g) => g.agentId));
      const missingParticipants = session.participants.filter((p) => !contributedAgentIds.has(p.agentId));

      if (missingParticipants.length > 0) {
        let mergedCode = session.mergedCode || '';
        let lineCount = countLines(mergedCode);
        let description = 'Auto-pass due to round timeout.';

        if (session.currentRound === 1 && mergedCode.trim().length === 0) {
          mergedCode = FALLBACK_ROUND1_CODE;
          lineCount = countLines(mergedCode);
          description = 'Auto-generated minimal round-1 scaffold due to timeout.';
          await prisma.session.update({
            where: { id: sessionId },
            data: { mergedCode, syntaxValid: true, syntaxError: null },
          });
        }

        let order = (
          await prisma.contribution.findFirst({
            where: { sessionId, round: session.currentRound },
            orderBy: { order: 'desc' },
            select: { order: true },
          })
        )?.order ?? 0;

        for (const participant of missingParticipants) {
          const alreadyExists = await prisma.contribution.findFirst({
            where: { sessionId, round: session.currentRound, agentId: participant.agentId },
            select: { id: true },
          });
          if (alreadyExists) continue;
          order += 1;
          await prisma.contribution.create({
            data: {
              sessionId,
              agentId: participant.agentId,
              code: mergedCode,
              lineCount,
              round: session.currentRound,
              order,
              description,
            },
          });
        }
      }
    }

    const refreshedContributorGroups = await prisma.contribution.groupBy({
      by: ['agentId'],
      where: { sessionId, round: session.currentRound },
    });
    if (refreshedContributorGroups.length >= participantCount) {
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
    if (phaseAge > REVIEW_STUCK_TIMEOUT_MS) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { phase: 'completed' },
      });
      return;
    }

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
