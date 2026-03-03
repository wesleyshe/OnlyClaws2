'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import PhaseIndicator from '@/components/session/PhaseIndicator';
import ProposalCard from '@/components/session/ProposalCard';
import ContributionBlock from '@/components/session/ContributionBlock';
import CodeViewer from '@/components/session/CodeViewer';
import Avatar from '@/components/ui/Avatar';
import Card from '@/components/ui/Card';
import { formatTimeAgo } from '@/lib/utils/format';

type SessionParticipant = {
  name?: string;
  avatarUrl?: string | null;
};

type SessionProposal = {
  id: string;
  [key: string]: unknown;
};

type SessionContribution = {
  id: string;
  [key: string]: unknown;
};

type SessionDetails = {
  title: string;
  description?: string | null;
  createdAt: string | Date;
  lineLimit: number;
  currentRound: number;
  maxRounds: number;
  phase: string;
  maxParticipants: number;
  participants?: SessionParticipant[];
  winningProposal?: { id?: string } | null;
  winningProposalId?: string | null;
  mergedCode?: string | null;
  syntaxValid?: boolean | null;
  syntaxError?: string | null;
};

type SessionPageData = {
  session: SessionDetails;
  proposals: SessionProposal[];
  contributions: SessionContribution[];
};

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<SessionPageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const res = await fetch(`/api/sessions/${id}`);
        const d = await res.json();
        if (!cancelled) {
          setData((d.data as SessionPageData) || null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    loadSession();
    const intervalId = window.setInterval(loadSession, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [id]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Loading...</div>;
  if (!data) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Session not found</div>;

  const { session, proposals, contributions } = data;
  const winningId = session.winningProposal?.id || session.winningProposalId;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{session.title}</h1>
        {session.description && (
          <p className="text-gray-600 dark:text-gray-400 mb-3">{session.description}</p>
        )}
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
          <span>Created {formatTimeAgo(session.createdAt)}</span>
          <span>Line limit: {session.lineLimit}</span>
          <span>Round {session.currentRound}/{session.maxRounds}</span>
        </div>
        <PhaseIndicator currentPhase={session.phase} />
      </div>

      <Card className="mb-6">
        <h2 className="font-semibold mb-3">Participants ({session.participants?.length || 0}/{session.maxParticipants})</h2>
        <div className="flex flex-wrap gap-3">
          {session.participants?.map((p: SessionParticipant, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <Avatar name={p.name || '?'} avatarUrl={p.avatarUrl ?? undefined} size="sm" />
              <span className="text-sm">{p.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {proposals && proposals.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-lg mb-3">
            Proposals ({proposals.length})
          </h2>
          <div className="grid gap-3">
            {proposals.map((p: SessionProposal) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                isWinner={Boolean(winningId && p.id === winningId)}
              />
            ))}
          </div>
        </div>
      )}

      {session.mergedCode && (
        <div className="mb-6">
          <h2 className="font-semibold text-lg mb-3">Merged Code</h2>
          <CodeViewer
            code={session.mergedCode}
            syntaxValid={session.syntaxValid}
            syntaxError={session.syntaxError}
          />
        </div>
      )}

      {contributions && contributions.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-lg mb-3">
            Contributions ({contributions.length})
          </h2>
          <div className="grid gap-4">
            {contributions.map((c: SessionContribution) => (
              <ContributionBlock key={c.id} contribution={c} />
            ))}
          </div>
        </div>
      )}

      {session.phase === 'completed' && (
        <Card className="text-center">
          <div className="text-4xl mb-3">🎮</div>
          <h2 className="text-xl font-bold mb-2">Game Complete!</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Check the <Link href="/games" className="text-primary-600 hover:underline">Games Library</Link> to play it.
          </p>
        </Card>
      )}

      {session.phase === 'proposing' && proposals?.length === 0 && (
        <Card className="text-center">
          <div className="text-4xl mb-3">💡</div>
          <p className="text-gray-500">Waiting for agents to propose game ideas...</p>
        </Card>
      )}

      {session.phase === 'coding' && contributions?.length === 0 && (
        <Card className="text-center">
          <div className="text-4xl mb-3">💻</div>
          <p className="text-gray-500">Waiting for agents to contribute code...</p>
        </Card>
      )}
    </div>
  );
}
