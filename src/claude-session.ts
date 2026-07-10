import { EventEmitter } from 'events';
import {
  query,
  type Options,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';

export interface ClaudeSessionOptions {
  cwd: string;
  sessionId: string;
  systemPrompt?: string;
  model?: string;
  bypassPermissions?: boolean;
  resume?: boolean;
  /** Optional path to a Claude Code executable; defaults to the SDK's bundled runtime. */
  claudeExecutable?: string;
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
  private q: Query | null = null;
  private inputQueue: SDKUserMessage[] = [];
  private wakeInput: (() => void) | null = null;
  private inputClosed = false;
  private ready = false;
  private closed = false;
  private exitEmitted = false;
  private pendingTurn = false;

  constructor(options: ClaudeSessionOptions) {
    super();
    this.options = options;
    this.sessionId = options.sessionId;
  }

  start(): void {
    if (this.q) return;

    const bypass = this.options.bypassPermissions === true;
    const options: Options = {
      cwd: this.options.cwd,
      model: this.options.model,
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: this.options.systemPrompt,
      },
      settingSources: ['user', 'project', 'local'],
      permissionMode: bypass ? 'bypassPermissions' : 'default',
      stderr: (data: string) => {
        for (const line of data.split(/\r?\n/)) {
          if (line.trim()) this.emitSafe({ type: 'stderr', line });
        }
      },
    };
    if (bypass) options.allowDangerouslySkipPermissions = true;
    // Exactly one of sessionId / resume: a new session gets our pre-assigned
    // id; a restored lane resumes the session Claude Code already has on disk.
    if (this.options.resume) options.resume = this.sessionId;
    else options.sessionId = this.sessionId;
    if (this.options.claudeExecutable) {
      options.pathToClaudeCodeExecutable = this.options.claudeExecutable;
    }

    this.q = query({ prompt: this.streamInput(), options });
    this.ready = true;
    this.emitSafe({ type: 'ready', sessionId: this.sessionId });
    void this.readLoop(this.q);
  }

  isReady(): boolean {
    return this.ready && !this.closed;
  }

  isRunning(): boolean {
    return this.pendingTurn && !this.closed;
  }

  sendUserMessage(text: string): void {
    if (!this.q || this.closed || this.inputClosed) {
      throw new Error('Claude session is not running');
    }
    this.pendingTurn = true;
    this.inputQueue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: this.sessionId,
    });
    this.wakeInput?.();
  }

  interrupt(): void {
    if (!this.q || this.closed) return;
    this.q.interrupt().catch(() => { /* ignore */ });
  }

  shutdown(): void {
    if (!this.q || this.closed) return;
    this.endInput();
    setTimeout(() => {
      if (!this.closed) {
        try { this.q?.close(); } catch { /* ignore */ }
      }
    }, 1500);
  }

  private endInput(): void {
    this.inputClosed = true;
    this.wakeInput?.();
  }

  private async *streamInput(): AsyncIterable<SDKUserMessage> {
    while (!this.inputClosed) {
      while (this.inputQueue.length > 0) {
        yield this.inputQueue.shift()!;
      }
      if (this.inputClosed) return;
      await new Promise<void>((resolve) => {
        this.wakeInput = resolve;
      });
      this.wakeInput = null;
    }
  }

  private async readLoop(q: Query): Promise<void> {
    try {
      for await (const msg of q) {
        this.handleMessage(msg);
      }
    } catch (err: any) {
      if (!this.closed) {
        this.emitSafe({ type: 'error', message: err?.message ?? String(err) });
      }
    } finally {
      this.markClosed();
    }
  }

  private markClosed(): void {
    this.closed = true;
    this.ready = false;
    this.pendingTurn = false;
    this.endInput();
    if (!this.exitEmitted) {
      this.exitEmitted = true;
      this.emitSafe({ type: 'exit', code: 0, signal: null });
    }
  }

  private handleMessage(msg: SDKMessage): void {
    switch (msg.type) {
      case 'system':
        // init and friends are informational; ready is emitted on start.
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
        const blocks = extractContentBlocks((msg as any).message?.content);
        for (const b of blocks) {
          if (b.type === 'tool_result') {
            this.emitSafe({
              type: 'tool_result',
              toolUseId: b.tool_use_id ?? '',
              output: stringifyToolResult(b.content),
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
          error: msg.subtype !== 'success' ? msg.subtype : undefined,
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
