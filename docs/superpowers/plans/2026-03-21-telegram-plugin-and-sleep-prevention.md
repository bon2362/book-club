# Telegram Plugin + Sleep Prevention Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the official Anthropic Telegram MCP plugin in the devcontainer and add automatic macOS sleep-prevention release when Claude finishes a session.

**Architecture:** Two independent parts — (1) devcontainer config changes to install Bun and fix the firewall, enabling the `telegram@claude-plugins-official` plugin; (2) macOS-side launchd + AppleScript setup to auto-release Amphetamine when Claude's `Stop` hook writes a marker file to `/workspace`.

**Tech Stack:** Bash (firewall), Dockerfile, Claude Code hooks (JSON), macOS launchd plist (XML), AppleScript

**Spec:** `docs/superpowers/specs/2026-03-21-telegram-plugin-and-sleep-prevention-design.md`

---

## File changes summary

| Action | File | Purpose |
|--------|------|---------|
| Modify | `.devcontainer/init-firewall.sh` | Fix syntax error line 87; add `bun.sh`, `objects.githubusercontent.com` |
| Modify | `.devcontainer/Dockerfile` | Install Bun as node user; add `claude-tg` alias |
| Modify | `.claude/settings.local.json` | Add `Stop` hook |
| Modify | `.gitignore` | Add `.claude-session-done` |
| Create (macOS) | `~/scripts/amphetamine-release.sh` | Idempotent Amphetamine release via AppleScript |
| Create (macOS) | `~/Library/LaunchAgents/com.user.claude-done-watcher.plist` | launchd WatchPaths watcher |

---

## Chunk 1: Devcontainer changes

### Task 1: Fix firewall syntax error and add Bun domain

**Files:**
- Modify: `.devcontainer/init-firewall.sh:87`

- [ ] **Step 1: Fix the syntax error on line 87**

Line 87 currently reads `"cdn.playwright.dev\` — it's missing the closing double-quote, which causes a parse error when the container starts. Fix it:

```bash
# Line 87 currently:
    "cdn.playwright.dev\
# Change to:
    "cdn.playwright.dev" \
```

Using the Edit tool, replace the broken line and add `bun.sh` and `objects.githubusercontent.com` to the domain list. The full block around that area should look like:

```bash
    "api.telegram.org" \
    "playwright.download.prss.microsoft.com" \
    "cdn.playwright.dev" \
    "bun.sh" \
    "objects.githubusercontent.com" \
    "update.code.visualstudio.com"; do
```

> Note: `objects.githubusercontent.com` is Bun's binary CDN — may already be covered by the GitHub CIDR ranges fetched at startup, but adding it explicitly guarantees it works at runtime (e.g. when the Telegram plugin spawns Bun processes).

- [ ] **Step 2: Verify the shell script is valid**

```bash
bash -n /workspace/.devcontainer/init-firewall.sh
```

Expected: no output (no errors). If you see a syntax error, the edit didn't apply correctly — check line 87 again.

- [ ] **Step 3: Commit**

```bash
git add .devcontainer/init-firewall.sh
git commit -m "fix: fix firewall syntax error on cdn.playwright.dev and add bun.sh"
```

---

### Task 2: Install Bun in Dockerfile

**Files:**
- Modify: `.devcontainer/Dockerfile` (after line 96, before line 100)

The Dockerfile switches to `USER node` at line 72 and stays there through the Claude install at line 96. The `USER root` block for the firewall starts at line 101. **Insert Bun installation between lines 96 and 101, while still under `USER node`** — do not add it after the `USER root` line.

- [ ] **Step 4: Add Bun install to Dockerfile**

After the line `RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`, and before the `# Copy and set up firewall script` comment, add:

```dockerfile
# Install Bun (required for Telegram MCP plugin)
# Must run as USER node (set at line 72) — installs to /home/node/.bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/home/node/.bun/bin:${PATH}"

# Add convenience alias for Claude with Telegram channel (baked into image)
RUN echo "alias claude-tg='claude --channels plugin:telegram@claude-plugins-official'" >> /home/node/.zshrc
```

