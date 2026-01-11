#!/usr/bin/env python3
"""
Braintrust Prompt Management CLI

A simple CLI utility for managing Braintrust prompts via REST API.
Supports creating, updating, listing prompts, and generating TypeScript usage code.
"""

import argparse
import json
import os
import sys
from typing import Dict, List, Optional
from urllib import request, error, parse


class BraintrustAPI:
    """Simple Braintrust API client using urllib."""

    BASE_URL = "https://api.braintrust.dev/v1"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None,
    ) -> Dict:
        """Make HTTP request to Braintrust API."""
        url = f"{self.BASE_URL}{endpoint}"

        # Add query parameters
        if params:
            url += "?" + parse.urlencode(params)

        # Prepare request
        req = request.Request(url, headers=self.headers, method=method)

        # Add body for POST/PATCH
        if data:
            req.data = json.dumps(data).encode("utf-8")

        try:
            with request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            print(f"Error: HTTP {e.code} - {error_body}", file=sys.stderr)
            sys.exit(1)
        except error.URLError as e:
            print(f"Error: Network error - {e.reason}", file=sys.stderr)
            sys.exit(1)

    def list_prompts(self, project_name: Optional[str] = None) -> List[Dict]:
        """List all prompts, optionally filtered by project."""
        params = {}
        if project_name:
            params["project_name"] = project_name

        response = self._make_request("GET", "/prompt", params=params)
        return response.get("objects", [])

    def get_prompt_by_slug(self, slug: str, project_name: str) -> Optional[Dict]:
        """Get a prompt by slug and project name."""
        prompts = self.list_prompts(project_name)
        for prompt in prompts:
            if prompt.get("slug") == slug and prompt.get("project_name") == project_name:
                return prompt
        return None

    def create_prompt(
        self,
        slug: str,
        name: str,
        project_name: str,
        prompt_data: Dict,
    ) -> Dict:
        """Create a new prompt."""
        data = {
            "slug": slug,
            "name": name,
            "project_name": project_name,
            "prompt_data": prompt_data,
        }
        return self._make_request("POST", "/prompt", data=data)

    def update_prompt(
        self,
        prompt_id: str,
        prompt_data: Optional[Dict] = None,
        name: Optional[str] = None,
    ) -> Dict:
        """Update an existing prompt."""
        data = {}
        if prompt_data:
            data["prompt_data"] = prompt_data
        if name:
            data["name"] = name

        return self._make_request("PATCH", f"/prompt/{prompt_id}", data=data)


def create_command(args, api: BraintrustAPI) -> None:
    """Create a new prompt."""
    project_name = args.project or os.getenv("BRAINTRUST_PROJECT_NAME")
    if not project_name:
        print("Error: --project or BRAINTRUST_PROJECT_NAME required", file=sys.stderr)
        sys.exit(1)

    # Check if prompt already exists
    existing = api.get_prompt_by_slug(args.slug, project_name)
    if existing:
        print(f"Error: Prompt '{args.slug}' already exists in project '{project_name}'", file=sys.stderr)
        print(f"Use 'update' command to modify it.", file=sys.stderr)
        sys.exit(1)

    # Build prompt_data
    prompt_data = {"prompt": {}}

    if args.system:
        prompt_data["prompt"]["messages"] = [
            {"role": "system", "content": args.system}
        ]

    if args.user:
        if "messages" not in prompt_data["prompt"]:
            prompt_data["prompt"]["messages"] = []
        prompt_data["prompt"]["messages"].append(
            {"role": "user", "content": args.user}
        )

    # Create prompt
    result = api.create_prompt(
        slug=args.slug,
        name=args.name,
        project_name=project_name,
        prompt_data=prompt_data,
    )

    print(f"✓ Created prompt '{args.slug}' in project '{project_name}'")
    print(f"  ID: {result.get('id')}")
    print(f"  View at: https://www.braintrust.dev/app/{project_name}/prompts/{args.slug}")


def update_command(args, api: BraintrustAPI) -> None:
    """Update an existing prompt."""
    project_name = args.project or os.getenv("BRAINTRUST_PROJECT_NAME")
    if not project_name:
        print("Error: --project or BRAINTRUST_PROJECT_NAME required", file=sys.stderr)
        sys.exit(1)

    # Get existing prompt
    existing = api.get_prompt_by_slug(args.slug, project_name)
    if not existing:
        print(f"Error: Prompt '{args.slug}' not found in project '{project_name}'", file=sys.stderr)
        print(f"Use 'create' command to create it.", file=sys.stderr)
        sys.exit(1)

    # Build updated prompt_data
    prompt_data = existing.get("prompt_data", {"prompt": {}})

    if args.system or args.user:
        messages = []

        if args.system:
            messages.append({"role": "system", "content": args.system})

        if args.user:
            messages.append({"role": "user", "content": args.user})

        prompt_data["prompt"]["messages"] = messages

    # Update prompt
    result = api.update_prompt(
        prompt_id=existing["id"],
        prompt_data=prompt_data,
        name=args.name,
    )

    print(f"✓ Updated prompt '{args.slug}' in project '{project_name}'")
    print(f"  ID: {result.get('id')}")
    print(f"  View at: https://www.braintrust.dev/app/{project_name}/prompts/{args.slug}")


