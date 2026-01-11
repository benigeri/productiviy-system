# Mobile Claude Code Setup Guide

Complete guide to access Claude Code from your iPhone with push notifications.

## ✅ Completed Steps

- ✓ mosh installed
- ✓ tmux installed
- ✓ Notification hook script created
- ✓ Claude Code hooks configured

## 📋 Remaining Steps

### 1. Install and Configure Tailscale

**On your Mac:**
1. Download Tailscale: https://tailscale.com/download/mac
2. Install the .pkg file
3. Open Tailscale from Applications
4. Sign in (use Google, Microsoft, or GitHub account)
5. Verify it's running (icon should appear in menu bar)

**On your iPhone:**
1. Install Tailscale from the App Store
2. Open and sign in with the same account
3. Both devices should now appear in your Tailscale network

**Verify connection:**
```bash
# On Mac, get your Tailscale IP
tailscale ip -4
```

Note this IP address - you'll use it in Termius.

---

### 2. Set up Poke Push Notifications

**Sign up for Poke:**
1. Go to https://poke.app
2. Create an account
3. Install Poke app on your iPhone from the App Store
4. Sign in to the app

**Create webhook:**
1. In Poke web dashboard, create a new webhook
2. Copy the webhook URL (looks like: `https://poke.app/api/webhooks/YOUR_TOKEN`)

**Set environment variable on Mac:**

Add to your `~/.zshrc` (or `~/.bashrc` if using bash):
```bash
export POKE_WEBHOOK_URL="https://poke.app/api/webhooks/YOUR_TOKEN"
```

Then reload:
```bash
source ~/.zshrc
```

**Test the notification:**
```bash
python3 /Users/benigeri/Projects/productiviy-system/.claude/hooks/notification-hook.py "Test" "Notifications working!" 1
```

You should receive a push notification on your iPhone!

---

### 3. Configure tmux Auto-Attach

Add to your `~/.zshrc` (or `~/.bashrc`):

```bash
# Auto-attach to tmux on SSH login
if [[ -n "$SSH_CONNECTION" ]] && [[ -z "$TMUX" ]]; then
  # Attach to existing session or create new one
  tmux attach-session -t claude-mobile 2>/dev/null || tmux new-session -s claude-mobile
fi
```

Then reload:
```bash
source ~/.zshrc
```

**Optional: Create a dedicated tmux config for mobile**

Create `~/.tmux.conf` if you don't have one:
```bash
# Enable mouse support
set -g mouse on

# Increase scrollback buffer
set -g history-limit 50000

# Start windows at 1 instead of 0
set -g base-index 1

# Renumber windows when one is closed
set -g renumber-windows on

# Status bar styling
set -g status-style bg=black,fg=white
set -g status-left '[#S] '
set -g status-right '%H:%M %d-%b'
```

---

### 4. Configure SSH for Mobile Access

Edit `~/.ssh/config`:

```bash
# Claude Code mobile access
Host mac-claude
    HostName YOUR_TAILSCALE_IP  # From step 1
    User benigeri
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

Replace `YOUR_TAILSCALE_IP` with the IP from step 1.

---

### 5. Install and Configure Termius on iPhone

**Install Termius:**
1. Download Termius from the App Store
2. Open and create an account (or skip)

**Add your Mac as a host:**
1. Tap the "+" button
2. Select "New Host"
3. Fill in:
   - **Label**: "Mac Claude Code"
   - **Address**: Your Tailscale IP (from step 1)
   - **Username**: `benigeri`
   - **Use mosh**: Toggle ON
   - **Port**: 22 (default)
4. Set up SSH key or password authentication
5. Save

**Enable mosh:**
- In the host settings, make sure "Use mosh" is enabled
- mosh will keep your connection alive when switching between WiFi and cellular

---

### 6. Test the Complete Setup

**On your iPhone:**
1. Open Termius
2. Connect to "Mac Claude Code"
3. You should automatically attach to tmux
4. Start a new Claude Code session:
   ```bash
   cd ~/Projects/productiviy-system
   claude-code
   ```

**Test notifications:**
1. In Claude Code, start a task that requires input
2. Lock your iPhone
3. You should receive a push notification when Claude needs input
4. You should receive a notification when Claude finishes

---

## 🎯 Workflow

Once setup is complete:

1. **Start tasks from iPhone**: SSH via Termius → tmux → Claude Code
2. **Pocket your phone**: Walk away, Claude works in the background
3. **Get notified**: Receive push notifications when:
   - Claude needs your input
   - Claude needs permission for a tool
   - Claude finishes a task
4. **Resume anytime**: Connection persists thanks to mosh, even when switching networks

---

## 🔍 Troubleshooting

**Notifications not working?**
```bash
# Check env var is set
echo $POKE_WEBHOOK_URL

# Test notification manually
python3 .claude/hooks/notification-hook.py "Test" "Hello"

# Check Claude Code hooks
cat .claude/settings.json
```

**Can't connect via Termius?**
- Verify both devices show "Connected" in Tailscale
- Check your Tailscale IP hasn't changed: `tailscale ip -4`
- Try regular SSH first before enabling mosh

**tmux not auto-attaching?**
```bash
# Check your shell profile
cat ~/.zshrc | grep tmux

# Manually test
tmux attach-session -t claude-mobile
```

**mosh connection drops?**
- Make sure mosh ports (60000-61000 UDP) aren't blocked
- Check Tailscale is running on both devices
- Try reconnecting from Termius

---

## 🚀 Advanced: Multiple Parallel Agents

To run multiple Claude agents in parallel (like in the article):

1. **Create multiple tmux windows:**
   ```bash
   # Window 1: Main feature
   tmux new-window -n "feature-auth"
   cd ~/Projects/productiviy-system
   claude-code

   # Window 2: Another task
   tmux new-window -n "bugfix-email"
   cd ~/Projects/productiviy-system
   claude-code
   ```

2. **Switch between windows:**
   - `Ctrl+b n` - Next window
   - `Ctrl+b p` - Previous window
   - `Ctrl+b 0-9` - Jump to window number

3. **Each Claude agent works independently** and will send notifications when done!

---

## 💡 Tips

- **Name your tmux windows** to track different tasks: `Ctrl+b ,` then type name
- **Detach from tmux** (stay connected): `Ctrl+b d`
- **List tmux sessions**: `tmux ls`
- **Kill a session**: `tmux kill-session -t session-name`
- **Notifications work best** when you let Claude work on 10-20 minute tasks
- **Battery life**: Termius + mosh is quite efficient, but close connection when not needed

---

## 📱 Next Steps After Setup

Once everything works:
- Test with a simple Claude task that asks questions
- Try starting a task and walking away
- Verify notifications arrive on your locked iPhone
- Experiment with multiple tmux windows for parallel work

Enjoy coding from anywhere! 🎉