- [ ] **Step 5: Verify Dockerfile has no obvious issues**

```bash
grep -n "bun\|claude-tg\|claude-code" /workspace/.devcontainer/Dockerfile
```

Expected output — three lines visible:
```
96:RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}
98:RUN curl -fsSL https://bun.sh/install | bash
99:ENV PATH="/home/node/.bun/bin:${PATH}"
100:RUN echo "alias claude-tg=..." >> /home/node/.zshrc
```
(line numbers may differ slightly)

- [ ] **Step 6: Commit**

```bash
git add .devcontainer/Dockerfile
git commit -m "feat: install Bun in devcontainer for Telegram MCP plugin"
```

---

### Task 3: Add Stop hook and gitignore entry

**Files:**
- Modify: `.claude/settings.local.json`
- Modify: `.gitignore`

- [ ] **Step 7: Add Stop hook to settings.local.json**

Read `.claude/settings.local.json` first to see the current structure. The `hooks` object currently has `PreToolUse` and `PostToolUse`. Add `Stop` at the same level:

```json
{
  "hooks": {
    "PreToolUse": [ ...existing... ],
    "PostToolUse": [ ...existing... ],
    "Stop": [
      {
        "type": "command",
        "command": "touch /workspace/.claude-session-done"
      }
    ]
  }
}
```

`Stop` hooks do not use a `matcher` key — they fire unconditionally when the Claude session exits.

- [ ] **Step 8: Verify JSON is valid**

```bash
python3 -m json.tool /workspace/.claude/settings.local.json > /dev/null && echo "JSON valid"
```

Expected: `JSON valid`

- [ ] **Step 9: Add .claude-session-done to .gitignore**

Append to the end of `.gitignore`:

```
# Claude session marker (used by macOS sleep prevention)
.claude-session-done
```

- [ ] **Step 10: Commit**

```bash
git add .claude/settings.local.json .gitignore
git commit -m "feat: add Stop hook for sleep prevention marker file"
```

---

## Chunk 2: macOS setup (manual steps, not in devcontainer)

These steps are run in a macOS Terminal, **not** inside the devcontainer.

### Task 4: Create Amphetamine release script

- [ ] **Step 11: Create the scripts directory and release script**

In a **macOS Terminal** (not devcontainer):

```bash
mkdir -p ~/scripts
cat > ~/scripts/amphetamine-release.sh << 'EOF'
#!/bin/bash
# Idempotent — safe to call even if no Amphetamine session is active
osascript -e '
  tell application "Amphetamine"
    if (current session is not missing value) then
      end current session
    end if
  end tell
' 2>/dev/null || true
EOF
chmod +x ~/scripts/amphetamine-release.sh
```

- [ ] **Step 12: Test the script manually**

Open Amphetamine from the App Store (install if not already installed). Start a session manually in the menu bar. Then run:

```bash
~/scripts/amphetamine-release.sh
```

Expected: Amphetamine session ends (icon in menu bar changes back to non-active state). Run again with no session active — should complete silently with exit 0.

---

### Task 5: Create launchd watcher plist

- [ ] **Step 13: Find your workspace path on macOS**

The marker file will be at `<localWorkspaceFolder>/.claude-session-done`. Find your workspace path:

```bash
# The workspace folder is wherever you cloned the book-club repo on your Mac.
# For example: ~/code/book-club
# Confirm by checking that the workspace mounts correctly:
ls ~/code/book-club/package.json  # or wherever your repo is
```

Note the full path — you'll need it in the next step.

- [ ] **Step 14: Create the launchd plist**

Replace `/Users/YOURNAME/code/book-club` with your actual path:

```bash
cat > ~/Library/LaunchAgents/com.user.claude-done-watcher.plist << 'EOF'
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
        <string>/Users/YOURNAME/code/book-club/.claude-session-done</string>
    </array>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF
```

