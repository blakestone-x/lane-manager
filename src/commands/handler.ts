import { LaneManager } from '../lane-manager.js';
import { ICS_TEMPLATES } from '../ics/templates.js';

export interface CommandResult {
  ok: boolean;
  message: string;
}

export async function handleCommand(
  input: string,
  manager: LaneManager
): Promise<CommandResult | null> {
  if (!input.startsWith('/')) return null;

  const [cmd, ...rawArgs] = input.slice(1).split(/\s+/);
  const args = rawArgs.filter((s) => s.length > 0);

  switch (cmd) {
    case 'new':
      return cmdNew(args, manager);
    case 'switch':
    case 'focus':
      return cmdSwitch(args, manager);
    case 'list':
    case 'ls':
      return cmdList(manager);
    case 'kill':
    case 'rm':
      return cmdKill(args, manager);
    case 'pause':
      return cmdPause(args, manager);
    case 'resume':
      return cmdResume(args, manager);
    case 'bridge':
      return cmdBridge(args, manager);
    case 'status':
      return cmdStatus(manager);
    case 'templates':
      return cmdTemplates();
    case 'help':
      return cmdHelp();
    case 'send':
      return cmdSend(args, manager);
    case 'restore':
      return cmdRestore(manager);
    default:
      return { ok: false, message: `Unknown command: /${cmd}. Try /help.` };
  }
}

async function cmdNew(args: string[], manager: LaneManager): Promise<CommandResult> {
  if (args.length === 0) {
    return { ok: false, message: 'Usage: /new <name> [cwd|--template <name>]' };
  }
  const name = args[0];
  let cwd: string | undefined;
  let template: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--template' || a === '-t') {
      template = args[++i];
    } else if (!cwd) {
      cwd = a;
    }
  }

  try {
    const lane = manager.createLane({ name, cwd, template });
    return { ok: true, message: `Created lane "${lane.name}" at ${lane.cwd}` };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

function cmdSwitch(args: string[], manager: LaneManager): CommandResult {
  if (args.length === 0) return { ok: false, message: 'Usage: /switch <name>' };
  const ok = manager.setActiveLane(args[0]);
  return ok
    ? { ok: true, message: `Switched to ${args[0]}` }
    : { ok: false, message: `Lane not found: ${args[0]}` };
}

function cmdList(manager: LaneManager): CommandResult {
  const lanes = manager.listLanes();
  if (lanes.length === 0) return { ok: true, message: 'No lanes. Create one with /new <name>' };
  const active = manager.getActiveLane();
  const lines = lanes.map((l) => {
    const marker = active && l.id === active.id ? '*' : ' ';
    return `${marker} ${l.name.padEnd(20)} [${l.status.padEnd(7)}] ${l.cwd}`;
  });
  return { ok: true, message: lines.join('\n') };
}

function cmdKill(args: string[], manager: LaneManager): CommandResult {
  if (args.length === 0) return { ok: false, message: 'Usage: /kill <name>' };
  const ok = manager.killLane(args[0]);
  return ok
    ? { ok: true, message: `Killed ${args[0]}` }
    : { ok: false, message: `Lane not found: ${args[0]}` };
}

function cmdPause(args: string[], manager: LaneManager): CommandResult {
  const target = args[0] ?? manager.getActiveLane()?.name;
  if (!target) return { ok: false, message: 'Usage: /pause [name]' };
  const ok = manager.pauseLane(target);
  return ok ? { ok: true, message: `Paused ${target}` } : { ok: false, message: `Lane not found: ${target}` };
}

function cmdResume(args: string[], manager: LaneManager): CommandResult {
  const target = args[0] ?? manager.getActiveLane()?.name;
  if (!target) return { ok: false, message: 'Usage: /resume [name]' };
  const ok = manager.resumeLane(target);
  return ok ? { ok: true, message: `Resumed ${target}` } : { ok: false, message: `Lane not found: ${target}` };
}

async function cmdBridge(args: string[], manager: LaneManager): Promise<CommandResult> {
  if (args.length < 3) return { ok: false, message: 'Usage: /bridge <from> <to> <message>' };
  const [from, to, ...msg] = args;
  const ok = await manager.bridge(from, to, msg.join(' '));
  return ok
    ? { ok: true, message: `Bridged ${from} → ${to}` }
    : { ok: false, message: `Bridge failed — check lane names` };
}

function cmdStatus(manager: LaneManager): CommandResult {
  const lanes = manager.listLanes();
  const tokens = manager.getTotalTokens();
  const byStatus: Record<string, number> = {};
  for (const l of lanes) byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
  const statusLine = Object.entries(byStatus).map(([k, v]) => `${k}:${v}`).join(' ');
  const tokenLine = `tokens: in=${tokens.input} out=${tokens.output} cacheR=${tokens.cacheRead} cacheW=${tokens.cacheWrite}`;
  return { ok: true, message: `${lanes.length} lanes | ${statusLine}\n${tokenLine}` };
}

function cmdTemplates(): CommandResult {
  const lines = ICS_TEMPLATES.map((t) => `  ${t.name.padEnd(14)} ${t.description}`);
  return { ok: true, message: `ICS templates:\n${lines.join('\n')}` };
}

async function cmdSend(args: string[], manager: LaneManager): Promise<CommandResult> {
  if (args.length < 2) return { ok: false, message: 'Usage: /send <name> <message>' };
  const [target, ...msg] = args;
  try {
    await manager.sendTo(target, msg.join(' '));
    return { ok: true, message: `Sent to ${target}` };
  } catch (err: any) {
    return { ok: false, message: err.message };
  }
}

async function cmdRestore(manager: LaneManager): Promise<CommandResult> {
  const count = await manager.restoreAll();
  return { ok: true, message: `Restored ${count} lane(s) from disk` };
}

function cmdHelp(): CommandResult {
  const msg = `
Commands:
  /new <name> [cwd] [--template <name>]  Create a new lane
  /switch <name>                          Focus a lane
  /list (or /ls)                          List all lanes
  /kill <name>                            Stop and remove a lane
  /pause [name]                           Pause a lane (default: active)
  /resume [name]                          Resume a paused lane
  /bridge <from> <to> <message>           Inject context from one lane to another
  /send <name> <message>                  Send a message to a specific lane
  /status                                 Overview of all lanes + tokens
  /templates                              List ICS repo templates
  /restore                                Restore all saved lanes
  /help                                   Show this help

Text without a leading / goes to the active lane.
Keys: Ctrl+N (next lane), Ctrl+P (prev lane), Ctrl+C (quit)
`.trim();
  return { ok: true, message: msg };
}
