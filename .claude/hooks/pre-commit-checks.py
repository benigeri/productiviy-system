#!/usr/bin/env python3
"""
Claude Code Pre-commit Hook (Universal)

Enforces:
1. No direct commits to main branch
2. Tests must pass before commits (deno and/or npm)
3. Linting must pass before commits (deno and/or npm)

Supports:
- Deno projects (deno.json)
- npm projects (package.json with test:unit/lint scripts)
- Beads-only commits (skips tests/lint)
"""

import json
import os
import subprocess
import sys


def get_project_dir():
    """Get the project directory from environment or cwd."""
    return os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())


def get_current_branch():
    """Get the current git branch name."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=get_project_dir()
        )
        return result.stdout.strip()
    except Exception:
        return None


def get_staged_files():
    """Get list of staged files."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=get_project_dir()
        )
        return [f.strip() for f in result.stdout.split('\n') if f.strip()]
    except Exception:
        return []


def is_beads_only_commit(staged_files):
    """Check if commit only contains .beads/ files."""
    if not staged_files:
        return False
    return all(f.startswith('.beads/') for f in staged_files)


# =============================================================================
# Deno Checks
# =============================================================================

def check_deno_tests():
    """Run deno tests if deno.json exists."""
    project_dir = get_project_dir()

    # Look for deno.json in common locations
    deno_paths = [
        os.path.join(project_dir, "deno.json"),
        os.path.join(project_dir, "supabase/functions/deno.json"),
    ]

    # Also check for function-specific deno.json files
    functions_dir = os.path.join(project_dir, "supabase/functions")
    if os.path.isdir(functions_dir):
        for item in os.listdir(functions_dir):
            item_path = os.path.join(functions_dir, item, "deno.json")
            if os.path.isfile(item_path):
                deno_paths.append(item_path)

    for deno_path in deno_paths:
        if os.path.exists(deno_path):
            test_dir = os.path.dirname(deno_path)
            print(f"🦕 Running deno tests in {test_dir}...", file=sys.stderr)
            try:
                result = subprocess.run(
                    ["deno", "test", "--allow-all"],
                    capture_output=True,
                    text=True,
                    timeout=120,
                    cwd=test_dir
                )
                if result.returncode != 0:
                    print(f"❌ Deno tests failed:\n{result.stderr}", file=sys.stderr)
                    return False
                print("✅ Deno tests passed!", file=sys.stderr)
            except FileNotFoundError:
                print("⚠️ deno not found, skipping deno tests.", file=sys.stderr)
            except subprocess.TimeoutExpired:
                print("❌ Deno tests timed out.", file=sys.stderr)
                return False
            return True

    # No deno.json found
    return True


def check_deno_lint():
    """Run deno lint if deno.json exists."""
    project_dir = get_project_dir()

    # Look for deno.json in common locations
    deno_paths = [
        os.path.join(project_dir, "deno.json"),
        os.path.join(project_dir, "supabase/functions/deno.json"),
    ]

    # Also check function-specific
    functions_dir = os.path.join(project_dir, "supabase/functions")
    if os.path.isdir(functions_dir):
        for item in os.listdir(functions_dir):
            item_path = os.path.join(functions_dir, item, "deno.json")
            if os.path.isfile(item_path):
                deno_paths.append(item_path)

    for deno_path in deno_paths:
        if os.path.exists(deno_path):
            lint_dir = os.path.dirname(deno_path)
            print(f"🦕 Running deno lint in {lint_dir}...", file=sys.stderr)
            try:
                result = subprocess.run(
                    ["deno", "lint"],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    cwd=lint_dir
                )
                if result.returncode != 0:
                    print(f"❌ Deno lint failed:\n{result.stderr}", file=sys.stderr)
                    return False
                print("✅ Deno lint passed!", file=sys.stderr)
            except FileNotFoundError:
                print("⚠️ deno not found, skipping deno lint.", file=sys.stderr)
            except subprocess.TimeoutExpired:
                print("❌ Deno lint timed out.", file=sys.stderr)
                return False
            return True

    # No deno.json found
    return True


