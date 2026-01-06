# Weekly Cadence Skill - Implementation Plan

## Overview
Create a Claude Code skill (`/weekly-cadence`) that manages sleep blocks and workout events via the Nylas Calendar API through an interactive conversation.

## Configuration

### Environment Variables
```bash
export NYLAS_API_KEY=<your-api-key>
export NYLAS_GRANT_ID=<your-grant-id>
export NYLAS_CALENDAR_ID=<your-calendar-id>  # Usually primary calendar
```

### Event Matching Rules
- **Sleep blocks**: Events with exact title "Sleep"
- **Workout events**: Events with title starting with "Workout:"

---

## Skill Directory Structure

**Location**: `~/.claude/skills/weekly-cadence/`

```
~/.claude/skills/weekly-cadence/
├── SKILL.md              # Main skill definition (required)
├── nylas-api-reference.md # API endpoint reference (loaded on demand)
└── examples.md            # Usage examples (loaded on demand)
```

### SKILL.md Format
```yaml
---
name: weekly-cadence
description: Manages weekly sleep blocks and workout schedules via Nylas Calendar API. Use when adjusting sleep times for travel, rescheduling workouts, or managing weekly recurring events.
allowed-tools: Bash, Read
---

[Instructions for Claude to follow]
```

The skill instructs Claude to:
1. Fetch events from Nylas API using `curl` via Bash tool
2. Parse and display events in a readable format
3. Accept user modifications through conversation
4. Apply changes via API calls

---

## Conversation Flow

### Step 1: Initialization
- Skill prompts for date range (default: next 7 days)
- User can say "next week", "Jan 10-17", or specific dates

### Step 2: Fetch & Display
- Call Nylas API to get events in date range
- Filter to Sleep and Workout: events
- Display in table format:
  ```
  | Day       | Event        | Current Time    |
  |-----------|--------------|-----------------|
  | Mon 1/13  | Sleep        | 11:00pm-7:00am  |
  | Mon 1/13  | Workout: Gym | 6:00am-7:00am   |
  | Tue 1/14  | Sleep        | 11:00pm-7:00am  |
  ```

### Step 3: Interactive Modification
User can request changes like:
- "Shift all sleep blocks +2 hours"
- "Move Monday's workout to Wednesday"
- "Delete Tuesday's sleep block"
- "Add a workout on Friday at 6am"

### Step 4: Confirmation
- Show proposed changes in before/after format
- Wait for user approval

### Step 5: Apply Changes
- Execute API calls (PUT/DELETE/POST)
- Report success/failure for each change

---

## Nylas API Integration

### Base URL
```
https://api.us.nylas.com/v3/grants/{grant_id}
```

### Headers
```
Authorization: Bearer {api_key}
Content-Type: application/json
```

### Endpoints Used

#### List Events
```bash
curl -X GET "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID&start=$START_TS&end=$END_TS" \
  -H "Authorization: Bearer $NYLAS_API_KEY"
```

#### Update Event (time shift/reschedule)
```bash
curl -X PUT "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/$EVENT_ID?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"when": {"start_time": 1234567890, "end_time": 1234571490}}'
```

#### Delete Event
```bash
curl -X DELETE "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/$EVENT_ID?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY"
```

#### Create Event
```bash
curl -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Sleep", "when": {"start_time": 1234567890, "end_time": 1234571490}}'
```

---

## Implementation Steps

### 1. Set up environment variables
- User adds credentials to shell profile (~/.zshrc or ~/.bashrc)

### 2. Create skill directory and files
- Create `~/.claude/skills/weekly-cadence/SKILL.md`
- Include detailed instructions for:
  - How to parse date ranges from natural language
  - API call patterns with curl
  - Event filtering logic
  - Change confirmation workflow
  - Error handling

### 3. Test the flow
- Verify API connectivity
- Test each CRUD operation
- Validate timezone handling (EST)

---

## Skill File Contents (Draft)

The skill markdown will instruct Claude to:

