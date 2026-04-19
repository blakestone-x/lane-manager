import { promises as fs } from 'fs';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { GlobalConfig, PersistedLane } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.lane-manager');
const LANES_DIR = path.join(CONFIG_DIR, 'lanes');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function getGlobalConfig(): GlobalConfig {
  return {
    defaultModel: process.env.LANE_MANAGER_MODEL,
    claudeBin: resolveClaudeBinary(),
    configDir: CONFIG_DIR,
    lanesDir: LANES_DIR,
  };
}

export function resolveClaudeBinary(): string {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) {
    return process.env.CLAUDE_BIN;
  }

  const onPath = findOnPath(process.platform === 'win32' ? 'claude.cmd' : 'claude')
    ?? findOnPath('claude');
  if (onPath) return onPath;

  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const base = path.join(roaming, 'Claude', 'claude-code');
    if (existsSync(base)) {
      try {
        const versions = readdirSync(base)
          .filter((v) => /^\d/.test(v))
          .sort((a, b) => compareVersions(b, a));
        for (const v of versions) {
          candidates.push(path.join(base, v, 'claude.exe'));
        }
      } catch { /* ignore */ }
    }
  } else {
    candidates.push(
      path.join(os.homedir(), '.claude', 'local', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude'
    );
  }

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  throw new Error(
    'Could not locate the `claude` CLI. Install Claude Code (https://claude.com/code) or set CLAUDE_BIN.'
  );
}

function findOnPath(binary: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where ${binary}` : `command -v ${binary}`;
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!out) return null;
    const first = out.split(/\r?\n/)[0].trim();
    return first && existsSync(first) ? first : null;
  } catch {
    return null;
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
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
