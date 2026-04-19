import path from 'path';
import os from 'os';
import { ICSRepoTemplate } from '../types.js';

const WORKSPACE = process.env.ICS_WORKSPACE
  ?? path.join(os.homedir(), 'Claude Workspace', 'projects', 'active');

function repo(name: string): string {
  return path.join(WORKSPACE, name);
}

export const ICS_TEMPLATES: ICSRepoTemplate[] = [
  {
    name: 'ics-portal',
    displayName: 'ICS Portal',
    cwd: repo('ics-portal'),
    description: 'Main ICS portal (icsops.xyz). Next.js, TypeScript.',
    systemPrompt: 'You are working on ICS Portal — the main operations portal at icsops.xyz. Stack: Next.js, TypeScript, Tailwind. The launcher config is in src/app/home/LauncherClient.tsx — keep SERVICES array in sync with Caddyfile when adding subdomains. Follow simplicity-first coding: minimum code, surgical changes, no speculative abstractions.',
  },
  {
    name: 'meridian',
    displayName: 'Meridian',
    cwd: repo('meridian'),
    description: 'Routing/dispatch tool at routing.icsops.xyz.',
    systemPrompt: 'You are working on Meridian — the ICS routing tool at routing.icsops.xyz. Focus on dispatch optimization, route calculation, and operator workflows. Be concise and data-forward.',
  },
  {
    name: 'cypress',
    displayName: 'Cypress Dashboard',
    cwd: repo('cypress-dashboard'),
    description: 'Monitoring dashboard at cypress.icsops.xyz.',
    systemPrompt: 'You are working on Cypress Dashboard — ICS monitoring/observability at cypress.icsops.xyz. Real-time status, metrics, alerts.',
  },
  {
    name: 'astrolabe',
    displayName: 'Astrolabe',
    cwd: repo('astrolabe'),
    description: 'Planned tool at astrolabe.icsops.xyz (coming soon).',
    systemPrompt: 'You are working on Astrolabe (astrolabe.icsops.xyz). This project is in early buildout.',
  },
  {
    name: 'terminus',
    displayName: 'Terminus',
    cwd: repo('terminus'),
    description: 'Planned terminus tool (coming soon).',
    systemPrompt: 'You are working on Terminus (terminus.icsops.xyz). Early-stage project.',
  },
  {
    name: 'lyceum',
    displayName: 'Lyceum',
    cwd: repo('lyceum'),
    description: 'Training/docs scaffold at lyceum.icsops.xyz.',
    systemPrompt: 'You are working on Lyceum — training and docs at lyceum.icsops.xyz. Currently a scaffold.',
  },
  {
    name: 'sentinel',
    displayName: 'Sentinel',
    cwd: repo('sentinel'),
    description: 'Security watchdog at sentinel.icsops.xyz.',
    systemPrompt: 'You are working on Sentinel — the security watchdog at sentinel.icsops.xyz. Focus on config, suppression rules, file integrity, and module health. Be exacting about security boundaries.',
  },
  {
    name: 'claude-pulse',
    displayName: 'Claude Pulse',
    cwd: repo('claude-pulse'),
    description: 'Local Claude monitoring dashboard.',
    systemPrompt: 'You are working on Claude Pulse — local monitoring for Claude sessions at localhost:9199.',
  },
  {
    name: 'ivr-board',
    displayName: 'ICS IVR Board',
    cwd: repo('ics-ivr-board'),
    description: 'IVR (phone system) board for ICS.',
    systemPrompt: 'You are working on the ICS IVR Board — IVR/phone system workflows.',
  },
  {
    name: 'vector',
    displayName: 'Vector Dispatch Console',
    cwd: repo('vector-dispatch-console'),
    description: 'Vector dispatch console for operators.',
    systemPrompt: 'You are working on Vector — ICS dispatch console for operators. Fast operator workflows, clean UI.',
  },
];

export function getTemplate(name: string): ICSRepoTemplate | null {
  return ICS_TEMPLATES.find((t) => t.name === name) ?? null;
}
