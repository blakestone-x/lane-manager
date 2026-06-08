# Lane Manager

Multi-session orchestrator that tiles concurrent **Claude Code** sessions side-by-side in a single terminal UI. Each lane is its own long-lived `claude` subprocess with its own working directory, system prompt, message history, and full Claude Code tool set.

Token usage comes from your Claude subscription (the same account your `claude` CLI is logged into) — no `ANTHROPIC_API_KEY` required, no API billing.

Feels like having 2–3 Claude Code chat windows tiled next to each other.

## Features

- **One Claude Code subprocess per lane** — spawns the `claude` CLI in stream-json mode; messages flow via stdin, responses stream back via stdout
- **Subscription-powered** — piggybacks on your existing Claude Code auth (no API key needed)
- **Full Claude Code capability** — every lane gets file tools, Bash, Edit, Grep, Glob, MCP servers, worktrees, skills, slash commands, etc.
- **Side-by-side chat columns** — each lane is a vertical column with header, scrollable history, and its own input box
- **Multi-turn memory** — each lane keeps one subprocess alive across turns so Claude Code's session context is preserved
- **Lane lifecycle** — create, focus, pause, resume, kill, bridge context between lanes
- **Session persistence** — lane metadata auto-saves to `~/.lane-manager/`; Claude Code owns the actual conversation log via its own session store
- **ICS repo templates** — pre-configured lanes for ICS Portal, Meridian, Cypress, Sentinel, etc.
- **Token + cost tracking** — per-lane and total input/output/cache/cost in the status bar

## Requirements

- Node.js ≥ 20
- The `claude` CLI installed and logged in (`claude auth`). Install at <https://claude.com/code>
- Lane Manager auto-locates the binary on PATH, at `%APPDATA%\Claude\claude-code\<ver>\claude.exe`, or under `~/.claude/local/`. Override with `CLAUDE_BIN=/path/to/claude` or `--claude-bin <path>`.

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
lm --claude-bin /path # override claude CLI path
```

Without the link:

```bash
npm run launch        # builds if needed, then launches
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

- Panes are tiled left-to-right. The focused pane has a double border and an active input.
- **Tab** / **Ctrl+N** cycle focus forward; **Shift+Tab** / **Ctrl+P** cycle backward.
- Type a message inside the focused pane's input and press **Enter** to send.
- Press **/** (with an empty pane input) to open the command bar at the bottom; **ESC** cancels.
- When there are more lanes than panes that fit, cycling focus scrolls the visible window.

## Commands

| Command | Description |
|---|---|
| `/new <name> [cwd] [--template <name>] [--model <alias>]` | Spawn a new lane |
| `/switch <name>` | Focus a different lane |
| `/list` (or `/ls`) | List all lanes |
| `/kill <name>` | Stop and remove a lane |
| `/pause [name]` | Pause a lane (default: focused) |
| `/resume [name]` | Resume a paused lane |
| `/bridge <from> <to> <msg>` | Inject context from one lane into another |
| `/send <name> <msg>` | Send message to a specific lane |
| `/status` | Overview of all lanes + tokens + cost |
| `/templates` | List ICS repo templates |
| `/restore` | Restore all saved lanes |
| `/help` | Show help |
| `/quit` or `/exit` | Shut down all lanes and exit |

## Example

Spin up research and implementation lanes on different repos, tiled next to each other:

```
/new research
/new portal --template ics-portal
/new meridian --template meridian
(focus portal pane)
wire up a new /api/health route and return {ok:true,ts}
(focus research pane)
read the relay docs and summarize the auth flow
```

Bridge a finding:

```
/bridge research portal "Auth middleware lives in src/lib/auth.ts — HS256 JWT sessions"
```

## Architecture

- `src/claude-session.ts` — spawns `claude --print --input-format stream-json --output-format stream-json` per lane; parses NDJSON events (`system`, `assistant`, `user` tool results, `result`)
- `src/lane.ts` — one lane: wraps a ClaudeSession, manages status, display history, token totals, pending input queue
- `src/lane-manager.ts` — central registry of lanes; create/kill/pause/resume/bridge
- `src/commands/handler.ts` — slash-command parser
- `src/ui/app.tsx` — Ink app shell; side-by-side panes; command bar
- `src/ui/lane-pane.tsx` — vertical chat column (header / history / input)
- `src/ui/status-bar.tsx` — status / tokens / help line
- `src/ics/templates.ts` — ICS repo templates
- `src/config.ts` — binary resolution and on-disk persistence of lane metadata

## Config

- `CLAUDE_BIN` — override claude CLI path
- `LANE_MANAGER_MODEL` — default model alias (e.g. `sonnet`, `opus`). Overridden by `--model`
- Saved lanes live at `~/.lane-manager/lanes/*.json`
- Each lane's conversation state is owned by Claude Code under its own session store (`~/.claude/projects/...`) and resumed by its stored session id

## Roadmap

- Optional token-by-token streaming (`--include-partial-messages`) for real-time feel
- Opening an existing Claude Code session picker from the UI (`/from-session`)
- Per-lane worktree flag passthrough (`--worktree`)
- Priority-queued rate-limit handling across lanes
- Web/electron surface tiling the same sessions

## License

MIT
