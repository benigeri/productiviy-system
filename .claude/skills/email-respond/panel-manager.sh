#!/bin/bash
# Panel Manager for Email Workflow
# Handles creating and updating the tmux panel reliably
#
# SAFETY: Uses specific pane IDs stored in a temp file, NEVER relative targets
# like {right} which can accidentally kill the Agent Deck conversation pane.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_ID_FILE="/tmp/email-panel-id.txt"

# Get the stored panel pane ID
get_panel_id() {
    if [ -f "$PANEL_ID_FILE" ]; then
        cat "$PANEL_ID_FILE"
    else
        echo ""
    fi
}

# Check if our specific panel pane exists
panel_exists() {
    local panel_id
    panel_id=$(get_panel_id)
    if [ -z "$panel_id" ]; then
        return 1
    fi
    # Check if this specific pane ID still exists
    tmux list-panes -a -F '#{pane_id}' 2>/dev/null | grep -q "^${panel_id}$"
}

# Get the current pane ID (to avoid killing it)
get_current_pane_id() {
    tmux display-message -p '#{pane_id}' 2>/dev/null
}

# Create panel with persistent shell
create_panel() {
    # Close existing panel if any (using stored ID, not relative target)
    close_panel 2>/dev/null || true

    # Store current pane before creating new one
    local current_pane
    current_pane=$(get_current_pane_id)

    # Create new pane with bash shell (persists after commands)
    # -P prints the new pane's info, -F formats it to just the pane_id
    local new_pane_id
    new_pane_id=$(tmux split-window -h -p 40 -d -P -F '#{pane_id}')

    # Store the new pane ID for later targeting
    echo "$new_pane_id" > "$PANEL_ID_FILE"

    sleep 0.3  # Wait for pane to initialize
}

# Send command to panel
send_to_panel() {
    local cmd="$1"

    # Ensure panel exists
    if ! panel_exists; then
        create_panel
    fi

    local panel_id
    panel_id=$(get_panel_id)

    if [ -z "$panel_id" ]; then
        echo "Error: No panel ID found" >&2
        return 1
    fi

    # Clear any running process and send new command (using specific pane ID)
    tmux send-keys -t "$panel_id" C-c 2>/dev/null || true
    sleep 0.1
    tmux send-keys -t "$panel_id" "$cmd" Enter
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

    # Read draft body from file and convert HTML to plain text with line breaks
    local draft_body
    draft_body=$(jq -r '.body' "$draft_file" 2>/dev/null | \
        sed 's/<br[[:space:]]*\/?>/\n/gi' | \
        sed 's/<\/p>/\n\n/gi' | \
        sed 's/<[^>]*>//g')

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

# Close panel (SAFE: only closes our tracked pane, never the current pane)
close_panel() {
    local panel_id
    panel_id=$(get_panel_id)

    if [ -z "$panel_id" ]; then
        # No panel tracked, nothing to close
        return 0
    fi

    # SAFETY CHECK: Never kill the current pane (protects Agent Deck)
    local current_pane
    current_pane=$(get_current_pane_id)
    if [ "$panel_id" = "$current_pane" ]; then
        echo "Error: Refusing to kill current pane (safety check)" >&2
        rm -f "$PANEL_ID_FILE"
        return 1
    fi

    # Only kill the pane if it actually exists
    if panel_exists; then
        tmux kill-pane -t "$panel_id" 2>/dev/null || true
    fi

    # Clean up the ID file
    rm -f "$PANEL_ID_FILE"
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
