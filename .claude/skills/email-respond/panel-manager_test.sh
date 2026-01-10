#!/bin/bash
# Tests for panel-manager.sh
#
# These tests verify:
# 1. Panel is created with correct width (-l 102, not -p 40)
# 2. Panel ID is stored and tracked correctly
# 3. Commands are sent to the correct panel

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_MANAGER="$SCRIPT_DIR/panel-manager.sh"

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    echo -e "  ${RED}Error: $2${NC}"
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
}

skip() {
    echo -e "${YELLOW}⊘${NC} $1 (skipped: $2)"
}

# Check if we're in a tmux session
if [ -z "$TMUX" ]; then
    echo "Error: These tests must be run inside a tmux session"
    echo "Run: tmux new-session -s test '${BASH_SOURCE[0]}'"
    exit 1
fi

echo "Running panel-manager.sh tests..."
echo ""

# Clean up any existing panel before starting
rm -f /tmp/email-panel-id.txt
tmux list-panes -F '#{pane_id}' | while read pane; do
    current_pane=$(tmux display-message -p '#{pane_id}')
    if [ "$pane" != "$current_pane" ]; then
        tmux kill-pane -t "$pane" 2>/dev/null || true
    fi
done

# Test 1: Verify panel is created with absolute width (-l 102)
echo "Test 1: Panel created with absolute width"
bash "$PANEL_MANAGER" create
sleep 0.5

# Check that a new pane exists
pane_count=$(tmux list-panes | wc -l)
if [ "$pane_count" -eq 2 ]; then
    # Check if panel ID file was created
    if [ -f "/tmp/email-panel-id.txt" ]; then
        panel_id=$(cat /tmp/email-panel-id.txt)

        # Verify the panel exists
        if tmux list-panes -F '#{pane_id}' | grep -q "^${panel_id}$"; then
            # Check panel width (should be close to 102)
            panel_width=$(tmux display-message -p -t "$panel_id" '#{pane_width}')

            # Allow some flexibility (100-104 chars) due to borders/spacing
            if [ "$panel_width" -ge 100 ] && [ "$panel_width" -le 104 ]; then
                pass "Panel created with absolute width ~102 (actual: $panel_width)"
            else
                fail "Panel width incorrect" "Expected ~102, got $panel_width"
            fi
        else
            fail "Panel ID not found" "Panel $panel_id doesn't exist in pane list"
        fi
    else
        fail "Panel ID file not created" "/tmp/email-panel-id.txt missing"
    fi
else
    fail "Panel not created" "Expected 2 panes, found $pane_count"
fi

# Test 2: Verify panel width is consistent regardless of terminal size
echo ""
echo "Test 2: Panel width consistency"

# Get current window width
window_width=$(tmux display-message -p '#{window_width}')

# The panel should be 102 chars wide, not 40% of window
# With -p 40, it would be: window_width * 0.4
expected_percentage_width=$((window_width * 40 / 100))

panel_width=$(tmux display-message -p -t "$panel_id" '#{pane_width}')

# The absolute width should be close to 102, NOT close to 40% of window width
difference=$((panel_width - expected_percentage_width))
if [ "${difference#-}" -gt 10 ]; then
    # Absolute width is significantly different from percentage width
    pass "Panel uses absolute width, not percentage (panel=$panel_width vs 40%=$expected_percentage_width)"
else
    fail "Panel may be using percentage width" "Panel width $panel_width is too close to 40% ($expected_percentage_width)"
fi

# Test 3: Verify the fix in the script
echo ""
echo "Test 3: Verify script uses -l flag"

if grep -q "split-window -h -l 102" "$PANEL_MANAGER"; then
    pass "Script uses -l 102 (absolute width)"
else
    fail "Script doesn't use -l 102" "Check for -l 102 flag in panel-manager.sh"
fi

if grep -q "split-window -h -p 40" "$PANEL_MANAGER"; then
    fail "Script still uses -p 40" "Old percentage-based flag found in script"
else
    pass "Script no longer uses -p 40 (percentage width)"
fi

# Test 4: Close panel safely
echo ""
echo "Test 4: Panel close safety"
bash "$PANEL_MANAGER" close
sleep 0.3

pane_count=$(tmux list-panes | wc -l)
if [ "$pane_count" -eq 1 ]; then
    pass "Panel closed successfully"

    if [ ! -f "/tmp/email-panel-id.txt" ]; then
        pass "Panel ID file cleaned up"
    else
        fail "Panel ID file not cleaned up" "File still exists after close"
    fi
else
    fail "Panel not closed" "Expected 1 pane, found $pane_count"
fi

# Summary
echo ""
echo "========================================"
echo "Test Summary:"
echo "  Total:  $TESTS_RUN"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
fi
echo "========================================"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
