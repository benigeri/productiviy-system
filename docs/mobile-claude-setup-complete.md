# Mobile Claude Code Setup - Complete Guide

**Status:** ✅ Fully configured and working

**Date:** 2026-01-10

---

## What You Have

A complete mobile development setup that lets you:
- Access Claude Code agents from your iPhone via Termius
- Get push notifications when Claude needs input or finishes tasks
- Work with Agent Deck sessions remotely
- Start new Claude sessions from your phone
- Maintain persistent connections (mosh survives WiFi ↔️ cellular switches)

---

## Infrastructure

### Network & Access
- **Tailscale VPN**: Secure private network between Mac and iPhone
  - Mac IP: `100.127.209.52`
  - No public internet exposure
- **mosh**: Persistent SSH that survives network transitions
  - Server path: `/opt/homebrew/bin/mosh-server`
- **Termius**: iOS SSH/mosh client
  - Host: "Mac Claude Code"
  - Address: `100.127.209.52`
  - User: `benigeri`
  - Port: 22
  - Mosh: Enabled

### Notifications
- **Service**: ntfy.sh (free, open source)
- **Topic**: `claude-paul-x7k9m2qr`
- **Webhook URL**: `https://ntfy.sh/claude-paul-x7k9m2qr`
- **Environment Variable**: `POKE_WEBHOOK_URL` (in `~/.zshrc`)
- **Priority Levels**:
  - High (5): Claude needs input, permission requests
  - Normal (3): Task completion

### Session Management
- **tmux**: Auto-attaches on SSH login (configured in `~/.zshrc`)
- **Auto-attach session**: `claude-mobile` (created automatically on first SSH)
- **Agent Deck integration**: All Agent Deck sessions visible via `tmux ls`

---

## Files & Configuration

### Notification Hook Script
**Location:** `/Users/benigeri/Projects/productiviy-system/.claude/hooks/notification-hook.py`

Handles three types of notifications:
1. `idle_prompt` - Claude waiting for user input (high priority)
2. `permission_prompt` - Claude needs permission for a tool (high priority)
3. `Stop` hook - Claude finished a task (normal priority)

### Claude Code Hooks

**Global settings:** `~/.claude/settings.json`
```json
{
  "hooks": {
    "Notification": [
      {"matcher": "idle_prompt", ...},
      {"matcher": "permission_prompt", ...}
    ],
    "Stop": [...]
  }
}
```

**Project settings:** `/Users/benigeri/Projects/productiviy-system/.claude/settings.json`
- Same notification hooks (project-specific)
- Also includes pre-commit checks for bash commands

### Environment Configuration

**`~/.zshrc`:**
```bash
# Claude Code mobile notifications via ntfy.sh
export POKE_WEBHOOK_URL="https://ntfy.sh/claude-paul-x7k9m2qr"

# Auto-attach to tmux on SSH login
if [[ -n "$SSH_CONNECTION" ]] && [[ -z "$TMUX" ]]; then
  tmux attach-session -t claude-mobile 2>/dev/null || tmux new-session -s claude-mobile
fi
```

**`~/.zprofile`:**
```bash
# Ensure homebrew binaries are in PATH for SSH sessions (especially mosh-server)
export PATH="/opt/homebrew/bin:$PATH"
```

**`~/.ssh/config`:**
```
Host mac-claude
    HostName 100.127.209.52
    User benigeri
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

---

## Workflow

### Starting Work (Agent Deck)
1. Open Agent Deck on Mac
2. Start 2-3 parallel Claude agents as normal
3. Walk away from desk or go mobile
4. Notifications arrive when:
   - Any agent needs your input
   - Any agent needs permission
   - Any agent finishes

### Checking on Work (Mobile)
```bash
# From iPhone in Termius:

# List all sessions
tmux ls

# Attach to any Agent Deck session
tmux attach -t agentdeck_phonecode_9daa2a3a

# Check progress, then detach
Ctrl+b d
```

### Starting New Work (Mobile)
```bash
# From iPhone in Termius:

# Start a new session for specific task
cd ~/Projects/productiviy-system
tmux new-session -s mobile-feature-name
claude-code

# Give Claude a task
# Detach with Ctrl+b d
# Walk away, get notified when done
```

### Managing Multiple Sessions
```bash
# List all sessions (Agent Deck + mobile)
tmux ls

