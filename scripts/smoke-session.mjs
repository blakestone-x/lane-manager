// Smoke test for ClaudeSession: spawn a session, send one message, wait for result.
import { ClaudeSession } from '../dist/claude-session.js';
import { resolveClaudeBinary } from '../dist/config.js';
import { randomUUID } from 'crypto';

const bin = resolveClaudeBinary();
console.log('Using claude binary:', bin);

const sess = new ClaudeSession({
  claudeBin: bin,
  cwd: process.cwd(),
  sessionId: randomUUID(),
  bypassPermissions: true,
});

let gotReady = false;
let gotAssistantText = false;
let gotTurnComplete = false;
const deadline = Date.now() + 90_000;

sess.on('event', (e) => {
  if (e.type === 'stderr') return;
  console.log('[event]', e.type, e.type === 'assistant_text' ? e.text.slice(0, 80) : '');
  if (e.type === 'ready') gotReady = true;
  if (e.type === 'assistant_text') gotAssistantText = true;
  if (e.type === 'turn_complete') {
    gotTurnComplete = true;
    console.log('  usage:', e.usage);
  }
});

sess.start();

await waitUntil(() => sess.isReady() || Date.now() > deadline);
if (!sess.isReady()) {
  console.error('FAIL: session never became ready');
  process.exit(1);
}

console.log('Sending test message...');
sess.sendUserMessage('Reply with exactly the two words: PONG OK');

await waitUntil(() => gotTurnComplete || Date.now() > deadline);

sess.shutdown();
await new Promise((r) => setTimeout(r, 500));

const pass = gotReady && gotAssistantText && gotTurnComplete;
console.log('--- RESULT ---');
console.log('ready:', gotReady, 'assistant_text:', gotAssistantText, 'turn_complete:', gotTurnComplete);
process.exit(pass ? 0 : 1);

function waitUntil(cond) {
  return new Promise((res) => {
    const tick = () => {
      if (cond()) return res();
      setTimeout(tick, 100);
    };
    tick();
  });
}
