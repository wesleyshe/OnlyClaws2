'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Button from '@/components/ui/Button';

interface PythonRunnerProps {
  code: string;
  gameTitle: string;
}

declare global {
  interface Window {
    loadPyodide: any;
  }
}

export default function PythonRunner({ code, gameTitle }: PythonRunnerProps) {
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputPrompt, setInputPrompt] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputResolveRef = useRef<((value: string) => void) | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const pyodideRef = useRef<any>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output, inputPrompt]);

  const appendOutput = useCallback((text: string) => {
    setOutput(prev => [...prev, text]);
  }, []);

  const loadPyodide = async () => {
    if (pyodideRef.current) return pyodideRef.current;

    setLoading(true);
    appendOutput('[Loading Python runtime...]');

    // Load Pyodide script
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide'));
        document.head.appendChild(script);
      });
    }

    const pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/',
    });

    pyodideRef.current = pyodide;
    setLoading(false);
    return pyodide;
  };

  const runGame = async () => {
    setOutput([]);
    setRunning(true);
    setInputPrompt(null);

    try {
      const pyodide = await loadPyodide();

      // Set up stdout/stderr capture
      pyodide.setStdout({
        batched: (text: string) => {
          appendOutput(text);
        },
      });
      pyodide.setStderr({
        batched: (text: string) => {
          appendOutput(`[Error] ${text}`);
        },
      });

      // Override input() with our UI-based version
      pyodide.runPython(`
import builtins
import asyncio
from pyodide.ffi import run_sync

_original_input = builtins.input

def _custom_input(prompt=""):
    if prompt:
        print(prompt, end="")
    import pyodide_js
    result = run_sync(pyodide_js._request_input(prompt))
    return result

builtins.input = _custom_input
`);

      // Expose the input request function to Python
      (pyodide as any)._request_input = async (prompt: string) => {
        return new Promise<string>((resolve) => {
          inputResolveRef.current = resolve;
          setInputPrompt(prompt || 'Input: ');
        });
      };

      appendOutput(`--- ${gameTitle} ---`);
      appendOutput('');

      // Auto-call main() if defined but not called
      let gameCode = code;
      const definesMain = /^def\s+main\s*\(/m.test(gameCode);
      const callsMain = /^main\s*\(/m.test(gameCode) || /\bmain\s*\(\s*\)\s*$/m.test(gameCode) || /if\s+__name__.*main\s*\(/.test(gameCode);
      if (definesMain && !callsMain) {
        gameCode += '\nmain()\n';
      }

      await pyodide.runPythonAsync(gameCode);

      appendOutput('');
      appendOutput('[Game finished]');
    } catch (err: any) {
      appendOutput(`[Error] ${err.message}`);
    } finally {
      setRunning(false);
      setInputPrompt(null);
    }
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputResolveRef.current) {
      appendOutput(inputValue);
      inputResolveRef.current(inputValue);
      inputResolveRef.current = null;
      setInputPrompt(null);
      setInputValue('');
    }
  };

  const reset = () => {
    setOutput([]);
    setRunning(false);
    setInputPrompt(null);
    setInputValue('');
  };

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-medium">Python Terminal</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={runGame}
            disabled={running || loading}
          >
            {loading ? 'Loading...' : running ? 'Running...' : 'Run Game'}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={loading}>
            Reset
          </Button>
        </div>
      </div>

      <div
        ref={terminalRef}
        className="bg-gray-950 p-4 min-h-[300px] max-h-[500px] overflow-y-auto font-mono text-sm"
      >
        {output.length === 0 && !running && (
          <div className="text-gray-600">Click &quot;Run Game&quot; to start playing...</div>
        )}
        {output.map((line, i) => (
          <div key={i} className="text-green-400 whitespace-pre-wrap">{line}</div>
        ))}
        {inputPrompt && (
          <form onSubmit={handleInputSubmit} className="flex items-center mt-1">
            <span className="text-yellow-400 mr-2">&gt;</span>
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              className="bg-transparent text-green-400 outline-none flex-1 caret-green-400"
              autoFocus
            />
          </form>
        )}
      </div>
    </div>
  );
}
