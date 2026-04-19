import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { Lane } from './lane.js';
import { LaneConfig, LaneEvent, LaneState } from './types.js';
import { saveLane, loadLane, listSavedLanes, deleteSavedLane } from './config.js';
import { ICS_TEMPLATES } from './ics/templates.js';

export class LaneManager extends EventEmitter {
  private lanes: Map<string, Lane> = new Map();
  private client: Anthropic;
  private activeLaneId: string | null = null;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel: string) {
    super();
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  createLane(opts: {
    name: string;
    cwd?: string;
    systemPrompt?: string;
    model?: string;
    template?: string;
    maxTokens?: number;
  }): Lane {
    const id = this.generateId(opts.name);
    if (this.lanes.has(id)) {
      throw new Error(`Lane "${opts.name}" already exists`);
    }

    let template = opts.template;
    let cwd = opts.cwd;
    let systemPrompt = opts.systemPrompt;

    if (template) {
      const tpl = ICS_TEMPLATES.find((t) => t.name === template);
      if (!tpl) {
        throw new Error(`Unknown template: ${template}. Available: ${ICS_TEMPLATES.map((t) => t.name).join(', ')}`);
      }
      cwd = cwd ?? tpl.cwd;
      systemPrompt = systemPrompt ?? tpl.systemPrompt;
    }

    const config: LaneConfig = {
      id,
      name: opts.name,
      cwd: cwd ?? process.cwd(),
      systemPrompt: systemPrompt ?? defaultSystemPrompt(opts.name),
      model: opts.model ?? this.defaultModel,
      template,
      maxTokens: opts.maxTokens ?? 4096,
    };

    const lane = new Lane(config, this.client);
    this.attachLane(lane);
    return lane;
  }

  private attachLane(lane: Lane): void {
    lane.on('event', (event: LaneEvent) => {
      this.emit('event', event);
      if (event.type === 'message' || event.type === 'tokens') {
        saveLane(lane.toPersisted()).catch(() => {
          // best-effort persistence
        });
      }
    });
    this.lanes.set(lane.id, lane);
    if (!this.activeLaneId) this.activeLaneId = lane.id;
    this.emit('lanes-changed');
  }

  async restoreLane(id: string): Promise<Lane | null> {
    const persisted = await loadLane(id);
    if (!persisted) return null;
    const lane = Lane.fromPersisted(persisted, this.client);
    this.attachLane(lane);
    return lane;
  }

  async restoreAll(): Promise<number> {
    const all = await listSavedLanes();
    let count = 0;
    for (const p of all) {
      if (!this.lanes.has(p.config.id)) {
        const lane = Lane.fromPersisted(p, this.client);
        this.attachLane(lane);
        count++;
      }
    }
    return count;
  }

  killLane(idOrName: string): boolean {
    const lane = this.findLane(idOrName);
    if (!lane) return false;
    lane.kill();
    this.lanes.delete(lane.id);
    deleteSavedLane(lane.id).catch(() => {});
    if (this.activeLaneId === lane.id) {
      const remaining = Array.from(this.lanes.keys());
      this.activeLaneId = remaining[0] ?? null;
    }
    this.emit('lanes-changed');
    return true;
  }

  pauseLane(idOrName: string): boolean {
    const lane = this.findLane(idOrName);
    if (!lane) return false;
    lane.pause();
    return true;
  }

  resumeLane(idOrName: string): boolean {
    const lane = this.findLane(idOrName);
    if (!lane) return false;
    lane.resume();
    return true;
  }

  setActiveLane(idOrName: string): boolean {
    const lane = this.findLane(idOrName);
    if (!lane) return false;
    this.activeLaneId = lane.id;
    this.emit('active-changed', lane.id);
    return true;
  }

  getActiveLane(): Lane | null {
    if (!this.activeLaneId) return null;
    return this.lanes.get(this.activeLaneId) ?? null;
  }

  getLane(idOrName: string): Lane | null {
    return this.findLane(idOrName);
  }

  listLanes(): LaneState[] {
    return Array.from(this.lanes.values()).map((l) => l.getState());
  }

  getTotalTokens() {
    const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const lane of this.lanes.values()) {
      total.input += lane.tokens.input;
      total.output += lane.tokens.output;
      total.cacheRead += lane.tokens.cacheRead;
      total.cacheWrite += lane.tokens.cacheWrite;
    }
    return total;
  }

  async bridge(fromName: string, toName: string, message: string): Promise<boolean> {
    const from = this.findLane(fromName);
    const to = this.findLane(toName);
    if (!from || !to) return false;
    to.injectContext(from.name, message);
    return true;
  }

  async sendToActive(input: string): Promise<void> {
    const lane = this.getActiveLane();
    if (!lane) throw new Error('No active lane. Create one with /new <name>');
    await lane.send(input);
  }

  async sendTo(idOrName: string, input: string): Promise<void> {
    const lane = this.findLane(idOrName);
    if (!lane) throw new Error(`Lane not found: ${idOrName}`);
    await lane.send(input);
  }

  private findLane(idOrName: string): Lane | null {
    const byId = this.lanes.get(idOrName);
    if (byId) return byId;
    for (const lane of this.lanes.values()) {
      if (lane.name === idOrName) return lane;
    }
    return null;
  }

  private generateId(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${slug}-${Date.now().toString(36)}`;
  }
}

function defaultSystemPrompt(laneName: string): string {
  return `You are a coding assistant running in Lane Manager lane "${laneName}". You have access to tools for reading, writing, editing files, running bash commands, and searching. Work carefully in the lane's working directory. Be direct and concise in your responses.`;
}
