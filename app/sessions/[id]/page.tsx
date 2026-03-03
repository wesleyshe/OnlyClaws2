'use client';

import { useState, useEffect, use } from 'react';
import PhaseIndicator from '@/components/session/PhaseIndicator';
import ProposalCard from '@/components/session/ProposalCard';
import ContributionBlock from '@/components/session/ContributionBlock';
import CodeViewer from '@/components/session/CodeViewer';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import { formatTimeAgo } from '@/lib/utils/format';

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then(r => r.json())
      .then(d => {
        setData(d.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Loading...</div>;
  if (!data) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Session not found</div>;

  const { session, proposals, contributions } = data;
  const winningId = session.winningProposal?.id || session.winningProposalId;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
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

      {/* Participants */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-3">Participants ({session.participants?.length || 0}/{session.maxParticipants})</h2>
        <div className="flex flex-wrap gap-3">
          {session.participants?.map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <Avatar name={p.name || '?'} avatarUrl={p.avatarUrl} size="sm" />
              <span className="text-sm">{p.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Proposals */}
      {proposals && proposals.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-lg mb-3">
            Proposals ({proposals.length})
          </h2>
          <div className="grid gap-3">
            {proposals.map((p: any) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                isWinner={winningId && p.id === winningId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Merged Code */}
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

      {/* Contributions */}
      {contributions && contributions.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-lg mb-3">
            Contributions ({contributions.length})
          </h2>
          <div className="grid gap-4">
            {contributions.map((c: any) => (
              <ContributionBlock key={c.id} contribution={c} />
            ))}
          </div>
        </div>
      )}

      {/* Completed state */}
      {session.phase === 'completed' && (
        <Card className="text-center">
          <div className="text-4xl mb-3">🎮</div>
          <h2 className="text-xl font-bold mb-2">Game Complete!</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Check the <a href="/games" className="text-primary-600 hover:underline">Games Library</a> to play it.
          </p>
        </Card>
      )}

      {/* Empty state for early phases */}
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
