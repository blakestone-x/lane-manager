import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  LaneConfig,
  LaneState,
  LaneStatus,
  LaneMessage,
  LaneTokenUsage,
  LaneEvent,
  PersistedLane,
} from './types.js';
import { ClaudeSession, ClaudeSessionEvent } from './claude-session.js';

interface LaneDeps {
  claudeBin: string;
}

export class Lane extends EventEmitter {
  public readonly id: string;
  public name: string;
  public cwd: string;
  public systemPrompt?: string;
  public model?: string;
  public template?: string;
  public sessionId: string;
  public bypassPermissions: boolean;

  public status: LaneStatus = 'idle';
  public messages: LaneMessage[] = [];
  public tokens: LaneTokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
  public createdAt: number;
  public lastActivity: number;
  public errorMessage?: string;

  private deps: LaneDeps;
  private session: ClaudeSession | null = null;
  private pendingInputs: string[] = [];
  private resumeOnStart = false;
  private paused = false;
  private toolNameByUseId: Map<string, string> = new Map();

  constructor(config: LaneConfig, deps: LaneDeps) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.cwd = config.cwd;
    this.systemPrompt = config.systemPrompt;
    this.model = config.model;
    this.template = config.template;
    this.sessionId = config.sessionId;
    this.bypassPermissions = config.bypassPermissions;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.deps = deps;
  }

  static fromPersisted(p: PersistedLane, deps: LaneDeps): Lane {
    const config: LaneConfig = {
      id: p.config.id,
      name: p.config.name,
      cwd: p.config.cwd,
      systemPrompt: p.config.systemPrompt,
      model: p.config.model,
      template: p.config.template,
      sessionId: p.config.sessionId ?? uuidv4(),
      bypassPermissions: p.config.bypassPermissions ?? true,
    };
    const lane = new Lane(config, deps);
    lane.messages = p.messages ?? [];
    lane.tokens = {
      input: p.tokens?.input ?? 0,
      output: p.tokens?.output ?? 0,
      cacheRead: p.tokens?.cacheRead ?? 0,
      cacheWrite: p.tokens?.cacheWrite ?? 0,
      costUsd: p.tokens?.costUsd ?? 0,
    };
    lane.createdAt = p.createdAt ?? Date.now();
    lane.lastActivity = p.lastActivity ?? Date.now();
    lane.resumeOnStart = Boolean(p.config.sessionId);
    return lane;
  }

  toPersisted(): PersistedLane {
    return {
      config: this.toConfig(),
      messages: this.messages,
      tokens: this.tokens,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
    };
  }

  toConfig(): LaneConfig {
    return {
      id: this.id,
      name: this.name,
      cwd: this.cwd,
      systemPrompt: this.systemPrompt,
      model: this.model,
      template: this.template,
      sessionId: this.sessionId,
      bypassPermissions: this.bypassPermissions,
    };
  }

  getState(): LaneState {
    return {
      ...this.toConfig(),
      status: this.status,
      messages: this.messages,
      tokens: this.tokens,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      errorMessage: this.errorMessage,
    };
  }

  start(): void {
    if (this.session) return;
    this.setStatus('starting');
    this.session = new ClaudeSession({
      claudeBin: this.deps.claudeBin,
      cwd: this.cwd,
      sessionId: this.sessionId,
      systemPrompt: this.systemPrompt,
      model: this.model,
      bypassPermissions: this.bypassPermissions,
      resume: this.resumeOnStart,
    });
    this.session.on('event', (e: ClaudeSessionEvent) => this.handleSessionEvent(e));
    this.session.start();
  }

  private handleSessionEvent(e: ClaudeSessionEvent): void {
    switch (e.type) {
      case 'ready':
        this.setStatus('idle');
        this.flushPending();
        return;
      case 'assistant_text':
        this.addMessage({ role: 'assistant', content: e.text, timestamp: Date.now() });
        return;
      case 'tool_use':
        this.toolNameByUseId.set(e.id, e.toolName);
        this.emitEvent({ type: 'tool_use', laneId: this.id, toolName: e.toolName, input: e.input });
        this.addMessage({
          role: 'tool',
          content: formatToolCall(e.toolName, e.input),
          timestamp: Date.now(),
          toolName: e.toolName,
        });
        return;
      case 'tool_result': {
        const name = this.toolNameByUseId.get(e.toolUseId) ?? 'tool';
        this.toolNameByUseId.delete(e.toolUseId);
        this.emitEvent({ type: 'tool_result', laneId: this.id, toolName: name, output: e.output });
        this.addMessage({
          role: 'tool',
          content: truncate(e.output, 600),
          timestamp: Date.now(),
          toolName: `${name}:result`,
        });
        return;
      }
      case 'turn_complete':
        this.tokens.input += e.usage.input;
        this.tokens.output += e.usage.output;
        this.tokens.cacheRead += e.usage.cacheRead;
        this.tokens.cacheWrite += e.usage.cacheWrite;
        this.tokens.costUsd += e.usage.costUsd;
        this.emitEvent({ type: 'tokens', laneId: this.id, tokens: { ...this.tokens } });
        if (e.error) {
          this.setStatus('error', `Turn ended with ${e.error}`);
          this.addMessage({
            role: 'system',
            content: `Turn ended: ${e.error}`,
            timestamp: Date.now(),
          });
        } else {
          this.setStatus(this.paused ? 'paused' : 'idle');
        }
        this.flushPending();
        return;
      case 'stderr':
        if (/error|fatal|unauthor/i.test(e.line)) {
          this.addMessage({
            role: 'system',
            content: e.line.slice(0, 500),
            timestamp: Date.now(),
          });
        }
        return;
      case 'exit':
        if (this.status !== 'killed') {
          this.setStatus('error', `claude exited (code=${e.code ?? 'null'})`);
        }
        this.session = null;
        return;
      case 'error':
        this.setStatus('error', e.message);
        this.addMessage({
          role: 'system',
          content: `ERROR: ${e.message}`,
          timestamp: Date.now(),
        });
        return;
    }
  }

  send(userInput: string): void {
    if (this.status === 'killed') {
      return;
    }
    this.addMessage({ role: 'user', content: userInput, timestamp: Date.now() });

    if (!this.session) {
      this.pendingInputs.push(userInput);
      this.start();
      return;
    }

    if (!this.session.isReady()) {
      this.pendingInputs.push(userInput);
      return;
    }

    if (this.session.isRunning() || this.paused) {
      this.pendingInputs.push(userInput);
      return;
    }

    try {
      this.session.sendUserMessage(userInput);
      this.setStatus('running');
    } catch (err: any) {
      this.setStatus('error', err.message);
    }
  }

  private flushPending(): void {
    if (this.paused) return;
    if (!this.session || !this.session.isReady() || this.session.isRunning()) return;
    const next = this.pendingInputs.shift();
    if (!next) return;
    try {
      this.session.sendUserMessage(next);
      this.setStatus('running');
    } catch (err: any) {
      this.setStatus('error', err.message);
    }
  }

  pause(): void {
    this.paused = true;
    if (this.session?.isRunning()) this.session.interrupt();
    this.setStatus('paused');
  }

  resume(): void {
    this.paused = false;
    if (!this.session) {
      this.start();
      return;
    }
    if (this.status === 'paused') this.setStatus('idle');
    this.flushPending();
  }

  kill(): void {
    this.paused = true;
    if (this.session) {
      this.session.shutdown();
      this.session = null;
    }
    this.setStatus('killed');
    this.removeAllListeners();
  }

  injectContext(fromLane: string, message: string): void {
    const content = `(Context bridge from lane "${fromLane}"): ${message}`;
    this.addMessage({
      role: 'system',
      content: `[Bridged from "${fromLane}"] ${message}`,
      timestamp: Date.now(),
    });
    this.send(content);
  }

  private setStatus(status: LaneStatus, error?: string): void {
    this.status = status;
    this.errorMessage = error;
    this.emitEvent({ type: 'status', laneId: this.id, status, error });
  }

  private emitEvent(event: LaneEvent): void {
    this.emit('event', event);
  }

  private addMessage(msg: LaneMessage): void {
    this.messages.push(msg);
    this.lastActivity = Date.now();
    this.emitEvent({ type: 'message', laneId: this.id, message: msg });
  }
}

function formatToolCall(name: string, input: unknown): string {
  let preview: string;
  try {
    preview = JSON.stringify(input);
  } catch {
    preview = String(input);
  }
  const trimmed = preview.length > 140 ? preview.slice(0, 137) + '...' : preview;
  return `→ ${name}(${trimmed})`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n... (${s.length - n} more chars)`;
}