# =============================================================================
# npm Checks
# =============================================================================

def check_npm_tests():
    """Run npm tests if package.json has test:unit script."""
    project_dir = get_project_dir()
    package_path = os.path.join(project_dir, "package.json")

    if not os.path.exists(package_path):
        return True  # No package.json, skip

    try:
        with open(package_path) as f:
            package = json.load(f)
    except (json.JSONDecodeError, IOError):
        return True  # Can't read package.json, skip

    scripts = package.get("scripts", {})

    # Check for test:unit first, fall back to test
    if "test:unit" in scripts:
        test_cmd = ["npm", "run", "test:unit", "--", "--run"]
    elif "test" in scripts:
        # Skip if test script is just a placeholder
        if scripts["test"].startswith("echo ") or "no test" in scripts["test"].lower():
            return True
        test_cmd = ["npm", "test"]
    else:
        print("📦 No test script found, skipping npm tests.", file=sys.stderr)
        return True

    print("📦 Running npm tests...", file=sys.stderr)
    try:
        result = subprocess.run(
            test_cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=project_dir
        )
        if result.returncode != 0:
            print(f"❌ npm tests failed:\n{result.stdout}\n{result.stderr}", file=sys.stderr)
            return False
        print("✅ npm tests passed!", file=sys.stderr)
    except FileNotFoundError:
        print("⚠️ npm not found, skipping npm tests.", file=sys.stderr)
    except subprocess.TimeoutExpired:
        print("❌ npm tests timed out.", file=sys.stderr)
        return False

    return True


def check_npm_lint():
    """Run npm lint if package.json has lint script."""
    project_dir = get_project_dir()
    package_path = os.path.join(project_dir, "package.json")

    if not os.path.exists(package_path):
        return True  # No package.json, skip

    try:
        with open(package_path) as f:
            package = json.load(f)
    except (json.JSONDecodeError, IOError):
        return True  # Can't read package.json, skip

    if "lint" not in package.get("scripts", {}):
        print("📦 No lint script found, skipping npm lint.", file=sys.stderr)
        return True

    print("📦 Running npm lint...", file=sys.stderr)
    try:
        result = subprocess.run(
            ["npm", "run", "lint"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=project_dir
        )
        if result.returncode != 0:
            print(f"❌ npm lint failed:\n{result.stdout}\n{result.stderr}", file=sys.stderr)
            return False
        print("✅ npm lint passed!", file=sys.stderr)
    except FileNotFoundError:
        print("⚠️ npm not found, skipping npm lint.", file=sys.stderr)
    except subprocess.TimeoutExpired:
        print("❌ npm lint timed out.", file=sys.stderr)
        return False

    return True


# =============================================================================
# Main
# =============================================================================

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

        # Block pushing to main
        if is_push and ("main" in command or "master" in command):
            print(
                "\n❌ BLOCKED: Cannot push directly to main.\n"
                "Create a PR instead.\n",
                file=sys.stderr
            )
            sys.exit(2)

    # Run checks before commits
    if is_commit:
        # Skip tests/lint if only .beads/ files are being committed
        staged_files = get_staged_files()
        if is_beads_only_commit(staged_files):
            print("📋 Beads-only commit, skipping tests and linting.", file=sys.stderr)
        else:
            # Run all checks independently (not if/else)
            all_passed = True

            # Deno checks
            if not check_deno_tests():
                all_passed = False
            if not check_deno_lint():
                all_passed = False

            # npm checks
            if not check_npm_tests():
                all_passed = False
            if not check_npm_lint():
                all_passed = False

            if not all_passed:
                print("\n❌ BLOCKED: Pre-commit checks failed.\n", file=sys.stderr)
                sys.exit(2)

    # All checks passed
    print("✅ All pre-commit checks passed!", file=sys.stderr)
    sys.exit(0)


if __name__ == "__main__":
    main()
