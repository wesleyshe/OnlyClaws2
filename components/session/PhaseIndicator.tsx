const phases = ['proposing', 'voting', 'coding', 'reviewing', 'completed'];
const phaseEmoji: Record<string, string> = {
  proposing: '💡',
  voting: '🗳️',
  coding: '💻',
  reviewing: '🔍',
  completed: '🎮',
};

interface PhaseIndicatorProps {
  currentPhase: string;
}

export default function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const currentIndex = phases.indexOf(currentPhase);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {phases.map((phase, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <div key={phase} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
                isCurrent
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : isDone
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
              }`}
            >
              <span>{phaseEmoji[phase]}</span>
              <span className="capitalize">{phase}</span>
            </div>
            {i < phases.length - 1 && (
              <div className={`w-4 h-0.5 mx-0.5 ${
                i < currentIndex ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-700'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