def list_command(args, api: BraintrustAPI) -> None:
    """List all prompts."""
    project_name = args.project or os.getenv("BRAINTRUST_PROJECT_NAME")

    prompts = api.list_prompts(project_name)

    if not prompts:
        print("No prompts found")
        return

    print(f"Found {len(prompts)} prompt(s):\n")

    for prompt in prompts:
        slug = prompt.get("slug", "N/A")
        name = prompt.get("name", "N/A")
        project = prompt.get("project_name", "N/A")
        prompt_id = prompt.get("id", "N/A")

        print(f"  • {slug}")
        print(f"    Name: {name}")
        print(f"    Project: {project}")
        print(f"    ID: {prompt_id}")
        print(f"    URL: https://www.braintrust.dev/app/{project}/prompts/{slug}")
        print()


def generate_command(args, api: BraintrustAPI) -> None:
    """Generate TypeScript usage code for a prompt."""
    project_name = args.project or os.getenv("BRAINTRUST_PROJECT_NAME")
    if not project_name:
        print("Error: --project or BRAINTRUST_PROJECT_NAME required", file=sys.stderr)
        sys.exit(1)

    # Get prompt to verify it exists
    existing = api.get_prompt_by_slug(args.slug, project_name)
    if not existing:
        print(f"Error: Prompt '{args.slug}' not found in project '{project_name}'", file=sys.stderr)
        sys.exit(1)

    # Extract variables from prompt template
    prompt_data = existing.get("prompt_data", {})
    messages = prompt_data.get("prompt", {}).get("messages", [])

    # Find variables (e.g., {{question}}, {{text}})
    variables = set()
    for message in messages:
        content = message.get("content", "")
        import re
        found_vars = re.findall(r'\{\{(\w+)\}\}', content)
        variables.update(found_vars)

    # Convert slug to camelCase function name
    function_name = "".join(word.capitalize() for word in args.slug.split("-"))
    function_name = function_name[0].lower() + function_name[1:]

    # Build input type
    if variables:
        input_fields = ", ".join(f"{var}: input.{var} || ''" for var in sorted(variables))
    else:
        input_fields = ""

    # Generate TypeScript code
    code = f"""import dotenv from 'dotenv';
import {{ login, invoke, wrapTraced, initLogger }} from 'braintrust';

dotenv.config();

const {function_name} = wrapTraced(async function {function_name}(input: {{ {", ".join(f"{v}: string" for v in sorted(variables))} }}) {{
  return await invoke({{
    projectName: process.env.BRAINTRUST_PROJECT_NAME,
    slug: '{args.slug}',
    input: {{ {input_fields} }},
  }});
}});

// Example usage
(async () => {{
  initLogger({{ projectName: process.env.BRAINTRUST_PROJECT_NAME }});
  await login({{ apiKey: process.env.BRAINTRUST_API_KEY }});

  const result = await {function_name}({{
    {", ".join(f'{v}: "example value"' for v in sorted(variables))}
  }});

  console.log(result);
}})();
"""

    print(code)


def main():
    parser = argparse.ArgumentParser(
        description="Braintrust Prompt Management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Create command
    create_parser = subparsers.add_parser("create", help="Create a new prompt")
    create_parser.add_argument("--slug", required=True, help="Prompt slug (unique identifier)")
    create_parser.add_argument("--name", required=True, help="Prompt display name")
    create_parser.add_argument("--project", help="Project name (or use BRAINTRUST_PROJECT_NAME)")
    create_parser.add_argument("--system", help="System message content")
    create_parser.add_argument("--user", help="User message content (supports {{variables}})")

    # Update command
    update_parser = subparsers.add_parser("update", help="Update an existing prompt")
    update_parser.add_argument("--slug", required=True, help="Prompt slug to update")
    update_parser.add_argument("--project", help="Project name (or use BRAINTRUST_PROJECT_NAME)")
    update_parser.add_argument("--name", help="New prompt display name")
    update_parser.add_argument("--system", help="New system message content")
    update_parser.add_argument("--user", help="New user message content")

    # List command
    list_parser = subparsers.add_parser("list", help="List all prompts")
    list_parser.add_argument("--project", help="Filter by project name")

    # Generate command
    generate_parser = subparsers.add_parser("generate", help="Generate TypeScript usage code")
    generate_parser.add_argument("--slug", required=True, help="Prompt slug")
    generate_parser.add_argument("--project", help="Project name (or use BRAINTRUST_PROJECT_NAME)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Get API key
    api_key = os.getenv("BRAINTRUST_API_KEY")
    if not api_key:
        print("Error: BRAINTRUST_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    # Initialize API client
    api = BraintrustAPI(api_key)

    # Route to command
    if args.command == "create":
        create_command(args, api)
    elif args.command == "update":
        update_command(args, api)
    elif args.command == "list":
        list_command(args, api)
    elif args.command == "generate":
        generate_command(args, api)


if __name__ == "__main__":
    main()
