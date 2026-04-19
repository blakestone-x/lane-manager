import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ToolContext {
  cwd: string;
}

function resolvePath(ctx: ToolContext, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(ctx.cwd, p);
}

export async function executeTool(
  name: string,
  input: any,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case 'read_file':
        return await readFile(input, ctx);
      case 'write_file':
        return await writeFile(input, ctx);
      case 'edit_file':
        return await editFile(input, ctx);
      case 'bash':
        return await runBash(input, ctx);
      case 'list_files':
        return await listFiles(input, ctx);
      case 'grep':
        return await grep(input, ctx);
      case 'git_status':
        return await gitStatus(ctx);
      default:
        return `ERROR: Unknown tool: ${name}`;
    }
  } catch (err: any) {
    return `ERROR: ${err.message || String(err)}`;
  }
}

async function readFile(input: any, ctx: ToolContext): Promise<string> {
  const fp = resolvePath(ctx, input.path);
  const content = await fs.readFile(fp, 'utf-8');
  const lines = content.split('\n');
  const offset = input.offset ? Math.max(0, input.offset - 1) : 0;
  const limit = input.limit ?? 2000;
  const selected = lines.slice(offset, offset + limit);
  const numbered = selected.map((line, i) => `${offset + i + 1}\t${line}`).join('\n');
  const truncated = lines.length > offset + limit;
  return numbered + (truncated ? `\n... (${lines.length - offset - limit} more lines)` : '');
}

async function writeFile(input: any, ctx: ToolContext): Promise<string> {
  const fp = resolvePath(ctx, input.path);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, input.content, 'utf-8');
  return `Wrote ${input.content.length} bytes to ${input.path}`;
}

async function editFile(input: any, ctx: ToolContext): Promise<string> {
  const fp = resolvePath(ctx, input.path);
  const content = await fs.readFile(fp, 'utf-8');
  const occurrences = content.split(input.old_string).length - 1;
  if (occurrences === 0) {
    return `ERROR: old_string not found in ${input.path}`;
  }
  if (occurrences > 1) {
    return `ERROR: old_string appears ${occurrences} times in ${input.path} (must be unique)`;
  }
  const updated = content.replace(input.old_string, input.new_string);
  await fs.writeFile(fp, updated, 'utf-8');
  return `Edited ${input.path}`;
}

async function runBash(input: any, ctx: ToolContext): Promise<string> {
  const timeout = input.timeout ?? 120_000;
  try {
    const { stdout, stderr } = await execAsync(input.command, {
      cwd: ctx.cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32' ? 'bash.exe' : '/bin/bash',
    });
    const out = stdout.toString();
    const err = stderr.toString();
    let result = '';
    if (out) result += out;
    if (err) result += (result ? '\n--- stderr ---\n' : '') + err;
    return result || '(no output)';
  } catch (err: any) {
    const out = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    return `Command failed (exit ${err.code}):\n${out}\n${stderr}`.trim();
  }
}

async function listFiles(input: any, ctx: ToolContext): Promise<string> {
  const dir = resolvePath(ctx, input.path);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const pattern = input.pattern ? globToRegex(input.pattern) : null;
  const lines = entries
    .filter((e) => !pattern || pattern.test(e.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort();
  return lines.join('\n') || '(empty)';
}

async function grep(input: any, ctx: ToolContext): Promise<string> {
  const targetPath = resolvePath(ctx, input.path || '.');
  const regex = new RegExp(input.pattern);
  const globFilter = input.glob ? globToRegex(input.glob) : null;

  const results: string[] = [];
  let count = 0;
  const MAX = 200;

  async function walk(p: string): Promise<void> {
    if (count >= MAX) return;
    const stat = await fs.stat(p);
    if (stat.isFile()) {
      if (globFilter && !globFilter.test(path.basename(p))) return;
      try {
        const content = await fs.readFile(p, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push(`${path.relative(ctx.cwd, p)}:${i + 1}: ${lines[i].slice(0, 200)}`);
            count++;
            if (count >= MAX) return;
          }
        }
      } catch {
        // binary or permission
      }
    } else if (stat.isDirectory()) {
      const entries = await fs.readdir(p);
      for (const e of entries) {
        if (e === 'node_modules' || e === '.git' || e === 'dist') continue;
        await walk(path.join(p, e));
        if (count >= MAX) return;
      }
    }
  }

  await walk(targetPath);
  return results.length ? results.join('\n') : '(no matches)';
}

async function gitStatus(ctx: ToolContext): Promise<string> {
  try {
    const branch = (await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: ctx.cwd })).stdout.trim();
    const status = (await execAsync('git status --short', { cwd: ctx.cwd })).stdout.trim();
    let trackingInfo = '';
    try {
      const upstream = (await execAsync('git rev-parse --abbrev-ref @{u}', { cwd: ctx.cwd })).stdout.trim();
      const counts = (await execAsync(`git rev-list --left-right --count ${upstream}...HEAD`, { cwd: ctx.cwd })).stdout.trim();
      const [behind, ahead] = counts.split('\t');
      trackingInfo = ` | tracking: ${upstream} | ahead ${ahead}, behind ${behind}`;
    } catch {
      trackingInfo = ' | (no upstream)';
    }
    return `Branch: ${branch}${trackingInfo}\n\n${status || '(clean)'}`;
  } catch (err: any) {
    return `ERROR: ${err.message}`;
  }
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}
