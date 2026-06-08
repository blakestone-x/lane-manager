import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { createInterface, Interface } from 'readline';

export interface ClaudeSessionOptions {
  claudeBin: string;
  cwd: string;
  sessionId: string;
  systemPrompt?: string;
  model?: string;
  bypassPermissions?: boolean;
  resume?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export type ClaudeSessionEvent =
  | { type: 'ready'; sessionId: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_use'; toolName: string; input: unknown; id: string }
  | { type: 'tool_result'; toolUseId: string; output: string; isError: boolean }
  | { type: 'turn_complete'; usage: TokenUsage; durationMs: number; error?: string }
  | { type: 'stderr'; line: string }
  | { type: 'exit'; code: number | null; signal: NodeJS.Signals | null }
  | { type: 'error'; message: string };

type InnerEvent = ClaudeSessionEvent;

export class ClaudeSession extends EventEmitter {
  readonly options: ClaudeSessionOptions;
  readonly sessionId: string;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: Interface | null = null;
  private stderrReader: Interface | null = null;
  private ready = false;
  private closed = false;
  private pendingTurn = false;

  constructor(options: ClaudeSessionOptions) {
    super();
    this.options = options;
    this.sessionId = options.sessionId;
  }

  start(): void {
    if (this.proc) return;

    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--session-id', this.sessionId,
    ];

    if (this.options.resume) args.push('--resume', this.sessionId);
    if (this.options.model) args.push('--model', this.options.model);
    if (this.options.systemPrompt) {
      args.push('--append-system-prompt', this.options.systemPrompt);
    }
    if (this.options.bypassPermissions !== false) {
      args.push('--dangerously-skip-permissions');
    }

    this.proc = spawn(this.options.claudeBin, args, {
      cwd: this.options.cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.on('spawn', () => {
      this.ready = true;
      this.emitSafe({ type: 'ready', sessionId: this.sessionId });
    });

    this.proc.on('error', (err) => {
      this.emitSafe({ type: 'error', message: err.message });
    });

    this.proc.on('exit', (code, signal) => {
      this.closed = true;
      this.ready = false;
      this.emitSafe({ type: 'exit', code, signal });
    });

    this.stdoutReader = createInterface({ input: this.proc.stdout });
    this.stdoutReader.on('line', (line) => this.handleStdoutLine(line));

    this.stderrReader = createInterface({ input: this.proc.stderr });
    this.stderrReader.on('line', (line) => {
      this.emitSafe({ type: 'stderr', line });
    });
  }

  isReady(): boolean {
    return this.ready && !this.closed;
  }

  isRunning(): boolean {
    return this.pendingTurn && !this.closed;
  }

  sendUserMessage(text: string): void {
    if (!this.proc || this.closed) {
      throw new Error('Claude session is not running');
    }
    const msg = {
      type: 'user',
      message: { role: 'user', content: text },
      session_id: this.sessionId,
    };
    this.pendingTurn = true;
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }

  interrupt(): void {
    if (!this.proc || this.closed) return;
    if (process.platform === 'win32') {
      try { this.proc.kill(); } catch { /* ignore */ }
    } else {
      try { this.proc.kill('SIGINT'); } catch { /* ignore */ }
    }
  }

  shutdown(): void {
    if (!this.proc || this.closed) return;
    try { this.proc.stdin.end(); } catch { /* ignore */ }
    setTimeout(() => {
      if (!this.closed) {
        try { this.proc?.kill(); } catch { /* ignore */ }
      }
    }, 1500);
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: any;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      this.emitSafe({ type: 'stderr', line: `[non-json stdout] ${trimmed}` });
      return;
    }

    switch (msg.type) {
      case 'system':
        // init, hook_started, hook_response — informational; ready is emitted on spawn.
        return;

      case 'rate_limit_event':
        return;

      case 'assistant': {
        const blocks = extractContentBlocks(msg.message?.content);
        for (const b of blocks) {
          if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
            this.emitSafe({ type: 'assistant_text', text: b.text });
          } else if (b.type === 'tool_use') {
            this.emitSafe({
              type: 'tool_use',
              toolName: b.name ?? 'unknown',
              input: b.input,
              id: b.id ?? '',
            });
          }
        }
        return;
      }

      case 'user': {
        const blocks = extractContentBlocks(msg.message?.content);
        for (const b of blocks) {
          if (b.type === 'tool_result') {
            const out = stringifyToolResult(b.content);
            this.emitSafe({
              type: 'tool_result',
              toolUseId: b.tool_use_id ?? '',
              output: out,
              isError: Boolean(b.is_error),
            });
          }
        }
        return;
      }

      case 'result': {
        this.pendingTurn = false;
        const usage: TokenUsage = {
          input: msg.usage?.input_tokens ?? 0,
          output: msg.usage?.output_tokens ?? 0,
          cacheRead: msg.usage?.cache_read_input_tokens ?? 0,
          cacheWrite: msg.usage?.cache_creation_input_tokens ?? 0,
          costUsd: typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : 0,
        };
        this.emitSafe({
          type: 'turn_complete',
          usage,
          durationMs: msg.duration_ms ?? 0,
          error: msg.subtype && msg.subtype !== 'success' ? msg.subtype : undefined,
        });
        return;
      }

      default:
        return;
    }
  }

  private emitSafe(event: InnerEvent): void {
    this.emit('event', event);
  }
}

function extractContentBlocks(content: unknown): any[] {
  if (!content) return [];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) return content;
  return [];
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => {
        if (typeof b === 'string') return b;
        if (b?.type === 'text' && typeof b.text === 'string') return b.text;
        return JSON.stringify(b);
      })
      .join('\n');
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}
