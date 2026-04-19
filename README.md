# Lane Manager

Multi-lane orchestrator for concurrent Claude Agent SDK sessions. Run multiple independent coding, research, and planning lanes side-by-side in a single terminal UI — each with its own system prompt, working directory, context, and task queue.

Built for managing 12+ repos where you need several concurrent Claude sessions, not a single serialized chat.

## Features

- **Multiple independent lanes** — each lane is its own Claude conversation with isolated context and history
- **Concurrent execution** — lanes run in parallel, not sequential
- **Lane lifecycle** — create, pause, resume, kill, bridge context between lanes
- **Ink-based TUI** — side-by-side panes, focused lane gets keyboard input
- **Tool use** — each lane has file read/write/edit, bash, grep, list_files, and git_status tools
- **Session persistence** — lanes auto-save to `~/.lane-manager/` and restore on restart
- **ICS repo templates** — pre-configured lanes for ICS Portal, Meridian, Cypress, Sentinel, etc.
- **Token tracking** — per-lane and total token usage in the status bar

## Install

```bash
cd lane-manager
npm install
npm run build
```

Optionally link globally:

```bash
npm link
lane-manager   # or: lm
```

## Run

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
# or after build:
npm start
```

## Commands

Type commands starting with `/` in the input bar. Anything without a leading `/` is sent as a message to the focused lane.

| Command | Description |
|---|---|
| `/new <name> [cwd] [--template <name>]` | Create a new lane |
| `/switch <name>` | Focus a different lane |
| `/list` (or `/ls`) | List all lanes |
| `/kill <name>` | Stop and remove a lane |
| `/pause [name]` | Pause a lane (default: active) |
| `/resume [name]` | Resume a paused lane |
| `/bridge <from> <to> <msg>` | Inject context from one lane into another |
| `/send <name> <msg>` | Send message to a specific lane |
| `/status` | Overview of all lanes + tokens |
| `/templates` | List ICS repo templates |
| `/restore` | Restore saved lanes |
| `/help` | Show help |
| `/quit` or `/exit` | Exit |

Key bindings:

- `Enter` — send
- `Ctrl+N` / `Ctrl+P` — next / previous lane
- `Ctrl+C` — quit

## Examples

Create a research lane and an implementation lane in parallel:

```
/new research
/new implement --template ics-portal
/switch research
read the relay docs and summarize the auth flow
/switch implement
wire up a new health check endpoint at /api/health
```

Bridge a finding between lanes:

```
/bridge research implement "Auth middleware lives in src/lib/auth.ts — session tokens are HS256 JWT"
```

## Architecture

- `src/lane-manager.ts` — central coordinator; manages lane lifecycle + events
- `src/lane.ts` — single lane (Claude SDK conversation + tool loop)
- `src/tools/` — tool definitions and executors
- `src/commands/handler.ts` — slash-command parser
- `src/ui/` — Ink TUI (app, lane pane, status bar)
- `src/ics/templates.ts` — ICS repo templates

## Config

- API key: `ANTHROPIC_API_KEY` env var
- Default model: `--model <name>` or `LANE_MANAGER_MODEL` env var (default `claude-sonnet-4-6`)
- State: `~/.lane-manager/` (lane JSON files)

## Phase 2 (future)

- Streaming token-by-token display
- Web UI with shared view
- Inter-lane MCP server for richer state sharing
- Priority-queued rate-limit handling
- Per-lane token budgets with warning/hard stops
- Git-aware lane status (dirty files, ahead/behind, CI state)

## License

MIT
