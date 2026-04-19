#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { LaneManager } from './lane-manager.js';
import { App } from './ui/app.js';
import { getGlobalConfig, ensureConfigDir, listSavedLanes } from './config.js';

async function main() {
  const program = new Command();
  program
    .name('lane-manager')
    .description('Multi-lane orchestrator tiling concurrent Claude Code sessions side-by-side')
    .version('0.2.0')
    .option('-m, --model <model>', 'default model alias for new lanes (sonnet, opus, etc.)')
    .option('--no-restore', 'do not auto-restore saved lanes')
    .option('--list', 'list saved lanes and exit')
    .option('--claude-bin <path>', 'override path to the claude CLI')
    .parse();

  const opts = program.opts();

  if (opts.claudeBin) {
    process.env.CLAUDE_BIN = opts.claudeBin;
  }

  if (opts.list) {
    const saved = await listSavedLanes();
    if (saved.length === 0) {
      console.log('No saved lanes.');
    } else {
      for (const p of saved) {
        console.log(`${p.config.name.padEnd(24)} ${p.config.cwd}`);
      }
    }
    return;
  }

  let config;
  try {
    config = getGlobalConfig();
  } catch (err: any) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }

  await ensureConfigDir();

  const manager = new LaneManager({
    claudeBin: config.claudeBin,
    defaultModel: opts.model || config.defaultModel,
  });

  let initialMessage: string | undefined = `claude: ${config.claudeBin}`;
  if (opts.restore !== false) {
    const count = await manager.restoreAll();
    if (count > 0) initialMessage = `Restored ${count} saved lane(s).`;
  }

  const { waitUntilExit } = render(React.createElement(App, { manager, initialMessage }));

  const shutdown = () => {
    manager.shutdownAll();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await waitUntilExit();
  manager.shutdownAll();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
