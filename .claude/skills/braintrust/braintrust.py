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

    def list_prompts(self, project_id: Optional[str] = None) -> List[Dict]:
        """List all prompts, optionally filtered by project."""
        params = {}
        if project_id:
            params["project_id"] = project_id

        response = self._make_request("GET", "/prompt", params=params)
        return response.get("objects", [])

    def get_prompt_by_slug(self, slug: str, project_id: str) -> Optional[Dict]:
        """Get a prompt by slug and project ID."""
        prompts = self.list_prompts(project_id)
        for prompt in prompts:
            if prompt.get("slug") == slug:
                return prompt
        return None

    def create_prompt(
        self,
        slug: str,
        name: str,
        project_id: str,
        prompt_data: Dict,
    ) -> Dict:
        """Create a new prompt."""
        data = {
            "slug": slug,
            "name": name,
            "project_id": project_id,
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
    project_id = args.project or os.getenv("BRAINTRUST_PROJECT_ID")
    if not project_id:
        print("Error: --project or BRAINTRUST_PROJECT_ID required", file=sys.stderr)
        sys.exit(1)

    # Check if prompt already exists
    existing = api.get_prompt_by_slug(args.slug, project_id)
    if existing:
        print(f"Error: Prompt '{args.slug}' already exists in project '{project_id}'", file=sys.stderr)
        print(f"Use 'update' command to modify it.", file=sys.stderr)
        sys.exit(1)

    # Build prompt_data
    prompt_data = {"prompt": {"type": "chat", "messages": []}}

    if args.system:
        prompt_data["prompt"]["messages"].append(
            {"role": "system", "content": args.system}
        )

    if args.user:
        prompt_data["prompt"]["messages"].append(
            {"role": "user", "content": args.user}
        )

    # Add model if specified
    if args.model:
        prompt_data["model"] = args.model

    # Add options if any are specified
    options = {}
    if args.temperature is not None:
        options["temperature"] = args.temperature
    if args.max_tokens is not None:
        options["max_tokens"] = args.max_tokens
    if args.thinking_budget is not None:
        options["thinking"] = {
            "type": "enabled",
            "budget_tokens": args.thinking_budget
        }
    if options:
        prompt_data["options"] = options

    # Add structured output schema if specified
    if args.schema:
        import json as json_lib
        try:
            schema_obj = json_lib.loads(args.schema)
            prompt_data["tools"] = [{
                "type": "function",
                "function": {
                    "name": "output_schema",
                    "parameters": schema_obj
                }
            }]
        except json_lib.JSONDecodeError as e:
            print(f"Error: Invalid JSON schema - {e}", file=sys.stderr)
            sys.exit(1)

    # Create prompt
    result = api.create_prompt(
        slug=args.slug,
        name=args.name,
        project_id=project_id,
        prompt_data=prompt_data,
    )

    print(f"✓ Created prompt '{args.slug}' in project '{project_id}'")
    print(f"  ID: {result.get('id')}")
    print(f"  View at: https://www.braintrust.dev/app/project/{project_id}/prompts/{args.slug}")


def update_command(args, api: BraintrustAPI) -> None:
    """Update an existing prompt."""
    project_id = args.project or os.getenv("BRAINTRUST_PROJECT_ID")
    if not project_id:
        print("Error: --project or BRAINTRUST_PROJECT_ID required", file=sys.stderr)
        sys.exit(1)

    # Get existing prompt
    existing = api.get_prompt_by_slug(args.slug, project_id)
    if not existing:
        print(f"Error: Prompt '{args.slug}' not found in project '{project_id}'", file=sys.stderr)
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

    # Update model if specified
    if args.model:
        prompt_data["model"] = args.model

    # Update options if any are specified
    if args.temperature is not None or args.max_tokens is not None or args.thinking_budget is not None:
        options = prompt_data.get("options", {})
        if args.temperature is not None:
            options["temperature"] = args.temperature
        if args.max_tokens is not None:
            options["max_tokens"] = args.max_tokens
        if args.thinking_budget is not None:
            options["thinking"] = {
                "type": "enabled",
                "budget_tokens": args.thinking_budget
            }
        prompt_data["options"] = options

    # Update structured output schema if specified
    if args.schema:
        import json as json_lib
        try:
            schema_obj = json_lib.loads(args.schema)
            prompt_data["tools"] = [{
                "type": "function",
                "function": {
                    "name": "output_schema",
                    "parameters": schema_obj
                }
            }]
        except json_lib.JSONDecodeError as e:
            print(f"Error: Invalid JSON schema - {e}", file=sys.stderr)
            sys.exit(1)

    # Update prompt
    result = api.update_prompt(
        prompt_id=existing["id"],
        prompt_data=prompt_data,
        name=args.name,
    )

    print(f"✓ Updated prompt '{args.slug}' in project '{project_id}'")
    print(f"  ID: {result.get('id')}")
    print(f"  View at: https://www.braintrust.dev/app/project/{project_id}/prompts/{args.slug}")


def list_command(args, api: BraintrustAPI) -> None:
    """List all prompts."""
    project_id = args.project or os.getenv("BRAINTRUST_PROJECT_ID")

    prompts = api.list_prompts(project_id)

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
    project_id = args.project or os.getenv("BRAINTRUST_PROJECT_ID")
    if not project_id:
        print("Error: --project or BRAINTRUST_PROJECT_ID required", file=sys.stderr)
        sys.exit(1)

    # Get prompt to verify it exists
    existing = api.get_prompt_by_slug(args.slug, project_id)
    if not existing:
        print(f"Error: Prompt '{args.slug}' not found in project '{project_id}'", file=sys.stderr)
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
    projectName: process.env.BRAINTRUST_PROJECT_ID,
    slug: '{args.slug}',
    input: {{ {input_fields} }},
  }});
}});

