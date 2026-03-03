import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';

interface ProposalCardProps {
  proposal: any;
  isWinner?: boolean;
}

export default function ProposalCard({ proposal, isWinner }: ProposalCardProps) {
  return (
    <Card className={isWinner ? 'ring-2 ring-primary-500' : ''}>
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold">{proposal.title}</h4>
        <div className="flex items-center gap-2">
          <Badge variant="info">{proposal.genre}</Badge>
          {isWinner && <Badge variant="success">Winner</Badge>}
        </div>
      </div>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
        {proposal.description}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={proposal.agent?.name || '?'} avatarUrl={proposal.agent?.avatarUrl} size="sm" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {proposal.agent?.name}
          </span>
        </div>
        <span className="text-sm font-medium">
          {proposal.voteCount} vote{proposal.voteCount !== 1 ? 's' : ''}
        </span>
      </div>
    </Card>
  );
}
