import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Lane } from './lane.js';
import { LaneConfig, LaneEvent, LaneState, LaneTokenUsage } from './types.js';
import { saveLane, loadLane, listSavedLanes, deleteSavedLane } from './config.js';
import { expandHome, loadTemplates, templatesPath } from './templates.js';

export interface LaneManagerOptions {
  claudeExecutable?: string;
  defaultModel?: string;
}

export class LaneManager extends EventEmitter {
  private lanes: Map<string, Lane> = new Map();
  private claudeExecutable?: string;
  private defaultModel?: string;
  private activeLaneId: string | null = null;

  constructor(options: LaneManagerOptions = {}) {
    super();
    this.claudeExecutable = options.claudeExecutable;
    this.defaultModel = options.defaultModel;
  }

  createLane(opts: {
    name: string;
    cwd?: string;
    systemPrompt?: string;
    model?: string;
    template?: string;
    bypassPermissions?: boolean;
  }): Lane {
    const id = this.generateId(opts.name);
    if (this.lanes.has(id)) {
      throw new Error(`Lane "${opts.name}" already exists`);
    }

    let template = opts.template;
    let cwd = opts.cwd;
    let systemPrompt = opts.systemPrompt;

    if (template) {
      const templates = loadTemplates();
      const tpl = templates.find((t) => t.name === template);
      if (!tpl) {
        const hint = templates.length > 0
          ? `Available: ${templates.map((t) => t.name).join(', ')}`
          : `No templates defined in ${templatesPath()}`;
        throw new Error(`Unknown template: ${template}. ${hint}`);
      }
      cwd = cwd ?? tpl.cwd;
      systemPrompt = systemPrompt ?? tpl.systemPrompt;
    }

    const config: LaneConfig = {
      id,
      name: opts.name,
      cwd: expandHome(cwd ?? process.cwd()),
      systemPrompt,
      model: opts.model ?? this.defaultModel,
      template,
      sessionId: uuidv4(),
      bypassPermissions: opts.bypassPermissions ?? false,
    };

    const lane = new Lane(config, { claudeExecutable: this.claudeExecutable });
    this.attachLane(lane);
    lane.start();
    return lane;
  }

  private attachLane(lane: Lane): void {
    lane.on('event', (event: LaneEvent) => {
      this.emit('event', event);
      // Persist on activity, but never on 'killed': killLane deletes the saved
      // state right after, and a racing save would resurrect the lane.
      const shouldSave =
        event.type === 'message' ||
        event.type === 'tokens' ||
        (event.type === 'status' && event.status !== 'killed');
      if (shouldSave) {
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
    const lane = Lane.fromPersisted(persisted, { claudeExecutable: this.claudeExecutable });
    this.attachLane(lane);
    lane.start();
    return lane;
  }

  async restoreAll(): Promise<number> {
    const all = await listSavedLanes();
    let count = 0;
    for (const p of all) {
      if (!this.lanes.has(p.config.id)) {
        const lane = Lane.fromPersisted(p, { claudeExecutable: this.claudeExecutable });
        this.attachLane(lane);
        lane.start();
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

  getTotalTokens(): LaneTokenUsage {
    const total: LaneTokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
    for (const lane of this.lanes.values()) {
      total.input += lane.tokens.input;
      total.output += lane.tokens.output;
      total.cacheRead += lane.tokens.cacheRead;
      total.cacheWrite += lane.tokens.cacheWrite;
      total.costUsd += lane.tokens.costUsd;
    }
    return total;
  }

  bridge(fromName: string, toName: string, message: string): boolean {
    const from = this.findLane(fromName);
    const to = this.findLane(toName);
    if (!from || !to) return false;
    to.injectContext(from.name, message);
    return true;
  }

  sendToActive(input: string): void {
    const lane = this.getActiveLane();
    if (!lane) throw new Error('No active lane. Create one with /new <name>');
    lane.send(input);
  }

  sendTo(idOrName: string, input: string): void {
    const lane = this.findLane(idOrName);
    if (!lane) throw new Error(`Lane not found: ${idOrName}`);
    lane.send(input);
  }

  shutdownAll(): void {
    for (const lane of this.lanes.values()) {
      lane.kill();
    }
    this.lanes.clear();
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