// Example usage
(async () => {{
  initLogger({{ projectName: process.env.BRAINTRUST_PROJECT_ID }});
  await login({{ apiKey: process.env.BRAINTRUST_API_KEY }});

  const result = await {function_name}({{
    {", ".join(f'{v}: "example value"' for v in sorted(variables))}
  }});

  console.log(result);
}})();
"""

    print(code)


def test_command(args, api: BraintrustAPI) -> None:
    """Test/invoke a prompt with input variables (generates code to run)."""
    project_id = args.project or os.getenv("BRAINTRUST_PROJECT_ID")
    if not project_id:
        print("Error: --project or BRAINTRUST_PROJECT_ID required", file=sys.stderr)
        sys.exit(1)

    # Get project name for SDK (required for invoke)
    project_name = args.project_name or os.getenv("BRAINTRUST_PROJECT_NAME")
    if not project_name:
        print("Error: --project-name or BRAINTRUST_PROJECT_NAME required for invoke", file=sys.stderr)
        print("       The SDK requires the project name (e.g., '2026_01 Email Flow'), not the UUID", file=sys.stderr)
        sys.exit(1)

    # Parse input variables from --input arguments
    input_vars = {}
    if args.input:
        for inp in args.input:
            if "=" not in inp:
                print(f"Error: Invalid input format '{inp}'. Use key=value", file=sys.stderr)
                sys.exit(1)
            key, value = inp.split("=", 1)
            input_vars[key] = value

    # Get the prompt
    prompt = api.get_prompt_by_slug(args.slug, project_id)
    if not prompt:
        print(f"Error: Prompt '{args.slug}' not found", file=sys.stderr)
        sys.exit(1)

    prompt_data = prompt.get("prompt_data", {})

    # Show what would be sent
    print(f"🧪 Testing prompt '{args.slug}'")
    print(f"   Project: {project_name}")
    print(f"   Model: {prompt_data.get('model', 'default')}")
    print(f"   Input: {json.dumps(input_vars, indent=2)}")
    print()

    # Generate test script
    import tempfile
    import os as os_module

    # Convert slug to function name
    function_name = "".join(word.capitalize() for word in args.slug.split("-"))
    function_name = function_name[0].lower() + function_name[1:]

    # Build input object for code
    input_obj = ", ".join([f'{k}: "{v}"' for k, v in input_vars.items()])

    test_code = f"""import {{ login, initLogger, invoke }} from 'braintrust';