1. **On invocation**: Ask user for date range, default to "next 7 days"

2. **Fetch events**: Use curl to call Nylas API with date range as Unix timestamps

3. **Filter & format**:
   - Match title === "Sleep" OR title.startsWith("Workout:")
   - Convert Unix timestamps to human-readable EST times
   - Display as markdown table

4. **Accept modifications**: Listen for commands like:
   - "shift [event type] [+/-X hours]"
   - "move [specific event] to [new day/time]"
   - "delete [specific event]"
   - "add [event type] on [day] at [time]"

5. **Build change set**: Accumulate changes, show diff

6. **Confirm & apply**: On user approval, execute API calls sequentially

7. **Report results**: Show success/failure for each operation

---

## Files to Create

| File | Purpose |
|------|---------|
| `~/.claude/skills/weekly-cadence/SKILL.md` | Main skill definition with instructions |
| `~/.claude/skills/weekly-cadence/nylas-api-reference.md` | API endpoint documentation |

---

## SKILL.md Draft Content

```markdown
---
name: weekly-cadence
description: Manages weekly sleep blocks and workout schedules via Nylas Calendar API. Use when adjusting sleep times for travel, rescheduling workouts, viewing weekly schedule, or managing recurring calendar events.
allowed-tools: Bash, Read
---

# Weekly Cadence Manager

Helps manage Sleep blocks and Workout events in Google Calendar via Nylas API.

## Environment Requirements
Requires these environment variables:
- `NYLAS_API_KEY` - Nylas API key
- `NYLAS_GRANT_ID` - Grant ID for the connected Google account
- `NYLAS_CALENDAR_ID` - Calendar ID (usually primary)

## Event Patterns
- **Sleep blocks**: Title exactly equals "Sleep"
- **Workout events**: Title starts with "Workout:"

## Workflow

### 1. Get Date Range
Ask the user for the date range to work with. Accept natural language like:
- "next week"
- "Jan 10-17"
- "this week"
Default to next 7 days if not specified.

### 2. Fetch Events
Use curl to fetch events from Nylas:

```bash
START_TS=$(date -v+0d +%s)  # Today
END_TS=$(date -v+7d +%s)    # 7 days from now

curl -s -X GET "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID&start=$START_TS&end=$END_TS" \
  -H "Authorization: Bearer $NYLAS_API_KEY" | jq .
```

### 3. Filter and Display
Filter events to only show:
- Events where `title === "Sleep"`
- Events where `title` starts with `"Workout:"`

Display as a readable table with:
- Day and date
- Event title
- Start time - End time (in EST)

### 4. Accept Modifications
Listen for user requests like:
- **Time shift**: "Shift sleep blocks +2 hours" → add 2 hours to start/end times
- **Reschedule**: "Move Monday's workout to Wednesday" → change the date
- **Delete**: "Delete Tuesday's sleep block" → remove the event
- **Create**: "Add a sleep block Friday 11pm-7am" → create new event

### 5. Show Proposed Changes
Before applying, show a summary:
```
Proposed Changes:
1. Sleep (Mon 1/13): 11pm-7am → 1am-9am (+2 hours)
2. Workout: Gym (Mon 1/13): DELETE
3. Sleep (Fri 1/17): CREATE 11pm-7am
```

Ask user to confirm: "Apply these changes? (yes/no)"

### 6. Apply Changes
On confirmation, execute API calls:

**Update event:**
```bash
curl -X PUT "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/$EVENT_ID?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"when": {"start_time": <unix_ts>, "end_time": <unix_ts>}}'
```

**Delete event:**
```bash
curl -X DELETE "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/$EVENT_ID?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY"
```

**Create event:**
```bash
curl -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Sleep", "when": {"start_time": <unix_ts>, "end_time": <unix_ts>}}'
```

Report success/failure for each operation.

## Important Notes
- Always confirm changes before applying
- Times should be displayed and accepted in EST
- Unix timestamps are used for API calls
- Use `notify_participants=false` to avoid sending calendar invites
```
