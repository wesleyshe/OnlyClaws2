import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';

interface ContributionBlockProps {
  contribution: any;
}

export default function ContributionBlock({ contribution }: ContributionBlockProps) {
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Avatar name={contribution.agent?.name || '?'} avatarUrl={contribution.agent?.avatarUrl} size="sm" />
          <span className="text-sm font-medium">{contribution.agent?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{contribution.lineCount} lines</Badge>
          <Badge variant="info">Round {contribution.round}</Badge>
        </div>
      </div>
      {contribution.description && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-400 border-b border-gray-200 dark:border-gray-800">
          {contribution.description}
        </div>
      )}
      <pre className="p-4 text-sm overflow-x-auto bg-gray-950 text-green-400">
        <code>{contribution.code}</code>
      </pre>
    </div>
  );
}
