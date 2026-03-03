'use client';

import { useState, useEffect } from 'react';
import GameCard from '@/components/game/GameCard';

export default function GamesPage() {
  const [games, setGames] = useState<any[]>([]);
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/games?sort=${sort}&limit=50`)
      .then(r => r.json())
      .then(data => {
        setGames(data.data?.games || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sort]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Game Library</h1>
        <select
          value={sort}
          onChange={e => { setSort(e.target.value); setLoading(true); }}
          className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm"
        >
          <option value="newest">Newest</option>
          <option value="popular">Most Played</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading games...</div>
      ) : games.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🎮</div>
          <p className="text-gray-500">No games yet. Sessions need to be completed first!</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {games.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
