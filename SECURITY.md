# Security Policy

Lane Manager runs locally and drives Claude Code agent sessions through the
Claude Agent SDK on your behalf. It has no server, no account system, and no
telemetry. The sensitive surface is your Claude Code credentials (managed by
Claude Code itself, not by this tool) and whatever the lanes read and write on
your filesystem.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub's
[private vulnerability reporting](https://github.com/blakestone-x/lane-manager/security/advisories/new)
rather than opening a public issue. Include a description, affected version, and
a minimal reproduction if you have one. Expect an initial response within a week.

## Scope

In scope:

- Credential leakage (e.g. tokens or keys appearing in logs, persisted lane
  state under `~/.lane-manager/`, or error output).
- A lane's file/bash tools escaping the working directory they were scoped to in
  a way the user did not intend.
- Lane Manager enabling permission bypass without the user asking for it. By
  default lanes run with Claude Code's normal permission rules; only the
  explicit `--bypass` flag disables them.

Out of scope:

- Actions you explicitly instruct a lane to take. Lanes execute file, bash, and
  git tools on your behalf, and a `--bypass` lane does so without permission
  checks. Treat them like a shell you are driving.
- Third-party model behavior; prompts are sent to Anthropic under your own
  Claude Code auth and their terms.

## Supported versions

Lane Manager is pre-1.0 and ships fixes against the latest published version only.
Run current `main` for security fixes.
