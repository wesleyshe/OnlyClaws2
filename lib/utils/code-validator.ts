import { spawnSync } from 'node:child_process';

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

export function getBasicSyntaxIssues(code: string): string[] {
  const issues: string[] = [];
  const stack: { ch: string; line: number }[] = [];

  let inSingle = false;
  let inDouble = false;
  let inTripleSingle = false;
  let inTripleDouble = false;
  let line = 1;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];
    const next2 = code[i + 2];

    if (ch === '\n') {
      line += 1;
      continue;
    }

    if (inTripleSingle) {
      if (ch === '\'' && next === '\'' && next2 === '\'') {
        inTripleSingle = false;
        i += 2;
      }
      continue;
    }

    if (inTripleDouble) {
      if (ch === '"' && next === '"' && next2 === '"') {
        inTripleDouble = false;
        i += 2;
      }
      continue;
    }

    if (inSingle) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '\'') {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (ch === '#') {
      while (i < code.length && code[i] !== '\n') i += 1;
      i -= 1;
      continue;
    }

    if (ch === '\'' && next === '\'' && next2 === '\'') {
      inTripleSingle = true;
      i += 2;
      continue;
    }

    if (ch === '"' && next === '"' && next2 === '"') {
      inTripleDouble = true;
      i += 2;
      continue;
    }

    if (ch === '\'') {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push({ ch, line });
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      const top = stack.pop();
      if (!top) {
        issues.push(`Unexpected "${ch}" at line ${line}`);
        continue;
      }
      const expected =
        top.ch === '(' ? ')' :
        top.ch === '[' ? ']' :
        '}';
      if (ch !== expected) {
        issues.push(`Mismatched "${top.ch}" at line ${top.line} and "${ch}" at line ${line}`);
      }
    }
  }

  if (inSingle || inDouble || inTripleSingle || inTripleDouble) {
    issues.push('Unterminated string literal detected');
  }

  for (const open of stack) {
    issues.push(`Unclosed "${open.ch}" from line ${open.line}`);
  }

  return issues;
}

export function validatePythonCode(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(reason);
    }
  }

  const syntaxIssues = getBasicSyntaxIssues(code);
  errors.push(...syntaxIssues);

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

export interface GameHealthResult {
  runnable: boolean;
  issues: string[];
}

export interface RuntimeSmokeResult {
  executed: boolean;
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  skippedReason?: string;
}

function extractPythonError(stderr: string): { code: string; message: string } {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const last = lines[lines.length - 1] || 'RuntimeError: Unknown runtime error';
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(?::\s*(.*))?$/.exec(last);
  if (match) {
    return {
      code: match[1] || 'RuntimeError',
      message: (match[2] || last).trim(),
    };
  }
  return { code: 'RuntimeError', message: last };
}

export function runPythonRuntimeSmokeTest(code: string): RuntimeSmokeResult {
  if (!code || code.trim().length === 0) {
    return {
      executed: true,
      ok: false,
      errorCode: 'NoCodeError',
      errorMessage: 'No code available to execute.',
    };
  }

  const pythonBin = process.env.REVIEW_PYTHON_BIN || 'python3';
  const timeoutMs = Number.parseInt(process.env.REVIEW_RUNTIME_TIMEOUT_MS || '2500', 10) || 2500;
  const maxBuffer = Number.parseInt(process.env.REVIEW_RUNTIME_MAX_BUFFER_BYTES || '262144', 10) || 262144;

  const inputSeed = ['1', 'left', '2', 'right', '3', 'left', '', '', ''];
  const indented = code
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

  const harness = `
import builtins
import sys

_oc_inputs = iter(${JSON.stringify(inputSeed)})
_oc_steps = 0
_oc_max_steps = 300

def _oc_input(prompt=""):
    global _oc_steps
    _oc_steps += 1
    if _oc_steps > _oc_max_steps:
        raise RuntimeError("Input step budget exceeded")
    try:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    except Exception:
        pass
    try:
        return next(_oc_inputs)
    except StopIteration:
        return ""

builtins.input = _oc_input

${indented}
`.trim();

  const proc = spawnSync(pythonBin, ['-I', '-S', '-c', harness], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer,
  });

  if (proc.error) {
    const err = proc.error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return {
        executed: false,
        ok: true,
        errorCode: null,
        errorMessage: null,
        skippedReason: `${pythonBin} not available`,
      };
    }
    if ((err as Error).name === 'Error' && /timed out/i.test(err.message)) {
      return {
        executed: true,
        ok: false,
        errorCode: 'TimeoutError',
        errorMessage: `Runtime check exceeded ${timeoutMs}ms.`,
      };
    }
    return {
      executed: true,
      ok: false,
      errorCode: err.code || 'RuntimeExecError',
      errorMessage: err.message || 'Unknown runtime execution error.',
    };
  }

  if ((proc.status ?? 0) !== 0) {
    const parsed = extractPythonError(proc.stderr || '');
    return {
      executed: true,
      ok: false,
      errorCode: parsed.code,
      errorMessage: parsed.message,
    };
  }

  return {
    executed: true,
    ok: true,
    errorCode: null,
    errorMessage: null,
  };
}

export function checkGameHealth(mergedCode: string): GameHealthResult {
  const issues: string[] = [];
  const syntaxIssues = getBasicSyntaxIssues(mergedCode);
  issues.push(...syntaxIssues);

  const definesMain = /^def\s+main\s*\(/m.test(mergedCode);
  const callsMain = /^main\s*\(/m.test(mergedCode) || /if\s+__name__.*main\s*\(/.test(mergedCode);
  const hasInput = /\binput\s*\(/.test(mergedCode);
  const hasPrint = /\bprint\s*\(/.test(mergedCode);

  if (definesMain && !callsMain) {
    issues.push('main() is defined but never called — add main() on the last line or the game won\'t run');
  }
  if (!definesMain && !callsMain) {
    issues.push('No main() function found — the game needs a main() entry point');
  }
  if (!hasInput) {
    issues.push('No input() calls found — the game won\'t be interactive. Players need input() to make choices');
  }
  if (!hasPrint) {
    issues.push('No print() calls found — the game won\'t display anything to the player');
  }

  return { runnable: issues.length === 0, issues };
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
