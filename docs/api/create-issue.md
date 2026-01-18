# Create Issue API

Creates a Linear issue from text input with automatic cleanup and routing.

## Endpoint

`POST /functions/v1/create-issue`

## Request

### Headers

```
Content-Type: application/json
```

### Body

```json
{
  "text": "string (required)"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | The issue text to process. Will be cleaned up and converted to a Linear issue. |

## Response

### Success (200)

```json
{
  "ok": true,
  "issue": {
    "id": "uuid",
    "identifier": "BEN-123",
    "url": "https://linear.app/workspace/issue/BEN-123"
  }
}
```

### Error Responses

All error responses include a machine-readable `code` field for programmatic handling:

```json
{
  "ok": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

| Status | Code | Description |
|--------|------|-------------|
| 400 | `MISSING_TEXT` | Request body missing `text` field or not a string |
| 400 | `EMPTY_TEXT` | Text field is empty or whitespace only |
| 400 | `EMPTY_AFTER_CLEANUP` | Text became empty after cleanup processing |
| 405 | `INVALID_METHOD` | Request method is not POST |
| 500 | `CONFIG_ERROR` | Server missing required API keys |
| 500 | `BRAINTRUST_ERROR` | Braintrust API call failed |
| 500 | `LINEAR_ERROR` | Linear API call failed |
| 500 | `TIMEOUT` | External API call timed out |
| 500 | `UNKNOWN_ERROR` | Unexpected error |

## Feedback Routing

Text starting with a feedback prefix is automatically routed to the Feedback project in Backlog state.

### Recognized Prefixes

The following prefixes are detected (case-insensitive):

- `// fb -` (canonical format)
- `fb -`
- `fb-`
- `/fb -`
- `FB -`

### Examples

**Feedback routing:**
```json
// Input
{ "text": "fb - John Doe - Great product!" }

// Output - routed to Feedback project
{
  "ok": true,
  "issue": {
    "id": "...",
    "identifier": "BEN-456",
    "url": "https://linear.app/..."
  }
}
```

**Regular issue:**
```json
// Input
{ "text": "Fix the login button on mobile" }

// Output - routed to Triage
{
  "ok": true,
  "issue": {
    "id": "...",
    "identifier": "BEN-789",
    "url": "https://linear.app/..."
  }
}
```

## Text Processing

Input text is automatically:

1. **Cleaned up** - Filler words removed, grammar fixed
2. **Formatted** - Bullet points and checkboxes converted to markdown
3. **Parsed** - First line becomes title, rest becomes description

### Multiline Input

```json
{
  "text": "Add user authentication\n\nWe need to add login/logout functionality with OAuth support"
}
```

Result:
- **Title:** Add user authentication
- **Description:** We need to add login/logout functionality with OAuth support

## CORS

The endpoint supports CORS for browser clients:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`

Preflight `OPTIONS` requests return 200.

## Rate Limits

No explicit rate limits. Subject to Supabase Edge Functions limits.

## Example Usage

### cURL

```bash
curl -X POST https://your-project.supabase.co/functions/v1/create-issue \
  -H "Content-Type: application/json" \
  -d '{"text": "Fix the homepage loading issue"}'
```

### JavaScript

```javascript
const response = await fetch('https://your-project.supabase.co/functions/v1/create-issue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'Fix the homepage loading issue' })
});

const data = await response.json();
if (data.ok) {
  console.log('Created issue:', data.issue.identifier);
} else {
  console.error('Error:', data.code, data.error);
}
```

### Raycast Extension

```typescript
import { invoke } from "@braintrust/sdk";

// The endpoint is typically called via a Raycast command
async function createIssue(text: string) {
  const response = await fetch(SUPABASE_URL + '/functions/v1/create-issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  return response.json();
}
```
