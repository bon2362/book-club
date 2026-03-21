# Telegram Plugin + Sleep Prevention Design

**Date:** 2026-03-21
**Issue:** #77
**Status:** Approved

## Overview

Two related features:
1. **Telegram plugin** — connect Claude Code (running in devcontainer) to Telegram via Anthropic's official MCP plugin, so the user can send messages and receive responses from Claude remotely.
2. **Sleep prevention** — prevent macOS from sleeping during long Claude sessions, with automatic release when Claude finishes.

No custom bot code is written. The Telegram integration uses the official `telegram@claude-plugins-official` plugin.

---

## Feature 1: Telegram Plugin

### How it works

The official Anthropic Telegram MCP plugin (`claude-plugins-official`) runs a Bun-based MCP server inside the Claude Code session. It connects to Telegram Bot API via long-polling, forwards incoming DMs to Claude as `<channel>` notifications, and gives Claude tools to reply (`reply`, `react`, `edit_message`).

### Prerequisites

- A Telegram bot token from @BotFather
- Bun runtime installed in the devcontainer
- `api.telegram.org` accessible from the devcontainer (firewall change)

### Changes required

**`.devcontainer/init-firewall.sh`** — add to allowlist:
- `api.telegram.org` — Telegram Bot API
- `bun.sh` — Bun installer
- `objects.githubusercontent.com` — Bun binary download (GitHub releases)

**`Dockerfile` or `postCreateCommand`** — install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

**`~/.zshrc` in container** — convenience alias:
```bash
alias claude-tg="claude --channels plugin:telegram@claude-plugins-official"
```

### One-time setup (done by user, not automated)

1. Create bot via @BotFather → get token
2. Inside a running Claude session:
   ```
   /plugin install telegram@claude-plugins-official
   /telegram:configure <token>
   ```
3. Exit and relaunch: `claude --channels plugin:telegram@claude-plugins-official`
4. DM the bot on Telegram → get pairing code → `/telegram:access pair <code>`
5. Lock down: `/telegram:access policy allowlist`

### Security

- Token stored in `.claude/channels/telegram/.env` — not committed to git
- After pairing, set policy to `allowlist` so only the owner's user ID can interact with the bot

---

## Feature 2: Sleep Prevention (Amphetamine + fswatch)

### How it works

- **Activation:** Manual — user enables Amphetamine session from menu bar before starting a long Claude session
- **Release:** Automatic — Claude Code `Stop` hook writes a marker file → `fswatch` on macOS detects the change → AppleScript releases the Amphetamine session

### Components

**In devcontainer — Claude Code `Stop` hook** (`.claude/settings.local.json`):
```json
{
  "hooks": {
    "Stop": [{ "command": "touch /workspace/.claude-session-done" }]
  }
}
```

The marker file `/workspace/.claude-session-done` is in the bind-mounted workspace, visible from both the container and macOS host.

**On macOS — release script** (`~/scripts/amphetamine-release.sh`):
```bash
#!/bin/bash
osascript -e 'tell application "Amphetamine" to end current session'
```

**On macOS — launchd watcher** (`~/Library/LaunchAgents/com.user.claude-done-watcher.plist`):

Starts at login, watches for changes to the marker file using `fswatch`. When the file changes, runs the release script.

### One-time macOS setup

1. Install Amphetamine from App Store
2. `brew install fswatch`
3. Create `~/scripts/amphetamine-release.sh` and `chmod +x` it
4. Create and load the launchd plist (`launchctl load ...`)

### Out of scope

- Automatic Amphetamine *start* — no session-start hook exists in Claude Code; user activates manually
- Notifying book club members via Telegram — separate feature

---

## File changes summary

| Action | File | Purpose |
|--------|------|---------|
| Modify | `.devcontainer/init-firewall.sh` | Add Telegram + Bun domains to allowlist |
| Modify | `Dockerfile` or `devcontainer.json` | Install Bun |
| Modify | `.claude/settings.local.json` | Add Stop hook for marker file |
| Create | `~/.zshrc` alias (in container) | Convenience alias for `claude --channels` |
| Create (macOS) | `~/scripts/amphetamine-release.sh` | AppleScript release |
| Create (macOS) | `~/Library/LaunchAgents/com.user.claude-done-watcher.plist` | launchd fswatch watcher |
