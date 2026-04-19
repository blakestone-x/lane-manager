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
    .description('Multi-lane orchestrator for concurrent Claude Agent SDK sessions')
    .version('0.1.0')
    .option('-m, --model <model>', 'default model for new lanes', 'claude-sonnet-4-6')
    .option('--no-restore', 'do not auto-restore saved lanes')
    .option('--list', 'list saved lanes and exit')
    .parse();

  const opts = program.opts();

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

  const config = getGlobalConfig();
  if (!config.apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('Get a key at https://console.anthropic.com and then:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  await ensureConfigDir();

  const manager = new LaneManager(config.apiKey, opts.model || config.defaultModel);

  let initialMessage: string | undefined;
  if (opts.restore !== false) {
    const count = await manager.restoreAll();
    if (count > 0) initialMessage = `Restored ${count} saved lane(s).`;
  }

  render(React.createElement(App, { manager, initialMessage }));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
