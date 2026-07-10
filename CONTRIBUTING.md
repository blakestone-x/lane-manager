# Contributing to Lane Manager

Thanks for looking at the internals. Lane Manager is a small TypeScript + Ink TUI; contributions that keep it simple and well-typed are the easiest to land.

## Getting set up

```bash
git clone https://github.com/blakestone-x/lane-manager.git
cd lane-manager
npm install
npm run build      # tsc -> dist/
```

Building needs nothing beyond Node 20+. To actually run lanes you need Claude Code auth on the machine: a logged-in `claude` CLI, or an `ANTHROPIC_API_KEY` if that is how your Claude Code is set up.

```bash
npm run dev        # tsx, no build step
```

## Build scripts

| Script | What it does |
|---|---|
| `npm run build` | Type-check and compile to `dist/` (`tsc`). |
| `npm run dev` | Run from source with `tsx`, no build. |
| `npm start` | Run the compiled `dist/index.js`. |
| `npm run smoke` | Live smoke tests of the session layer (needs Claude auth, spends tokens). |
| `npm run clean` | Remove `dist/`. |

## Project layout

```
src/
  lane-manager.ts      central coordinator; lane lifecycle + events
  lane.ts              a single lane wrapping one Claude Agent SDK session
  claude-session.ts    Agent SDK query() wrapper; streaming input + event mapping
  commands/handler.ts  slash-command parser
  ui/                  Ink TUI (app, lane pane, status bar)
  templates.ts         user-defined lane templates
  config.ts            global config + lane persistence
```

## Coding conventions

- **TypeScript, strict.** Keep types explicit at module boundaries.
- **Small, focused PRs.** One concern per pull request; keep the diff to what the change needs.
- **No secrets in code or fixtures.** Credentials come from your Claude Code login or the environment only.
- **`npm run build` must pass** before you open a PR. CI runs it on every push and PR.

## Pull requests

- [ ] `npm run build` is clean.
- [ ] New behavior is covered by a manual test note in the PR description (there is no automated suite yet; `npm run smoke` covers the session layer).
- [ ] Commits are scoped and the diff contains only what the change needs.

Open an issue first if you're planning something large (e.g. the items under "Roadmap" in the README) so we can agree on the shape before you build it.
