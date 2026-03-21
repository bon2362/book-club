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
- `api.telegram.org` accessible from the devcontainer — **already in the allowlist** (line 85 of `init-firewall.sh`)

### Changes required

**`.devcontainer/init-firewall.sh`** — two changes:
1. **Fix existing syntax error on line 87** — missing closing quote: `"cdn.playwright.dev\` → `"cdn.playwright.dev"`
2. **Add Bun installer domains** to the allowlist:
   - `bun.sh` — Bun installer script
   - `objects.githubusercontent.com` — Bun binary download (if not already covered by existing GitHub IP ranges)

> Note: The firewall resolves domains to IPs at container start via `dig`. GitHub CIDR ranges are fetched separately from the domain list — `objects.githubusercontent.com` may already be covered, but adding it explicitly is safe and explicit.

**`Dockerfile`** — install Bun at build time (preferred over `postCreateCommand` because firewall is not yet active during `docker build`):
```dockerfile
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
# or for node user:
# RUN su node -c "curl -fsSL https://bun.sh/install | bash"
```
The Bun installer appends to `~/.zshrc` and `~/.bashrc` automatically — PATH is set for interactive shells. The `ENV PATH` line ensures it's also available in non-interactive shell contexts.

**`~/.zshrc` in container** — convenience alias (add via `postCreateCommand` or dotfiles):
```bash
alias claude-tg="claude --channels plugin:telegram@claude-plugins-official"
```

### One-time setup (done by user after container rebuild)

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

- Token stored in `~/.claude/channels/telegram/.env` — this is inside the Docker named volume (`claude-code-config-book-club`), **not** in `/workspace`, so it never appears in the git repository
- After pairing, set policy to `allowlist` so only the owner's user ID can interact with the bot

---

## Feature 2: Sleep Prevention (Amphetamine + launchd WatchPaths)

### How it works

- **Activation:** Manual — user enables Amphetamine session from menu bar before starting a long Claude session
- **Release:** Automatic — Claude Code `Stop` hook writes a marker file in `/workspace` → launchd on macOS detects the change via `WatchPaths` → shell script releases the Amphetamine session via AppleScript

No `fswatch` required — launchd's built-in `WatchPaths` key watches the file natively.

### Components

**In devcontainer — Claude Code `Stop` hook** (`.claude/settings.local.json`):

`Stop` is a valid Claude Code lifecycle hook — it fires when the Claude Code session exits. Add alongside existing hooks:
```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "touch /workspace/.claude-session-done"
      }
    ]
  }
}
```

The marker file `/workspace/.claude-session-done` lives in the bind-mounted workspace, visible from both the container (at `/workspace/.claude-session-done`) and macOS (at the project directory path on the host, e.g. `~/code/book-club/.claude-session-done`).

Add `.claude-session-done` to `.gitignore`.

**On macOS — release script** (`~/scripts/amphetamine-release.sh`):
```bash
#!/bin/bash
# Idempotent — safe to call even if no Amphetamine session is active
osascript -e '
  tell application "Amphetamine"
    if (current session is not missing value) then
      end current session
    end if
  end tell
' 2>/dev/null || true
```

**On macOS — launchd plist** (`~/Library/LaunchAgents/com.user.claude-done-watcher.plist`):

Uses `WatchPaths` — launchd launches the script automatically when the marker file is created or its mtime changes. No `fswatch` needed.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.claude-done-watcher</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/YOURNAME/scripts/amphetamine-release.sh</string>
    </array>

    <key>WatchPaths</key>
    <array>
        <!-- macOS host path to the marker file, e.g.: -->
        <string>/Users/YOURNAME/code/book-club/.claude-session-done</string>
    </array>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
```

Replace `YOURNAME` and the project path with actual values.

### One-time macOS setup

1. Install **Amphetamine** from App Store
2. Create `~/scripts/amphetamine-release.sh` and `chmod +x ~/scripts/amphetamine-release.sh`
3. Create the plist at `~/Library/LaunchAgents/com.user.claude-done-watcher.plist` with correct paths
4. Load the agent: `launchctl load ~/Library/LaunchAgents/com.user.claude-done-watcher.plist`
5. Verify: `launchctl list | grep claude-done`

### Out of scope

- Automatic Amphetamine *start* — no session-start hook exists in Claude Code; user activates manually from menu bar
- Notifying book club members via Telegram — separate feature

---

## File changes summary

| Action | File | Purpose |
|--------|------|---------|
| Modify | `.devcontainer/init-firewall.sh` | Fix syntax error line 87; add `bun.sh`, `objects.githubusercontent.com` |
| Modify | `Dockerfile` | Install Bun at build time |
| Modify | `.claude/settings.local.json` | Add `Stop` hook to write marker file |
| Modify | `.gitignore` | Add `.claude-session-done` |
| Create (macOS) | `~/scripts/amphetamine-release.sh` | Idempotent AppleScript Amphetamine release |
| Create (macOS) | `~/Library/LaunchAgents/com.user.claude-done-watcher.plist` | launchd WatchPaths watcher |
