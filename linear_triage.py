#!/usr/bin/env python3
"""
Linear Triage Viewer
Fetches and displays triage issues from Linear with numbered items.
"""

import os
import sys
import warnings

# Suppress urllib3 SSL warning before importing requests
warnings.filterwarnings("ignore", message=".*OpenSSL.*")

import requests
from dotenv import load_dotenv

load_dotenv()

LINEAR_API_URL = "https://api.linear.app/graphql"
LINEAR_API_KEY = os.getenv("LINEAR_API_KEY")
TEAM_KEY = "BEN"


def get_team_and_triage_state():
    """Get team ID and triage state ID."""
    query = """
    query Teams {
        teams {
            nodes {
                id
                key
                name
                triageIssueState {
                    id
                    name
                }
            }
        }
    }
    """

    headers = {
        "Authorization": LINEAR_API_KEY,
        "Content-Type": "application/json",
    }

    response = requests.post(LINEAR_API_URL, json={"query": query}, headers=headers)
    data = response.json()

    if "errors" in data:
        return None, None, None

    teams = data.get("data", {}).get("teams", {}).get("nodes", [])
    for team in teams:
        if team.get("key") == TEAM_KEY:
            triage_state = team.get("triageIssueState")
            triage_state_id = triage_state.get("id") if triage_state else None
            return team.get("id"), team.get("name"), triage_state_id

    return None, None, None


def get_triage_issues():
    """Fetch triage issues from Linear for the BEN team."""
    if not LINEAR_API_KEY:
        print("Error: LINEAR_API_KEY not found in .env file")
        print("Create a .env file with: LINEAR_API_KEY=lin_api_your_key_here")
        sys.exit(1)

    team_id, team_name, triage_state_id = get_team_and_triage_state()

    if not team_id:
        print(f"Error: Could not find team with key '{TEAM_KEY}'")
        sys.exit(1)

    if not triage_state_id:
        print(f"Error: Team '{team_name}' does not have triage enabled")
        sys.exit(1)

    query = """
    query TriageIssues($stateId: ID!) {
        issues(filter: { state: { id: { eq: $stateId } } }) {
            nodes {
                id
                identifier
                title
                priority
                priorityLabel
                state {
                    name
                }
                labels {
                    nodes {
                        name
                    }
                }
                createdAt
            }
        }
    }
    """

    headers = {
        "Authorization": LINEAR_API_KEY,
        "Content-Type": "application/json",
    }

    response = requests.post(
        LINEAR_API_URL,
        json={"query": query, "variables": {"stateId": triage_state_id}},
        headers=headers,
    )

    if response.status_code != 200:
        print(f"Error: API request failed with status {response.status_code}")
        print(response.text)
        sys.exit(1)

    data = response.json()

    if "errors" in data:
        print("GraphQL Errors:")
        for error in data["errors"]:
            print(f"  - {error.get('message', error)}")
        sys.exit(1)

    data["_team_name"] = team_name
    return data


def priority_badge(priority_label):
    """Convert priority label to a short badge."""
    mapping = {
        "Urgent": "URG",
        "High": "HIGH",
        "Medium": "MED",
        "Low": "LOW",
        "No priority": "---",
    }
    return mapping.get(priority_label, "---")


def display_triage(data):
    """Display triage issues with numbered items."""
    team_name = data.get("_team_name", "Unknown")
    issues = data.get("data", {}).get("issues", {}).get("nodes", [])

    print(f"\n=== {team_name} Triage ({len(issues)} issues) ===\n")

    if not issues:
        print("No issues in triage!")
        return

    for i, issue in enumerate(issues, 1):
        priority = priority_badge(issue.get("priorityLabel", "No priority"))
        identifier = issue.get("identifier", "???")
        title = issue.get("title", "Untitled")
        labels = issue.get("labels", {}).get("nodes", [])
        label_str = ", ".join(l["name"] for l in labels) if labels else ""

        line = f"{i:2}. [{priority:4}] {title} - #{identifier}"
        if label_str:
            line += f" ({label_str})"
        print(line)

    print()


def main():
    data = get_triage_issues()
    display_triage(data)


if __name__ == "__main__":
    main()
