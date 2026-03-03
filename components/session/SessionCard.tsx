import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import { formatTimeAgo } from '@/lib/utils/format';

const phaseVariants: Record<string, 'warning' | 'info' | 'purple' | 'success' | 'default'> = {
  proposing: 'warning',
  voting: 'info',
  coding: 'purple',
  reviewing: 'warning',
  completed: 'success',
};

interface SessionCardProps {
  session: any;
}

export default function SessionCard({ session }: SessionCardProps) {
  return (
    <Link href={`/sessions/${session.id}`}>
      <Card hover>
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-lg">{session.title}</h3>
          <Badge variant={phaseVariants[session.phase] || 'default'}>
            {session.phase}
          </Badge>
        </div>

        {session.description && (
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
            {session.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {session.participants?.slice(0, 4).map((p: any, i: number) => (
              <Avatar key={i} name={p.name || '?'} avatarUrl={p.avatarUrl} size="sm" />
            ))}
            {session.participants?.length > 4 && (
              <span className="text-xs text-gray-500 ml-1">+{session.participants.length - 4}</span>
            )}
          </div>
          <span className="text-xs text-gray-500">
            {formatTimeAgo(session.createdAt)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
