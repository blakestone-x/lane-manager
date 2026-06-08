# Security Policy

Lane Manager runs locally and drives the Anthropic API on your behalf. It has no
server, no account system, and no telemetry. The sensitive material is your
`ANTHROPIC_API_KEY` and whatever the lanes read and write on your filesystem.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub's
[private vulnerability reporting](https://github.com/blakestone-x/lane-manager/security/advisories/new)
rather than opening a public issue. Include a description, affected version, and
a minimal reproduction if you have one. Expect an initial response within a week.

## Scope

In scope:

- Leakage of the `ANTHROPIC_API_KEY` (e.g. into logs, persisted lane state under
  `~/.lane-manager/`, or error output).
- A lane's file/bash tools escaping the working directory they were scoped to in a
  way the user did not intend.

Out of scope:

- Actions you explicitly instruct a lane to take. Lanes execute file, bash, and
  git tools on your behalf — treat them like a shell you are driving.
- Third-party model behavior; prompts are sent to Anthropic under your own key and
  their terms.

## Supported versions

Lane Manager is pre-1.0 and ships fixes against the latest published version only.
Run current `main` for security fixes.