# Attach to specific session
tmux attach -t <session-name>

# Detach (keeps session running)
Ctrl+b d

# Kill a session (when done)
tmux kill-session -t <session-name>
```

---

## tmux Quick Reference

| Command | Action |
|---------|--------|
| `tmux ls` | List all sessions |
| `tmux attach -t <name>` | Attach to session |
| `tmux new-session -s <name>` | Create new session |
| `Ctrl+b d` | Detach from current session |
| `Ctrl+b [` | Scroll mode (arrow keys, `q` to quit) |
| `Ctrl+b n` | Next window |
| `Ctrl+b p` | Previous window |
| `Ctrl+b c` | Create new window in session |
| `tmux kill-session -t <name>` | Kill a session |

---

## Testing Notifications

**Manual test:**
```bash
curl -d "Test message" -H "Title: Test" -H "Priority: urgent" https://ntfy.sh/claude-paul-x7k9m2qr
```

**Test with Claude:**
1. Start a Claude session
2. Ask it a question requiring user input
3. Lock your iPhone
4. Should receive high-priority notification
5. Respond from iPhone
6. Should receive normal-priority notification when task completes

---

## Troubleshooting

### No push notifications on iPhone

**Check iOS Settings → ntfy:**
- ✅ Allow Notifications: ON
- ✅ Lock Screen: ON
- ✅ Banners: ON
- ✅ Sounds: ON

**Check ntfy app settings:**
- ✅ Instant Delivery: ON (critical!)
- ✅ Background App Refresh: ON

**Check if messages reach ntfy:**
- Open ntfy app
- Check if topic `claude-paul-x7k9m2qr` shows messages
- If messages appear but no push, it's an iOS settings issue

### Can't connect via Termius

**Check Tailscale:**
- Both Mac and iPhone show "Connected" in Tailscale app
- Mac IP is still `100.127.209.52` (run `tailscale ip -4` on Mac)

**Check Remote Login:**
- Mac: System Settings → Sharing → Remote Login: ON

**Check mosh:**
- In Termius, host command should be:
  `/opt/homebrew/bin/mosh-server new -s -c 256 -l LANG=en_US.UTF-8 -l LC_CTYPE=en_US.UTF-8`

### Hooks not firing

**Check environment variable:**
```bash
echo $POKE_WEBHOOK_URL
# Should show: https://ntfy.sh/claude-paul-x7k9m2qr
```

**Check hook script:**
```bash
python3 /Users/benigeri/Projects/productiviy-system/.claude/hooks/notification-hook.py "Test" "Message" 1
# Should send notification
```

**Restart Claude session:**
- Hooks only apply when session starts
- Exit and restart Claude Code to pick up hook changes

---

## Security Notes

- Tailscale provides encrypted VPN (no public SSH exposure)
- ntfy topic is obscure but technically public
  - Consider self-hosting ntfy for sensitive notifications
  - Or use a different notification service with authentication
- SSH uses password authentication
  - Consider setting up SSH keys for better security

---

## Future Improvements

1. **SSH Key Authentication**: More secure than passwords
2. **Self-hosted ntfy**: Complete privacy for notifications
3. **Custom tmux layouts**: Optimize for mobile screen size
4. **Agent Deck API integration**: Start agents remotely via API
5. **Notification filtering**: Only notify for specific types of tasks

---

## Quick Start Guide

**From iPhone:**
1. Open Tailscale app (make sure it's connected)
2. Open Termius
3. Tap "Mac Claude Code"
4. Enter password
5. Automatically attached to tmux
6. `cd ~/Projects/productiviy-system`
7. `claude-code` or `tmux ls` to see existing sessions
8. Lock phone and get notified when Claude needs you!

---

## Resources

- **ntfy.sh**: https://ntfy.sh/
- **ntfy iOS app**: https://apps.apple.com/us/app/ntfy/id1625396347
- **Tailscale**: https://tailscale.com/
- **Termius**: Search "Termius" in App Store
- **tmux guide**: https://github.com/tmux/tmux/wiki

---

**Setup completed by:** Claude Sonnet 4.5
**Setup date:** 2026-01-10
**Status:** ✅ Production ready
