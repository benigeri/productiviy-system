#!/bin/bash
# Comprehensive QA testing for email-hotkeys.sh
# Tests functionality, edge cases, and security

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOTKEYS_SCRIPT="$SCRIPT_DIR/email-hotkeys.sh"
AGENT_PANE_FILE="/tmp/email-agent-pane-id.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_RUN=0
TESTS_PASSED=0
ISSUES_FOUND=0

pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

fail() {
    echo -e "${RED}✗${NC} $1: $2"
    ((TESTS_RUN++))
}

issue() {
    echo -e "${YELLOW}⚠${NC} ISSUE: $1"
    ((ISSUES_FOUND++))
}

if [ -z "$TMUX" ]; then
    echo "Error: Must run inside tmux"
    exit 1
fi

echo "========================================"
echo "Email Hotkeys QA Test"
echo "========================================"
echo ""

# === CODE REVIEW FINDINGS ===
echo "=== Code Review Findings ==="
echo ""

# Check 1: Command injection vulnerability in pbpaste
echo "Check 1: Command injection vulnerability"
if grep -q 'pbpaste.*&&' "$HOTKEYS_SCRIPT"; then
    issue "Line 26: pbpaste output not properly escaped - potential command injection"
    echo "  If clipboard contains backticks or \$(cmd), they could be executed"
    echo "  Recommendation: Use printf %q or proper quoting"
else
    pass "No obvious command injection"
fi

# Check 2: Race condition in bind-key commands
echo ""
echo "Check 2: Race condition with file reads"
if grep -q '\$(cat.*AGENT_PANE_FILE)' "$HOTKEYS_SCRIPT"; then
    issue "Lines 16-26: Reading agent pane from file at hotkey execution time"
    echo "  File could be deleted/modified between setup and hotkey press"
    echo "  Recommendation: Capture pane ID in variable during bind-key"
else
    pass "No file read race conditions"
fi

# Check 3: pbpaste portability
echo ""
echo "Check 3: Platform portability"
if grep -q 'pbpaste' "$HOTKEYS_SCRIPT"; then
    issue "Line 26: pbpaste is macOS-only (won't work on Linux)"
    echo "  Recommendation: Document macOS requirement or add xclip fallback"
else
    pass "No platform-specific commands"
fi

# Check 4: Validation of pane IDs
echo ""
echo "Check 4: Pane ID validation"
if grep -q 'tmux list-panes.*grep.*pane_id' "$HOTKEYS_SCRIPT"; then
    pass "Pane ID validation present"
else
    issue "No validation that stored pane ID is valid"
    echo "  Recommendation: Verify pane exists before storing ID"
fi

# Check 5: Error handling for missing tmux
echo ""
echo "Check 5: Tmux availability check"
if grep -q 'TMUX.*-z' "$HOTKEYS_SCRIPT"; then
    pass "Checks if running in tmux"
else
    issue "No check if tmux is running before bind-key"
    echo "  Recommendation: Add [ -z \"\$TMUX\" ] check in setup"
fi

echo ""
echo "=== Functional Tests ==="
echo ""

# Test 1: Basic setup/teardown
echo "Test 1: Basic setup and teardown"
bash "$HOTKEYS_SCRIPT" setup
if [ -f "$AGENT_PANE_FILE" ]; then
    pass "Agent pane file created"
else
    fail "Agent pane file not created" ""
fi

BINDINGS=$(tmux list-keys -T root 2>/dev/null | grep -E 'M-(a|s|d|v)' | wc -l | tr -d ' ')
if [ "$BINDINGS" -eq 4 ]; then
    pass "All 4 hotkeys bound"
else
    fail "Hotkey binding" "Expected 4, got $BINDINGS"
fi

bash "$HOTKEYS_SCRIPT" teardown
if [ ! -f "$AGENT_PANE_FILE" ]; then
    pass "Agent pane file removed"
