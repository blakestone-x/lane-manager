import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import {
  LaneConfig,
  LaneState,
  LaneStatus,
  LaneMessage,
  LaneTokenUsage,
  LaneEvent,
  PersistedLane,
} from './types.js';
import { TOOL_DEFINITIONS } from './tools/definitions.js';
import { executeTool } from './tools/executors.js';

const MAX_AGENT_TURNS = 25;

export class Lane extends EventEmitter {
  public readonly id: string;
  public name: string;
  public cwd: string;
  public systemPrompt: string;
  public model: string;
  public template?: string;
  public maxTokens: number;

  public status: LaneStatus = 'idle';
  public messages: LaneMessage[] = [];
  public tokens: LaneTokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  public createdAt: number;
  public lastActivity: number;
  public errorMessage?: string;

  private client: Anthropic;
  private apiMessages: Anthropic.MessageParam[] = [];
  private abortController: AbortController | null = null;
  private paused = false;
  private processing = false;

  constructor(config: LaneConfig, client: Anthropic) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.cwd = config.cwd;
    this.systemPrompt = config.systemPrompt;
    this.model = config.model;
    this.template = config.template;
    this.maxTokens = config.maxTokens ?? 4096;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.client = client;
  }

  static fromPersisted(p: PersistedLane, client: Anthropic): Lane {
    const lane = new Lane(p.config, client);
    lane.messages = p.messages;
    lane.tokens = p.tokens;
    lane.createdAt = p.createdAt;
    lane.lastActivity = p.lastActivity;
    lane.apiMessages = p.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    return lane;
  }

  toPersisted(): PersistedLane {
    return {
      config: {
        id: this.id,
        name: this.name,
        cwd: this.cwd,
        systemPrompt: this.systemPrompt,
        model: this.model,
        template: this.template,
        maxTokens: this.maxTokens,
      },
      messages: this.messages,
      tokens: this.tokens,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
    };
  }

  getState(): LaneState {
    return {
      id: this.id,
      name: this.name,
      cwd: this.cwd,
      systemPrompt: this.systemPrompt,
      model: this.model,
      template: this.template,
      maxTokens: this.maxTokens,
      status: this.status,
      messages: this.messages,
      tokens: this.tokens,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      errorMessage: this.errorMessage,
    };
  }

  private setStatus(status: LaneStatus, error?: string) {
    this.status = status;
    this.errorMessage = error;
    this.emitEvent({ type: 'status', laneId: this.id, status, error });
  }

  private emitEvent(event: LaneEvent) {
    this.emit('event', event);
  }

  private addMessage(msg: LaneMessage) {
    this.messages.push(msg);
    this.lastActivity = Date.now();
    this.emitEvent({ type: 'message', laneId: this.id, message: msg });
  }

  pause() {
    this.paused = true;
    if (this.abortController) this.abortController.abort();
    this.setStatus('paused');
  }

  resume() {
    this.paused = false;
    if (this.status === 'paused') this.setStatus('idle');
  }

  kill() {
    this.paused = true;
    if (this.abortController) this.abortController.abort();
    this.setStatus('killed');
    this.removeAllListeners();
  }

  async send(userInput: string): Promise<void> {
    if (this.paused) {
      this.addMessage({
        role: 'system',
        content: 'Lane is paused. Resume with /resume.',
        timestamp: Date.now(),
      });
      return;
    }
    if (this.processing) {
      this.addMessage({
        role: 'system',
        content: 'Lane is busy. Message queued after current turn.',
        timestamp: Date.now(),
      });
    }

    this.addMessage({ role: 'user', content: userInput, timestamp: Date.now() });
    this.apiMessages.push({ role: 'user', content: userInput });

    await this.runAgentLoop();
  }

  private async runAgentLoop(): Promise<void> {
    this.processing = true;
    this.setStatus('running');

    try {
      let turn = 0;
      while (turn < MAX_AGENT_TURNS && !this.paused) {
        turn++;
        this.abortController = new AbortController();

        const response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: this.maxTokens,
            system: this.systemPrompt,
            messages: this.apiMessages,
            tools: TOOL_DEFINITIONS,
          },
          { signal: this.abortController.signal }
        );

        this.tokens.input += response.usage.input_tokens;
        this.tokens.output += response.usage.output_tokens;
        if ((response.usage as any).cache_read_input_tokens) {
          this.tokens.cacheRead += (response.usage as any).cache_read_input_tokens;
        }
        if ((response.usage as any).cache_creation_input_tokens) {
          this.tokens.cacheWrite += (response.usage as any).cache_creation_input_tokens;
        }
        this.emitEvent({ type: 'tokens', laneId: this.id, tokens: { ...this.tokens } });

        this.apiMessages.push({ role: 'assistant', content: response.content });

        const textBlocks = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n\n');

        if (textBlocks) {
          this.addMessage({ role: 'assistant', content: textBlocks, timestamp: Date.now() });
        }

        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

        if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
          break;
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          this.emitEvent({
            type: 'tool_use',
            laneId: this.id,
            toolName: tu.name,
            input: tu.input,
          });
          this.addMessage({
            role: 'tool',
            content: formatToolCall(tu.name, tu.input),
            timestamp: Date.now(),
            toolName: tu.name,
          });

          const output = await executeTool(tu.name, tu.input, { cwd: this.cwd });

          this.emitEvent({
            type: 'tool_result',
            laneId: this.id,
            toolName: tu.name,
            output,
          });
          this.addMessage({
            role: 'tool',
            content: truncate(output, 500),
            timestamp: Date.now(),
            toolName: `${tu.name}:result`,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: output,
          });
        }

        this.apiMessages.push({ role: 'user', content: toolResults });
      }

      this.setStatus('idle');
    } catch (err: any) {
      if (err.name === 'AbortError' || this.paused) {
        this.setStatus('paused');
      } else {
        this.setStatus('error', err.message || String(err));
        this.addMessage({
          role: 'system',
          content: `ERROR: ${err.message || String(err)}`,
          timestamp: Date.now(),
        });
      }
    } finally {
      this.processing = false;
      this.abortController = null;
    }
  }

  injectContext(fromLane: string, message: string) {
    const content = `[Bridged from lane "${fromLane}"]: ${message}`;
    this.addMessage({ role: 'system', content, timestamp: Date.now() });
    this.apiMessages.push({
      role: 'user',
      content: `(Context bridge from lane "${fromLane}"): ${message}`,
    });
  }
}

function formatToolCall(name: string, input: any): string {
  const preview = JSON.stringify(input);
  return `→ ${name}(${preview.length > 120 ? preview.slice(0, 117) + '...' : preview})`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n... (${s.length - n} more chars)`;
}
