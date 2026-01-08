#!/bin/bash
# Panel Manager for Email Workflow
# Handles creating and updating the tmux panel reliably

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_TARGET="{right}"

# Check if panel pane exists
panel_exists() {
    tmux list-panes -F '#{pane_index}' 2>/dev/null | grep -q "1"
}

# Create panel with persistent shell
create_panel() {
    # Kill existing panel if any
    tmux kill-pane -t "$PANEL_TARGET" 2>/dev/null || true

    # Create new pane with bash shell (persists after commands)
    tmux split-window -h -p 40 -d
    sleep 0.3  # Wait for pane to initialize
}

# Send command to panel
send_to_panel() {
    local cmd="$1"

    # Ensure panel exists
    if ! panel_exists; then
        create_panel
    fi

    # Clear any running process and send new command
    tmux send-keys -t "$PANEL_TARGET" C-c 2>/dev/null || true
    sleep 0.1
    tmux send-keys -t "$PANEL_TARGET" "$cmd" Enter
}

# Show thread list
show_list() {
    send_to_panel "python3 '$SCRIPT_DIR/email-canvas.py'"
}

# Show specific thread
show_thread() {
    local thread_id="$1"
    local index="$2"
    local total="$3"

    local cmd="python3 '$SCRIPT_DIR/email-canvas.py' --thread-id '$thread_id'"
    [ -n "$index" ] && cmd="$cmd --index $index"
    [ -n "$total" ] && cmd="$cmd --total $total"

    send_to_panel "$cmd"
}

# Show thread with draft
show_draft() {
    local thread_id="$1"
    local draft_file="$2"
    local index="$3"
    local total="$4"

    # Read draft body from file and strip HTML
    local draft_body
    draft_body=$(jq -r '.body' "$draft_file" 2>/dev/null | sed 's/<[^>]*>//g')

    if [ -z "$draft_body" ]; then
        echo "Error: Could not read draft from $draft_file" >&2
        return 1
    fi

    # Write plain text draft to temp file for display (avoids quoting issues)
    local display_file="/tmp/email-draft-display-${thread_id}.txt"
    echo "$draft_body" > "$display_file"

    local cmd="python3 '$SCRIPT_DIR/email-canvas.py' --thread-id '$thread_id' --draft-file '$display_file'"
    [ -n "$index" ] && cmd="$cmd --index $index"
    [ -n "$total" ] && cmd="$cmd --total $total"

    send_to_panel "$cmd"
}

# Close panel
close_panel() {
    tmux kill-pane -t "$PANEL_TARGET" 2>/dev/null || true
}

# Main command handler
case "$1" in
    create)
        create_panel
        ;;
    list)
        show_list
        ;;
    thread)
        show_thread "$2" "$3" "$4"
        ;;
    draft)
        show_draft "$2" "$3" "$4" "$5"
        ;;
    close)
        close_panel
        ;;
    *)
        echo "Usage: $0 {create|list|thread|draft|close} [args...]"
        echo ""
        echo "Commands:"
        echo "  create                      - Create panel with persistent shell"
        echo "  list                        - Show thread list"
        echo "  thread <id> [idx] [total]   - Show specific thread"
        echo "  draft <id> <file> [idx] [total] - Show thread with draft from file"
        echo "  close                       - Close panel"
        exit 1
        ;;
esac
