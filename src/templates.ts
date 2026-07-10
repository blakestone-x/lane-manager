import { readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { LaneTemplate } from './types.js';

const TEMPLATES_FILE = path.join(os.homedir(), '.lane-manager', 'templates.json');

let cached: LaneTemplate[] | null = null;

export function templatesPath(): string {
  return TEMPLATES_FILE;
}

/**
 * Loads user-defined lane templates from ~/.lane-manager/templates.json.
 * The file is a JSON array of objects: { name, cwd, systemPrompt?, description? }.
 * Missing or malformed files yield an empty list.
 */
export function loadTemplates(): LaneTemplate[] {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(readFileSync(TEMPLATES_FILE, 'utf-8'));
    cached = Array.isArray(parsed) ? parsed.filter(isTemplate).map(normalize) : [];
  } catch {
    cached = [];
  }
  return cached;
}

function isTemplate(t: any): t is LaneTemplate {
  return (
    t !== null &&
    typeof t === 'object' &&
    typeof t.name === 'string' &&
    t.name.length > 0 &&
    typeof t.cwd === 'string' &&
    t.cwd.length > 0
  );
}

function normalize(t: LaneTemplate): LaneTemplate {
  return { ...t, cwd: expandHome(t.cwd) };
}

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
