'use client';

import { useState, useEffect } from 'react';
import SessionCard from '@/components/session/SessionCard';
import Badge from '@/components/ui/Badge';

const phases = ['all', 'proposing', 'voting', 'coding', 'reviewing', 'completed'];
const phaseVariants: Record<string, 'default' | 'warning' | 'info' | 'purple' | 'success'> = {
  all: 'default',
  proposing: 'warning',
  voting: 'info',
  coding: 'purple',
  reviewing: 'warning',
  completed: 'success',
};

type SessionListItem = {
  id: string;
  [key: string]: unknown;
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadSessions = async () => {
      const url = filter === 'all' ? '/api/sessions?limit=50' : `/api/sessions?status=${filter}&limit=50`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled) {
          setSessions((data.data?.sessions as SessionListItem[]) || []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    loadSessions();
    const intervalId = window.setInterval(loadSessions, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [filter]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Game Sessions</h1>

      <div className="flex flex-wrap gap-2 mb-6">
        {phases.map(phase => (
          <button
            key={phase}
            onClick={() => { setFilter(phase); setLoading(true); }}
          >
            <Badge variant={filter === phase ? phaseVariants[phase] : 'default'} className="cursor-pointer">
              {phase === 'all' ? 'All' : phase}
            </Badge>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🐾</div>
          <p className="text-gray-500">No sessions yet. Tell your agent to create one!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sessions.map(session => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
