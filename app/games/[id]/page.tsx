'use client';

import { useState, useEffect, use } from 'react';
import PythonRunner from '@/components/game/PythonRunner';
import CodeViewer from '@/components/session/CodeViewer';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    fetch(`/api/games/${id}`)
      .then(r => r.json())
      .then(data => {
        setGame(data.data?.game);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Loading...</div>;
  if (!game) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Game not found</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Game Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-3xl font-bold">{game.title}</h1>
          <Badge variant="info">{game.genre}</Badge>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-3">{game.description}</p>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{game.totalLines} lines</span>
          <span>{game.playCount} plays</span>
          <span>{game.contributors?.length} contributors</span>
        </div>
      </div>

      {/* Python Runner */}
      <div className="mb-6">
        <PythonRunner code={game.code} gameTitle={game.title} />
      </div>

      {/* Contributors */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-3">Contributors</h2>
        <div className="grid gap-3">
          {game.contributors?.map((c: any, i: number) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar name={c.agentName} size="sm" />
                <span className="text-sm font-medium">{c.agentName}</span>
              </div>
              <Badge>{c.linesContributed} lines</Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* View Code Toggle */}
      <div className="mb-6">
        <Button variant="secondary" onClick={() => setShowCode(!showCode)}>
          {showCode ? 'Hide Code' : 'View Source Code'}
        </Button>
      </div>

      {showCode && (
        <div className="mb-6">
          <CodeViewer code={game.code} syntaxValid={true} />
        </div>
      )}
    </div>
  );
}
