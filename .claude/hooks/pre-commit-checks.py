#!/usr/bin/env python3
"""
Claude Code Pre-commit Hook

Enforces:
1. No direct commits to main branch
2. Tests must pass before commits (when test infrastructure exists)
3. Linting/formatting checks (when configured)
"""

import json
import os
import subprocess
import sys

def get_current_branch():
    """Get the current git branch name."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stdout.strip()
    except Exception:
        return None

def check_deno_tests():
    """Run deno tests if deno.json exists in supabase functions."""
    test_paths = [
        "supabase/functions/telegram-webhook/deno.json",
        "supabase/functions/deno.json",
    ]
    
    for path in test_paths:
        if os.path.exists(path):
            print("Running deno tests...", file=sys.stderr)
            result = subprocess.run(
                ["deno", "test", "--allow-all"],
                capture_output=True,
                text=True,
                timeout=120,
                cwd=os.path.dirname(path) or "."
            )
            if result.returncode != 0:
                print(f"Tests failed:\n{result.stderr}", file=sys.stderr)
                return False
            print("Tests passed!", file=sys.stderr)
            return True
    
    # No test config found, skip
    return True

def check_deno_lint():
    """Run deno lint if deno.json exists."""
    if os.path.exists("supabase/functions/telegram-webhook/deno.json"):
        print("Running deno lint...", file=sys.stderr)
        result = subprocess.run(
            ["deno", "lint"],
            capture_output=True,
            text=True,
            timeout=30,
            cwd="supabase/functions/telegram-webhook"
        )
        if result.returncode != 0:
            print(f"Linting failed:\n{result.stderr}", file=sys.stderr)
            return False
        print("Linting passed!", file=sys.stderr)
    return True

def main():
    # Read input from Claude Code
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)  # No input, allow

    command = input_data.get("tool_input", {}).get("command", "")

    # Check if this is a git commit or push command
    is_commit = "git commit" in command
    is_push = "git push" in command and "origin" in command

    if not (is_commit or is_push):
        sys.exit(0)  # Not a commit/push, allow

    # Skip hook if command is targeting a different repository
    # (cross-repo workflow - other repos have their own hooks)
    if command.startswith("cd ") and " && " in command:
        sys.exit(0)  # Let the target repo's hook handle it
    
    current_branch = get_current_branch()
    
    # Block direct commits/pushes to main
    if current_branch in ["main", "master"]:
        if is_commit:
            print(
                "\n❌ BLOCKED: Cannot commit directly to main branch.\n"
                "Create a feature branch first:\n"
                "  git checkout -b feature/your-feature\n",
                file=sys.stderr
            )
            sys.exit(2)
        
        # Allow pushing if we're pushing a different branch to origin
        # But block `git push origin main`
        if is_push and ("main" in command or "master" in command):
            print(
                "\n❌ BLOCKED: Cannot push directly to main.\n"
                "Create a PR instead.\n",
                file=sys.stderr
            )
            sys.exit(2)
    
    # Run tests before commits
    if is_commit:
        if not check_deno_tests():
            print("\n❌ BLOCKED: Tests must pass before committing.\n", file=sys.stderr)
            sys.exit(2)
        
        if not check_deno_lint():
            print("\n❌ BLOCKED: Linting must pass before committing.\n", file=sys.stderr)
            sys.exit(2)
    
    # All checks passed
    sys.exit(0)

if __name__ == "__main__":
    main()
