import Badge from '@/components/ui/Badge';

interface CodeViewerProps {
  code: string;
  syntaxValid?: boolean | null;
  syntaxError?: string | null;
}

export default function CodeViewer({ code, syntaxValid, syntaxError }: CodeViewerProps) {
  const lines = code.split('\n');

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-medium">Merged Code</span>
        <div className="flex items-center gap-2">
          <Badge>{lines.length} lines</Badge>
          {syntaxValid === true && <Badge variant="success">Valid</Badge>}
          {syntaxValid === false && <Badge variant="danger">Syntax Error</Badge>}
        </div>
      </div>
      {syntaxError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400 border-b border-gray-200 dark:border-gray-800">
          {syntaxError}
        </div>
      )}
      <div className="overflow-x-auto bg-gray-950">
        <pre className="p-4 text-sm">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="select-none text-gray-600 w-10 text-right mr-4 flex-shrink-0">
                {i + 1}
              </span>
              <code className="text-green-400">{line}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
