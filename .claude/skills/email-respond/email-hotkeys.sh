#!/bin/bash
# Email Workflow Hotkeys for tmux
# Binds Alt+A/S/D/V to send commands back to Claude Code conversation pane

# File to store the agent pane ID (where Claude Code is running)
AGENT_PANE_FILE="/tmp/email-agent-pane-id.txt"

# Setup hotkeys - called when panel is created
setup_hotkeys() {
    # Store the current pane ID (where Claude Code/Agent is running)
    local agent_pane_id
    agent_pane_id=$(tmux display-message -p '#{pane_id}')
    echo "$agent_pane_id" > "$AGENT_PANE_FILE"

    # Bind Alt+A (approve) - sends "approve" to agent pane
    tmux bind-key -n M-a run-shell "tmux send-keys -t \$(cat $AGENT_PANE_FILE) 'approve' Enter"

    # Bind Alt+S (skip) - sends "skip" to agent pane
    tmux bind-key -n M-s run-shell "tmux send-keys -t \$(cat $AGENT_PANE_FILE) 'skip' Enter"

    # Bind Alt+D (done) - sends "done" to agent pane
    tmux bind-key -n M-d run-shell "tmux send-keys -t \$(cat $AGENT_PANE_FILE) 'done' Enter"

    # Bind Alt+V (paste from clipboard) - paste multi-line clipboard to agent pane
    # This reads from clipboard, puts in tmux buffer, then pastes to agent pane
    tmux bind-key -n M-v run-shell "tmux set-buffer \"\$(pbpaste)\" && tmux paste-buffer -t \$(cat $AGENT_PANE_FILE)"
}

# Teardown hotkeys - called when panel is closed
teardown_hotkeys() {
    # Unbind the keys
    tmux unbind-key -n M-a 2>/dev/null || true
    tmux unbind-key -n M-s 2>/dev/null || true
    tmux unbind-key -n M-d 2>/dev/null || true
    tmux unbind-key -n M-v 2>/dev/null || true

    # Clean up the agent pane ID file
    rm -f "$AGENT_PANE_FILE"
}

# Main command handler
case "$1" in
    setup)
        setup_hotkeys
        ;;
    teardown)
        teardown_hotkeys
        ;;
    *)
        echo "Usage: $0 {setup|teardown}"
        echo ""
        echo "Commands:"
        echo "  setup    - Bind hotkeys (Alt+A/S/D/V) for email workflow"
        echo "  teardown - Unbind hotkeys and cleanup"
        exit 1
        ;;
esac