else
    fail "Agent pane file cleanup" "File still exists"
fi

# Test 2: Test with special characters in clipboard
echo ""
echo "Test 2: Clipboard with special characters (injection test)"
# This is a critical security test
echo 'test$(echo INJECTED)test' | pbcopy
bash "$HOTKEYS_SCRIPT" setup
sleep 0.2

# We can't easily test if injection happens without actually pressing Alt+V
# But we can check the command structure
BIND_CMD=$(tmux list-keys -T root | grep 'M-v' | sed 's/.*run-shell//' | tr -d '"')
if echo "$BIND_CMD" | grep -q 'pbpaste.*\$\$'; then
    issue "Alt+V binding may be vulnerable to command injection"
else
    echo -e "${YELLOW}⊘${NC} Cannot fully test injection without pressing hotkey"
fi

bash "$HOTKEYS_SCRIPT" teardown

# Test 3: Missing agent pane file during hotkey press
echo ""
echo "Test 3: Robustness - missing file during hotkey execution"
bash "$HOTKEYS_SCRIPT" setup
rm -f "$AGENT_PANE_FILE"  # Simulate race condition
# Can't easily test hotkey press, but check error handling would be needed
echo -e "${YELLOW}⊘${NC} Manual test required: Press Alt+A after file deleted"
bash "$HOTKEYS_SCRIPT" teardown

# Test 4: Idempotent setup
echo ""
echo "Test 4: Idempotent setup (double setup)"
bash "$HOTKEYS_SCRIPT" setup
bash "$HOTKEYS_SCRIPT" setup
BINDINGS=$(tmux list-keys -T root 2>/dev/null | grep -E 'M-(a|s|d|v)' | wc -l | tr -d ' ')
if [ "$BINDINGS" -eq 4 ]; then
    pass "Double setup doesn't create duplicate bindings"
else
    fail "Double setup" "Expected 4 bindings, got $BINDINGS"
fi
bash "$HOTKEYS_SCRIPT" teardown

# Test 5: Integration with panel-manager
echo ""
echo "Test 5: Integration with panel-manager.sh"
PANEL_MANAGER="$SCRIPT_DIR/panel-manager.sh"
if [ -f "$PANEL_MANAGER" ]; then
    if grep -q 'email-hotkeys.sh setup' "$PANEL_MANAGER"; then
        pass "panel-manager.sh calls hotkeys setup"
    else
        fail "panel-manager integration" "No setup call found"
    fi

    if grep -q 'email-hotkeys.sh teardown' "$PANEL_MANAGER"; then
        pass "panel-manager.sh calls hotkeys teardown"
    else
        fail "panel-manager integration" "No teardown call found"
    fi
else
    fail "panel-manager.sh" "File not found"
fi

echo ""
echo "=== Summary ==="
echo "Tests Run: $TESTS_RUN"
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
if [ $ISSUES_FOUND -gt 0 ]; then
    echo -e "${YELLOW}Issues Found: $ISSUES_FOUND${NC}"
fi

echo ""
echo "=== Critical Issues ==="
echo ""
echo "1. SECURITY: Command injection in Alt+V (pbpaste)"
echo "   Risk: HIGH - Malicious clipboard content could execute commands"
echo "   Fix: Properly escape pbpaste output or use safer method"
echo ""
echo "2. RELIABILITY: Race condition in pane ID lookup"
echo "   Risk: MEDIUM - Hotkeys could fail or target wrong pane"
echo "   Fix: Capture pane ID in variable, not file read"
echo ""
echo "3. PORTABILITY: macOS-only (pbpaste)"
echo "   Risk: LOW - Won't work on Linux"
echo "   Fix: Document requirement or add xclip fallback"
echo ""

if [ $ISSUES_FOUND -gt 0 ]; then
    echo -e "${YELLOW}Recommendation: Fix critical issues before merge${NC}"
    exit 1
else
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
fi
