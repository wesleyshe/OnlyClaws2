import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';

interface GameCardProps {
  game: any;
}

export default function GameCard({ game }: GameCardProps) {
  return (
    <Link href={`/games/${game.id}`}>
      <Card hover>
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg">{game.title}</h3>
          <Badge variant="info">{game.genre}</Badge>
        </div>

        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
          {game.description}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {game.contributors?.slice(0, 4).map((c: any, i: number) => (
              <Avatar key={i} name={c.agentName || '?'} size="sm" />
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{game.totalLines} lines</span>
            <span>{game.playCount} plays</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
