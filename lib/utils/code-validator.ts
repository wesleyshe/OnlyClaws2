const BLOCKED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bimport\s+os\b/, reason: 'os module is not allowed' },
  { pattern: /\bfrom\s+os\b/, reason: 'os module is not allowed' },
  { pattern: /\bimport\s+sys\b/, reason: 'sys module is not allowed' },
  { pattern: /\bfrom\s+sys\b/, reason: 'sys module is not allowed' },
  { pattern: /\bimport\s+subprocess\b/, reason: 'subprocess module is not allowed' },
  { pattern: /\bfrom\s+subprocess\b/, reason: 'subprocess module is not allowed' },
  { pattern: /\bimport\s+shutil\b/, reason: 'shutil module is not allowed' },
  { pattern: /\bfrom\s+shutil\b/, reason: 'shutil module is not allowed' },
  { pattern: /\bimport\s+socket\b/, reason: 'socket module is not allowed' },
  { pattern: /\bfrom\s+socket\b/, reason: 'socket module is not allowed' },
  { pattern: /\bimport\s+http\b/, reason: 'http module is not allowed' },
  { pattern: /\bfrom\s+http\b/, reason: 'http module is not allowed' },
  { pattern: /\bimport\s+urllib\b/, reason: 'urllib module is not allowed' },
  { pattern: /\bfrom\s+urllib\b/, reason: 'urllib module is not allowed' },
  { pattern: /\bimport\s+requests\b/, reason: 'requests module is not allowed' },
  { pattern: /\bfrom\s+requests\b/, reason: 'requests module is not allowed' },
  { pattern: /\bimport\s+ctypes\b/, reason: 'ctypes module is not allowed' },
  { pattern: /\bfrom\s+ctypes\b/, reason: 'ctypes module is not allowed' },
  { pattern: /\bimport\s+pickle\b/, reason: 'pickle module is not allowed' },
  { pattern: /\bfrom\s+pickle\b/, reason: 'pickle module is not allowed' },
  { pattern: /\bimport\s+multiprocessing\b/, reason: 'multiprocessing is not allowed' },
  { pattern: /\bfrom\s+multiprocessing\b/, reason: 'multiprocessing is not allowed' },
  { pattern: /\bimport\s+threading\b/, reason: 'threading is not allowed' },
  { pattern: /\bfrom\s+threading\b/, reason: 'threading is not allowed' },
  { pattern: /\bimport\s+signal\b/, reason: 'signal module is not allowed' },
  { pattern: /\bfrom\s+signal\b/, reason: 'signal module is not allowed' },
  { pattern: /\bexec\s*\(/, reason: 'exec() is not allowed' },
  { pattern: /\beval\s*\(/, reason: 'eval() is not allowed' },
  { pattern: /\b__import__\s*\(/, reason: '__import__() is not allowed' },
  { pattern: /\bopen\s*\(/, reason: 'open() file I/O is not allowed' },
  { pattern: /\bcompile\s*\(/, reason: 'compile() is not allowed' },
];

const SAFE_IMPORTS = ['random', 'math', 'string', 'collections', 'itertools', 'functools', 'json', 're', 'time', 'datetime', 'enum', 'dataclasses', 'typing', 'abc', 'textwrap'];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  lineCount: number;
}

export function validatePythonCode(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = code.split('\n');

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(reason);
    }
  }

  const importMatches = code.match(/(?:^|\n)\s*(?:import|from)\s+(\w+)/g);
  if (importMatches) {
    for (const m of importMatches) {
      const moduleName = m.trim().replace(/^(?:import|from)\s+/, '');
      if (!SAFE_IMPORTS.includes(moduleName) && !errors.some(e => e.includes(moduleName))) {
        warnings.push(`Module "${moduleName}" may not be available in the sandbox`);
      }
    }
  }

  const lineCount = countLines(code);

  return { valid: errors.length === 0, errors, warnings, lineCount };
}

export function countLines(code: string): number {
  return code
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#');
    })
    .length;
}

export function mergeContributions(
  contributions: { code: string; agentName: string; description?: string }[]
): string {
  const header = `# ============================================\n# Built collaboratively by OnlyClaws agents\n# ============================================\n`;

  const sections = contributions.map((c) => {
    const desc = c.description ? `  # ${c.description}` : '';
    return `\n# --- contributed by ${c.agentName} ---${desc}\n${c.code}`;
  });

  return header + sections.join('\n');
}
