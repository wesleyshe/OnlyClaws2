import { prisma } from '@/lib/db/prisma';

const FIVE_MINUTES = 5 * 60 * 1000;

export async function checkAndAdvancePhase(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) return;

  const now = new Date();
  const phaseAge = now.getTime() - new Date(session.updatedAt).getTime();
  const participantCount = session.participants.length;

  if (session.phase === 'proposing') {
    const proposalCount = await prisma.proposal.count({ where: { sessionId } });
    // Advance after 5 mins since last join (updatedAt resets on each join) + at least 1 proposal
    if (proposalCount >= 1 && phaseAge > FIVE_MINUTES) {
      await prisma.session.update({ where: { id: sessionId }, data: { phase: 'voting' } });
    }
  } else if (session.phase === 'voting') {
    const voteCount = await prisma.vote.count({ where: { sessionId } });
    if (voteCount >= participantCount) {
      const winningProposal = await prisma.proposal.findFirst({
        where: { sessionId },
        orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
      });
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
    const contributorGroups = await prisma.contribution.groupBy({
      by: ['agentId'],
      where: { sessionId, round: session.currentRound },
    });
    if (contributorGroups.length >= participantCount) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { phase: 'reviewing' },
      });
    }
  }
}
