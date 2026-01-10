#!/bin/bash
# Email Workflow Hotkeys for tmux
# Binds Alt+A/S/D/V to send commands back to Claude Code conversation pane
#
# PLATFORM: macOS only (uses pbpaste for clipboard)

# File to store the agent pane ID (where Claude Code is running)
AGENT_PANE_FILE="/tmp/email-agent-pane-id.txt"

# Setup hotkeys - called when panel is created
setup_hotkeys() {
    # Check if running in tmux
    if [ -z "$TMUX" ]; then
        echo "Error: Not running in tmux session" >&2
        return 1
    fi

    # Store the current pane ID (where Claude Code/Agent is running)
    local agent_pane_id
    agent_pane_id=$(tmux display-message -p '#{pane_id}')

    # Validate pane ID format
    if [[ ! "$agent_pane_id" =~ ^%[0-9]+$ ]]; then
        echo "Error: Invalid pane ID: $agent_pane_id" >&2
        return 1
    fi

    # Verify pane actually exists
    if ! tmux list-panes -a -F '#{pane_id}' 2>/dev/null | grep -q "^${agent_pane_id}$"; then
        echo "Error: Pane $agent_pane_id does not exist" >&2
        return 1
    fi

    # Store pane ID for reference (though bindings capture it directly)
    echo "$agent_pane_id" > "$AGENT_PANE_FILE"

    # SECURITY: Capture pane ID in variable to avoid file read race condition
    # Commands are embedded directly in bind-key, not read at execution time

    # Bind Alt+A (approve) - sends "approve" to agent pane
    tmux bind-key -n M-a run-shell "tmux send-keys -t '$agent_pane_id' approve Enter"

    # Bind Alt+S (skip) - sends "skip" to agent pane
    tmux bind-key -n M-s run-shell "tmux send-keys -t '$agent_pane_id' skip Enter"

    # Bind Alt+D (done) - sends "done" to agent pane
    tmux bind-key -n M-d run-shell "tmux send-keys -t '$agent_pane_id' done Enter"

    # Bind Alt+V (paste from clipboard) - paste multi-line clipboard to agent pane
    # SECURITY: Use load-buffer with pipe to avoid command injection
    # macOS only: uses pbpaste (Linux would use xclip -o)
    tmux bind-key -n M-v run-shell "pbpaste | tmux load-buffer - && tmux paste-buffer -t '$agent_pane_id'"
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
