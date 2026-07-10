# Lane Manager

Multi-lane orchestrator for concurrent Claude Agent SDK sessions. Lane Manager tiles independent Claude Code agent sessions side by side in a single terminal UI. Each lane is its own long-lived session with its own working directory, system prompt, conversation history, and the full Claude Code tool set. Sessions are created and driven through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).

Lanes authenticate the same way your Claude Code does: a logged-in `claude` CLI (subscription) or an `ANTHROPIC_API_KEY` if that is how your setup works.

It feels like having two or three Claude Code chat windows tiled next to each other.

## How it works

- **One Agent SDK session per lane.** Each lane calls `query()` from `@anthropic-ai/claude-agent-sdk` in streaming input mode. The session stays alive across turns, so each lane keeps its own conversation context.
- **Real concurrency.** Lanes run independently. You can have one lane refactoring in repo A while another researches in repo B.
- **Full Claude Code capability.** Lanes load your user and project settings, so file tools, Bash, Grep, MCP servers, skills, and CLAUDE.md all work per lane.
- **Lane lifecycle.** Create, focus, pause, resume, kill, and bridge context between lanes. `/bridge` injects a finding from one lane into another as a new message.
- **Session persistence.** Lane metadata (name, cwd, tokens, message log) auto-saves to `~/.lane-manager/`. Conversation state lives in Claude Code's own session store. A restored lane resumes by session id once it has completed at least one turn; before that it starts fresh.
- **Token and cost tracking.** The status bar shows total input and output tokens plus cost across lanes; `/status` adds cache read/write figures.
- **Ink TUI.** Panes are React components rendered with Ink. Each pane shows the most recent messages that fit its height.

## Permissions

By default a lane runs with Claude Code's normal permission rules. In this headless mode, tool calls that would need an interactive prompt are denied unless your Claude Code settings already allow them.

`/new <name> --bypass` starts a lane with all permission checks disabled (the SDK's `bypassPermissions` mode, equivalent to `claude --dangerously-skip-permissions`). The lane can then edit files and run commands in its working directory without asking. Only use it in directories where you accept that.

## Requirements

- Node.js 20 or newer
- Claude Code auth on the machine: log in once with the `claude` CLI, or set `ANTHROPIC_API_KEY`. The SDK ships its own Claude Code runtime, so the CLI itself is not required to run lanes.

## Install

```bash
git clone https://github.com/blakestone-x/lane-manager.git
cd lane-manager
npm run setup   # npm install + npm run build + npm link
```

`npm run setup` symlinks two global commands: `lane-manager` and the short alias `lm`.

If you prefer not to link globally:

```bash
npm install
npm run build
```

## Run

Once linked:

```bash
lm                    # launch the TUI
lm --help             # options
lm --list             # show saved lanes and exit
lm --model opus       # override default model alias for new lanes
```

Without the link:

```bash
npm run launch        # builds, then launches
npm run dev           # tsx, no build step
npm start             # runs dist/index.js directly
```

### Desktop shortcut (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-desktop-shortcut.ps1
```

Drops "Lane Manager.lnk" on your Desktop; double-click to launch via `scripts\launch.bat`.

### One-shot launchers

- Windows: `scripts\launch.bat`
- macOS/Linux: `scripts/launch.sh`

## Using the UI

- Panes are tiled left to right. The focused pane has a double border and an active input.
- **Tab** / **Ctrl+N** cycle focus forward; **Shift+Tab** / **Ctrl+P** cycle backward.
- Type a message inside the focused pane's input and press **Enter** to send.
- Press **/** (with an empty pane input) to open the command bar at the bottom; **ESC** cancels.
- When there are more lanes than panes that fit, cycling focus scrolls the visible window.

## Commands

| Command | Description |
|---|---|
| `/new <name> [cwd] [--template <name>] [--model <alias>] [--bypass]` | Spawn a new lane |
| `/switch <name>` | Focus a different lane |
| `/list` (or `/ls`) | List all lanes |
| `/kill <name>` | Stop and remove a lane |
| `/pause [name]` | Pause a lane (default: focused) |
| `/resume [name]` | Resume a paused lane |
| `/bridge <from> <to> <msg>` | Inject context from one lane into another |
| `/send <name> <msg>` | Send message to a specific lane |
| `/status` | Overview of all lanes + tokens + cost |
| `/templates` | List your lane templates |
| `/restore` | Restore all saved lanes |
| `/help` | Show help |
| `/quit` or `/exit` | Shut down all lanes and exit |

## Templates

Templates are user-defined shortcuts for lanes you spawn often. Put a JSON array in `~/.lane-manager/templates.json`:

```json
[
  {
    "name": "api",
    "cwd": "~/code/api-server",
    "systemPrompt": "You are working on the API server. Keep changes small and typed.",
    "description": "API server repo"
  },
  {
    "name": "docs",
    "cwd": "~/code/docs-site",
    "description": "Documentation site"
  }
]
```

`name` and `cwd` are required; `systemPrompt` and `description` are optional. `~` expands to your home directory. Then `/new work --template api` starts a lane in that repo with that system prompt.

## Example

Spin up a research lane and an implementation lane on different repos:

```
/new research ~/code/docs-site
/new api ~/code/api-server
(focus api pane)
wire up a new /api/health route and return {ok:true,ts}
(focus research pane)
read the middleware docs and summarize how request logging works
```

Bridge a finding:

```
/bridge research api "Request logging wraps every handler; new routes get it for free"
```

## Architecture

- `src/claude-session.ts` wraps one Agent SDK `query()` call per lane: streaming input for multi-turn, and maps SDK messages (assistant text, tool use, tool results, per-turn usage) onto a small event protocol
- `src/lane.ts` is one lane: session lifecycle, status machine, display history, token totals, pending input queue
- `src/lane-manager.ts` is the central registry: create, kill, pause, resume, bridge, restore
- `src/commands/handler.ts` parses slash commands
- `src/ui/app.tsx` is the Ink app shell: side-by-side panes and the command bar
- `src/ui/lane-pane.tsx` renders one chat column (header, history, input)
- `src/ui/status-bar.tsx` renders status, tokens, and the help line
- `src/templates.ts` loads user templates from `~/.lane-manager/templates.json`
- `src/config.ts` handles global config and on-disk persistence of lane metadata

## Config

- `LANE_MANAGER_MODEL` sets the default model alias (e.g. `sonnet`, `opus`). `--model` overrides it.
- `CLAUDE_BIN` (or `--claude-bin`) optionally points the SDK at a specific Claude Code executable instead of its bundled runtime.
- Saved lanes live at `~/.lane-manager/lanes/*.json`.
- Each lane's conversation state is owned by Claude Code under its own session store (`~/.claude/projects/...`) and resumed by its stored session id.

## Testing

There is no unit suite yet. Two live smoke tests exercise the session layer end to end and spend real tokens:

```bash
npm run build
npm run smoke   # one-turn session test, then a multi-turn memory test
```

They need working Claude Code auth. CI runs install and the strict TypeScript build on Node 20 and 22.

## Status

Pre-1.0 (v0.2.x). The core loop works: concurrent lanes, multi-turn context per lane, restore by session id, bridging. Interfaces may still change between minor versions. Roadmap:

- Optional token-by-token streaming (`includePartialMessages`) for a real-time feel
- Opening an existing Claude Code session picker from the UI (`/from-session`)
- Per-lane worktree support
- Priority-queued rate-limit handling across lanes

## License

MIT
