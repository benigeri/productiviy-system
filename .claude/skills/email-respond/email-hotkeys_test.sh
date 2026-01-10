#!/bin/bash
# Tests for email-hotkeys.sh
# Run this to verify hotkey setup/teardown works correctly

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOTKEYS_SCRIPT="$SCRIPT_DIR/email-hotkeys.sh"
AGENT_PANE_FILE="/tmp/email-agent-pane-id.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0

# Helper functions
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected: '$expected'"
        echo "  Got:      '$actual'"
    fi
}

assert_file_exists() {
    local file="$1"
    local test_name="$2"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  File does not exist: $file"
    fi
}

assert_file_not_exists() {
    local file="$1"
    local test_name="$2"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ ! -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  File should not exist: $file"
    fi
}

# Check if we're in tmux
if [ -z "$TMUX" ]; then
    echo "Error: These tests must be run inside a tmux session"
    exit 1
fi

echo "Testing email-hotkeys.sh..."
echo ""

# Test 1: Setup creates agent pane file
echo "Test: setup command creates agent pane file"
rm -f "$AGENT_PANE_FILE"
bash "$HOTKEYS_SCRIPT" setup
assert_file_exists "$AGENT_PANE_FILE" "Agent pane file created"

# Test 2: Agent pane file contains valid pane ID
echo ""
echo "Test: agent pane file contains valid pane ID"
if [ -f "$AGENT_PANE_FILE" ]; then
    STORED_PANE=$(cat "$AGENT_PANE_FILE")
    CURRENT_PANE=$(tmux display-message -p '#{pane_id}')
    assert_equals "$CURRENT_PANE" "$STORED_PANE" "Agent pane ID matches current pane"
fi

# Test 3: Hotkeys are bound after setup
echo ""
echo "Test: hotkeys are bound after setup"
BINDINGS=$(tmux list-keys -T root 2>/dev/null | grep -E 'M-(a|s|d|v)' | wc -l | tr -d ' ')
if [ "$BINDINGS" -ge 4 ]; then
    echo -e "${GREEN}✓${NC} All 4 hotkeys are bound (Alt+A/S/D/V)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} Expected 4 hotkeys, found $BINDINGS"
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 4: Teardown removes agent pane file
echo ""
echo "Test: teardown command removes agent pane file"
bash "$HOTKEYS_SCRIPT" teardown
assert_file_not_exists "$AGENT_PANE_FILE" "Agent pane file removed"

# Test 5: Hotkeys are unbound after teardown
echo ""
echo "Test: hotkeys are unbound after teardown"
BINDINGS=$(tmux list-keys -T root 2>/dev/null | grep -E 'M-(a|s|d|v)' | wc -l | tr -d ' ')
assert_equals "0" "$BINDINGS" "All hotkeys unbound"

# Test 6: Multiple setup/teardown cycles work
echo ""
echo "Test: multiple setup/teardown cycles"
bash "$HOTKEYS_SCRIPT" setup
bash "$HOTKEYS_SCRIPT" setup  # Second setup should be idempotent
assert_file_exists "$AGENT_PANE_FILE" "Agent pane file exists after double setup"
bash "$HOTKEYS_SCRIPT" teardown
bash "$HOTKEYS_SCRIPT" teardown  # Second teardown should be safe
assert_file_not_exists "$AGENT_PANE_FILE" "Agent pane file removed after double teardown"

# Summary
echo ""
echo "=============================="
echo "Test Results: $TESTS_PASSED/$TESTS_RUN passed"
echo "=============================="

if [ "$TESTS_PASSED" -eq "$TESTS_RUN" ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