(async () => {{
  initLogger({{ projectName: '{project_name}' }});
  await login({{ apiKey: process.env.BRAINTRUST_API_KEY }});

  const result = await invoke({{
    projectName: '{project_name}',
    slug: '{args.slug}',
    input: {{ {input_obj} }},
  }});

  console.log(JSON.stringify(result, null, 2));
}})();
"""

    # Write to temp file
    temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.ts', delete=False)
    temp_file.write(test_code)
    temp_file.close()

    print(f"📝 Generated test script: {temp_file.name}")
    print()
    print("To run:")
    print(f"  export BRAINTRUST_API_KEY={os.getenv('BRAINTRUST_API_KEY')}")
    print(f"  npx tsx {temp_file.name}")
    print()
    print("Or install dependencies and run:")
    print(f"  npm install braintrust")
    print(f"  npx tsx {temp_file.name}")


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
    create_parser.add_argument("--project", help="Project ID (or use BRAINTRUST_PROJECT_ID)")
    create_parser.add_argument("--system", help="System message content")
    create_parser.add_argument("--user", help="User message content (supports {{variables}})")
    create_parser.add_argument("--model", help="Model to use (e.g., claude-3-5-sonnet-20241022)")
    create_parser.add_argument("--temperature", type=float, help="Temperature (0.0-1.0)")
    create_parser.add_argument("--max-tokens", type=int, help="Maximum tokens in response")
    create_parser.add_argument("--thinking-budget", type=int, help="Thinking budget tokens for reasoning")
    create_parser.add_argument("--schema", help="JSON schema for structured output")

    # Update command
    update_parser = subparsers.add_parser("update", help="Update an existing prompt")
    update_parser.add_argument("--slug", required=True, help="Prompt slug to update")
    update_parser.add_argument("--project", help="Project ID (or use BRAINTRUST_PROJECT_ID)")
    update_parser.add_argument("--name", help="New prompt display name")
    update_parser.add_argument("--system", help="New system message content")
    update_parser.add_argument("--user", help="New user message content")
    update_parser.add_argument("--model", help="Model to use (e.g., claude-3-5-sonnet-20241022)")
    update_parser.add_argument("--temperature", type=float, help="Temperature (0.0-1.0)")
    update_parser.add_argument("--max-tokens", type=int, help="Maximum tokens in response")
    update_parser.add_argument("--thinking-budget", type=int, help="Thinking budget tokens for reasoning")
    update_parser.add_argument("--schema", help="JSON schema for structured output")

    # List command
    list_parser = subparsers.add_parser("list", help="List all prompts")
    list_parser.add_argument("--project", help="Filter by project name")

    # Generate command
    generate_parser = subparsers.add_parser("generate", help="Generate TypeScript usage code")
    generate_parser.add_argument("--slug", required=True, help="Prompt slug")
    generate_parser.add_argument("--project", help="Project name (or use BRAINTRUST_PROJECT_ID)")

    # Test command
    test_parser = subparsers.add_parser("test", help="Test/invoke a prompt with input variables")
    test_parser.add_argument("--slug", required=True, help="Prompt slug to test")
    test_parser.add_argument("--project", help="Project ID (or use BRAINTRUST_PROJECT_ID)")
    test_parser.add_argument("--project-name", help="Project name for SDK invoke (or use BRAINTRUST_PROJECT_NAME)")
    test_parser.add_argument("--input", action="append", help="Input variable (key=value). Can be used multiple times.")

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
    elif args.command == "test":
        test_command(args, api)


if __name__ == "__main__":
    main()
