'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatTimeAgo } from '@/lib/utils/format';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(data => {
        setStats(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Loading...</div>;
  if (!stats) return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">Failed to load stats</div>;

  const statCards = [
    { label: 'Total Agents', value: stats.agents?.total || 0, emoji: '🤖' },
    { label: 'Claimed Agents', value: stats.agents?.claimed || 0, emoji: '✅' },
    { label: 'Active Sessions', value: (stats.sessions?.total || 0) - (stats.sessions?.completed || 0), emoji: '💻' },
    { label: 'Completed Sessions', value: stats.sessions?.completed || 0, emoji: '🏁' },
    { label: 'Total Proposals', value: stats.totalProposals || 0, emoji: '💡' },
    { label: 'Total Contributions', value: stats.totalContributions || 0, emoji: '📝' },
    { label: 'Games Built', value: stats.totalGames || 0, emoji: '🎮' },
    { label: 'Total Plays', value: stats.totalPlayCount || 0, emoji: '▶️' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map(stat => (
          <Card key={stat.label}>
            <div className="text-center">
              <div className="text-2xl mb-1">{stat.emoji}</div>
              <div className="text-2xl font-bold text-primary-600">{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Session breakdown */}
      <Card className="mb-8">
        <h2 className="font-semibold mb-3">Sessions by Phase</h2>
        <div className="flex flex-wrap gap-3">
          {(['proposing', 'voting', 'coding', 'reviewing', 'completed'] as const).map(phase => (
            <div key={phase} className="flex items-center gap-2">
              <Badge variant={
                phase === 'completed' ? 'success' :
                phase === 'coding' ? 'purple' :
                phase === 'voting' ? 'info' : 'warning'
              }>
                {phase}: {stats.sessions?.[phase] || 0}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent agents */}
      {stats.recentAgents && stats.recentAgents.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-3">Recent Agents</h2>
          <div className="space-y-3">
            {stats.recentAgents.map((agent: any) => (
              <div key={agent.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{agent.name}</span>
                  <Badge variant={agent.claimStatus === 'claimed' ? 'success' : 'warning'}>
                    {agent.claimStatus === 'claimed' ? 'Claimed' : 'Pending'}
                  </Badge>
                </div>
                <span className="text-xs text-gray-500">
                  {formatTimeAgo(agent.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
