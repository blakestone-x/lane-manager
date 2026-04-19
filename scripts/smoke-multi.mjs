// Verify multi-turn conversation memory in one Claude Code subprocess.
import { ClaudeSession } from '../dist/claude-session.js';
import { resolveClaudeBinary } from '../dist/config.js';
import { randomUUID } from 'crypto';

const bin = resolveClaudeBinary();
const sess = new ClaudeSession({
  claudeBin: bin,
  cwd: process.cwd(),
  sessionId: randomUUID(),
  bypassPermissions: true,
});

const assistantTexts = [];
let turnsComplete = 0;
const deadline = Date.now() + 120_000;

sess.on('event', (e) => {
  if (e.type === 'assistant_text') assistantTexts.push(e.text);
  if (e.type === 'turn_complete') turnsComplete++;
  if (e.type === 'ready') console.log('[ready]');
  if (e.type === 'exit') console.log(`[exit code=${e.code}]`);
});

sess.start();
await waitUntil(() => sess.isReady() || Date.now() > deadline);

sess.sendUserMessage('Remember the word PAPERCLIP. Reply with exactly OK.');
await waitUntil(() => turnsComplete >= 1 || Date.now() > deadline);
console.log('[turn1 reply]', assistantTexts[assistantTexts.length - 1]);

sess.sendUserMessage('What word did I ask you to remember? Reply with just the word.');
await waitUntil(() => turnsComplete >= 2 || Date.now() > deadline);
console.log('[turn2 reply]', assistantTexts[assistantTexts.length - 1]);

sess.shutdown();
await new Promise((r) => setTimeout(r, 500));

const pass = turnsComplete >= 2 && /PAPERCLIP/i.test(assistantTexts[assistantTexts.length - 1] ?? '');
console.log('RESULT:', pass ? 'PASS' : 'FAIL', `turns=${turnsComplete}`);
process.exit(pass ? 0 : 1);

function waitUntil(cond) {
  return new Promise((res) => {
    const tick = () => (cond() ? res() : setTimeout(tick, 100));
    tick();
  });
}
