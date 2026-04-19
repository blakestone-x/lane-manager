import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { GlobalConfig, PersistedLane } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.lane-manager');
const LANES_DIR = path.join(CONFIG_DIR, 'lanes');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function getGlobalConfig(): GlobalConfig {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: process.env.LANE_MANAGER_MODEL || 'claude-sonnet-4-6',
    configDir: CONFIG_DIR,
    lanesDir: LANES_DIR,
  };
}

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(LANES_DIR, { recursive: true });
}

export async function saveLane(lane: PersistedLane): Promise<void> {
  await ensureConfigDir();
  const file = path.join(LANES_DIR, `${lane.config.id}.json`);
  await fs.writeFile(file, JSON.stringify(lane, null, 2), 'utf-8');
}

export async function loadLane(id: string): Promise<PersistedLane | null> {
  try {
    const file = path.join(LANES_DIR, `${id}.json`);
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data) as PersistedLane;
  } catch {
    return null;
  }
}

export async function listSavedLanes(): Promise<PersistedLane[]> {
  await ensureConfigDir();
  try {
    const files = await fs.readdir(LANES_DIR);
    const lanes: PersistedLane[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = await fs.readFile(path.join(LANES_DIR, f), 'utf-8');
        lanes.push(JSON.parse(data));
      } catch {
        // skip malformed
      }
    }
    return lanes;
  } catch {
    return [];
  }
}

export async function deleteSavedLane(id: string): Promise<void> {
  try {
    await fs.unlink(path.join(LANES_DIR, `${id}.json`));
  } catch {
    // ignore
  }
}

export async function readGlobalConfigFile(): Promise<Record<string, any>> {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function writeGlobalConfigFile(data: Record<string, any>): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