Then substitute the actual paths:

```bash
# Replace placeholders (adjust paths as needed):
sed -i '' "s|/Users/YOURNAME/scripts|$HOME/scripts|g" \
  ~/Library/LaunchAgents/com.user.claude-done-watcher.plist
sed -i '' "s|/Users/YOURNAME/code/book-club|/path/to/your/repo|g" \
  ~/Library/LaunchAgents/com.user.claude-done-watcher.plist

# Verify the result:
cat ~/Library/LaunchAgents/com.user.claude-done-watcher.plist
```

Check that both paths look correct before proceeding.

- [ ] **Step 15: Load and verify the launchd agent**

```bash
launchctl load ~/Library/LaunchAgents/com.user.claude-done-watcher.plist
launchctl list | grep claude-done
```

Expected: the job appears in the list. The PID column will be `-` (not running) — that's correct, it only runs when the watch file changes.

- [ ] **Step 16: Test end-to-end**

1. Start Amphetamine session manually (click menu bar icon)
2. In a macOS Terminal, simulate what the Stop hook does:
   ```bash
   touch /path/to/your/repo/.claude-session-done
   ```
3. Wait 2-3 seconds
4. Verify Amphetamine session ended automatically

If it doesn't trigger: check `log stream --predicate 'subsystem == "com.apple.launchd"'` for errors, or check `~/Library/Logs/` for the agent log.

---

## Chunk 3: Telegram plugin one-time setup

These steps are done **inside the devcontainer**, after rebuilding it (so Bun is available).

### Task 6: Configure Telegram plugin

**Prerequisite:** Rebuild the devcontainer after the Dockerfile changes (Ctrl+Shift+P → "Rebuild Container").

- [ ] **Step 17: Verify Bun is installed after rebuild**

Inside devcontainer:
```bash
bun --version
```

Expected: version number like `1.x.x`. If "command not found", check that `ENV PATH="/home/node/.bun/bin:${PATH}"` is in the Dockerfile.

- [ ] **Step 18: Create a Telegram bot**

Open Telegram on your phone/desktop and start a chat with **@BotFather**:
1. Send `/newbot`
2. Choose a display name (e.g. "My Claude")
3. Choose a username ending in `bot` (e.g. `my_claude_assistant_bot`)
4. Copy the token — looks like `123456789:AAHfiqksKZ8...`

- [ ] **Step 19: Install and configure the plugin**

Inside a running Claude session (`claude`):

```
/plugin install telegram@claude-plugins-official
```

Wait for it to install, then:

```
/telegram:configure 123456789:AAHfiqksKZ8...
```

(Replace with your actual token)

- [ ] **Step 20: Relaunch Claude with the Telegram channel**

Exit the current session and start a new one with the channel flag:

```bash
claude --channels plugin:telegram@claude-plugins-official
# or use the alias:
claude-tg
```

- [ ] **Step 21: Pair your Telegram account**

1. Open Telegram and DM your new bot — it will reply with a 6-character pairing code
2. In the Claude session, enter: `/telegram:access pair <code>`
3. Lock down access: `/telegram:access policy allowlist`

- [ ] **Step 22: Test the integration**

Send a message to your bot from Telegram. Claude should receive it and reply. Try: "What time is it?"

---

## Notes

- **Container rebuild required** after Tasks 1–2 for Dockerfile changes to take effect. Tasks 3 and 4+ can be done before or after.
- **objects.githubusercontent.com** (Bun binary CDN) is likely already covered by the GitHub CIDR ranges fetched at firewall startup. If `bun.sh` install fails during container build, it means the CDN IPs aren't covered — add `objects.githubusercontent.com` to the firewall domain list as well.
- **Amphetamine start is manual** — no session-start hook exists in Claude Code. Activate from the menu bar before starting a long session; the launchd watcher handles the release automatically.
- **GH Issue #77:** After completing all tasks, close the issue with a comment referencing the commit hash.
