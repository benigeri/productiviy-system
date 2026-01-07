---
name: calendar-management
description: Reference documentation for managing calendar events via Nylas API. Used by /manage-calendar slash command.
---

# Calendar Management Reference

Reference documentation for managing calendar events via Nylas Calendar API. Supports creating, viewing, modifying, and deleting events including recurring event instances.

## Usage

Invoke via slash command:
- `/manage-calendar` - Interactive calendar management
- `/manage-calendar set up sleep Jan 17-24, 10pm-6am EST`
- `/manage-calendar delete "No External" blocks from Jan 17-24`
- `/manage-calendar shift tue 20 sleep 1h later`

## Prerequisites

Environment variables in `.env`:
- `NYLAS_API_KEY`
- `NYLAS_GRANT_ID`
- `NYLAS_CALENDAR_ID`

See `nylas-api-reference.md` for API details.

---

## Shell & Environment

**Always use this pattern** for reliable env loading:
```bash
bash -c 'source .env && curl -s ...'
```

The plain `source .env && curl` can fail due to shell state issues.

---

## Timezone

Default timezone: **America/New_York** (Eastern Time)

All timestamps should use:
```json
"start_timezone": "America/New_York",
"end_timezone": "America/New_York"
```

Calculate timestamps for EST:
```bash
TZ=America/New_York date -j -f "%Y-%m-%d %H:%M:%S" "2026-01-17 22:00:00" "+%s"
```

---

## Event Colors

Set colors using the `color_id` field (top-level, NOT in metadata):

| Color ID | Name | Use For |
|----------|------|---------|
| 10 | Basil (Green) | Sleep, Wake up blocks |
| 11 | Tomato (Red) | Important meetings |
| 2 | Sage (Light Green) | Optional |

**Creating with color:**
```bash
curl -s -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Sleep","color_id":"10","when":{...},"busy":true}'
```

**Updating color on existing event:**
```bash
curl -s -X PUT "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/EVENT_ID?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"color_id":"10"}'
```

---

## Date Naming Convention

Sleep blocks are named by the **night they start**:
- "Jan 17 sleep" = starts Sat Jan 17 10pm EST, ends Sun Jan 18 6am EST
- "Tuesday sleep" = the sleep block starting Tuesday night
- "tue 20" = Tuesday January 20th (infer year from context)

Always infer the year from today's date. If today is 2026, "jan 17" means January 17, 2026.

---

## Timestamp Calculation

Convert human dates to Unix timestamps:
```bash
# For Eastern Time
TZ=America/New_York date -j -f "%Y-%m-%d %H:%M:%S" "2026-01-17 22:00:00" "+%s"
```

**Common offsets:**
- 1 hour = 3600 seconds
- 45 minutes = 2700 seconds
- 8 hours = 28800 seconds

To shift earlier: `new_timestamp = old_timestamp - offset`
To shift later: `new_timestamp = old_timestamp + offset`

---

## Default Schedule

### Sleep Blocks
- **Time:** 10:00 PM - 6:00 AM EST (next day) - 8 hours
- **Days:** Every night
- **Title:** "Sleep"
- **Color:** Green (color_id: "10")
- **Busy:** true

### Wake Up and Read Blocks
- **Time:** 6:00 AM - 6:45 AM EST - 45 minutes
- **Days:** Every morning (after sleep)
- **Title:** "Wake up and read"
- **Color:** Green (color_id: "10")
- **Busy:** true

### Workout Events
- **Time:** 6:30 AM - 7:30 AM EST
- **Days:** Monday, Wednesday, Friday
- **Title:** "Workout"
- **Busy:** true

---

## Recurring Events

### Understanding Recurring Events

Recurring events have:
- A **master event** with a base ID (e.g., `d6132e6981e449c38195ecee01c59162`)
- A `recurrence` field with RRULE (e.g., `["RRULE:FREQ=DAILY;WKST=MO;INTERVAL=1"]`)
- **Instance IDs** in format: `{master_id}_{YYYYMMDD}T{HHMMSS}Z`

Example instance ID: `d6132e6981e449c38195ecee01c59162_20260118T100000Z`

### Finding Recurring Events

**Important:** The search API may NOT return recurring event instances. If you can't find an event by searching, try:

1. **Fetch by direct ID** if you know the master event ID:
```bash
curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/MASTER_ID?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY"
```

2. **Fetch a specific instance:**
```bash
curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/MASTER_ID_YYYYMMDDTHHMMSSZ?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY"
```

3. **Decode Google Calendar URL** to get event ID:
```bash
# From URL like: calendar.google.com/...?eid=BASE64STRING
echo "BASE64STRING" | base64 -d
# Returns: event_id email@domain.com
```

### Deleting Recurring Event Instances

To delete specific instances (not the whole series), construct the instance ID and delete:

```bash
# Delete Jan 17-24 instances of a daily recurring event
for DATE in 17 18 19 20 21 22 23 24; do
  EVENT_ID="MASTER_ID_202601${DATE}T100000Z"
  curl -s -X DELETE "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/$EVENT_ID?calendar_id=$NYLAS_CALENDAR_ID" \
    -H "Authorization: Bearer $NYLAS_API_KEY"
done
```

**Note:** The time portion (T100000Z) must match the original event's start time in UTC.

---

## Operations

### 1. Create Events for a Date Range

1. Ask user for date range and preferences (timezone, sleep duration, etc.)
2. Calculate Unix timestamps for each day
3. Create events via POST with color

```bash
bash -c 'source .env && curl -s -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Sleep\",\"color_id\":\"10\",\"when\":{\"start_time\":TIMESTAMP,\"end_time\":TIMESTAMP,\"start_timezone\":\"America/New_York\",\"end_timezone\":\"America/New_York\"},\"busy\":true}"'
```

### 2. Find Existing Events

Search by date range:

```bash
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID&start=START_TS&end=END_TS&limit=200" \
  -H "Authorization: Bearer $NYLAS_API_KEY"'
```

**Tips:**
- Use `limit=200` or higher for busy calendars
- Search may not return recurring instances - use direct ID fetch if needed
- Save results to temp file for processing: `> /tmp/events.json`

### 3. Modify Event Times

```bash
bash -c 'source .env && curl -s -X PUT "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/EVENT_ID?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"when\":{\"start_time\":NEW_START,\"end_time\":NEW_END,\"start_timezone\":\"America/New_York\",\"end_timezone\":\"America/New_York\"}}"'
```

### 4. Delete Event

```bash
bash -c 'source .env && curl -s -X DELETE "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events/EVENT_ID?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY"'
```

### 5. List All Calendars

```bash
bash -c 'source .env && curl -s "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/calendars" \
  -H "Authorization: Bearer $NYLAS_API_KEY"'
```

---

## Troubleshooting

### Can't find an event that exists on calendar

1. **Try direct ID fetch** - Search API may not return recurring instances
2. **Check the calendar_id** - Event might be on a different calendar
3. **Decode the Google Calendar URL** - User can share the event URL, decode `eid` parameter
4. **Check timestamp range** - Ensure you're using correct year (2026 vs 2025)

### Event color not applying

- Use `color_id` as a **top-level field**, NOT inside `metadata`
- Update existing events with a separate PUT request containing just `{"color_id":"10"}`

### Recurring event won't delete

- You need the **instance ID**, not just the master ID
- Format: `{master_id}_{YYYYMMDD}T{HHMMSS}Z`
- The time must match the event's UTC start time

---

## Example Interactions

### Setting up a week with sleep and wake blocks
```
User: set up sleep from Jan 17-24, 10pm-6am EST with wake up blocks

Claude: I'll create:
- 8 Sleep blocks (10pm-6am EST, green) - Sat 17 through Sat 24
- 8 Wake up and read blocks (6am-6:45am EST, green) - Sun 18 through Sun 25

[Creates events...]

✓ Created 8 sleep blocks
✓ Created 8 wake up and read blocks
Your week is set!
```

### Deleting recurring event instances
```
User: delete the "No External" blocks from Jan 17-24

Claude: Let me find those events...
[Searches, doesn't find in results]
[User provides Google Calendar URL]
[Decodes URL to get master event ID]

Found it - it's a daily recurring event.
Deleting instances for Jan 17-24...

✓ Deleted 8 "No External" instances
```

### Modifying events
```
User: shift tue 20 sleep 1h later

Claude: Found Tuesday Jan 20 sleep block (10pm-6am EST).
Shifting 1 hour later...

✓ Updated: 11:00 PM - 7:00 AM EST
```

---

## Customization Options

User can specify:
- Different timezone (EST, PT, etc.)
- Different sleep times (e.g., "11pm-7am")
- Different sleep duration (e.g., "7 hours")
- Wake up routine duration (e.g., "45 min", "1 hour")
- Different workout days (e.g., "Tue/Thu/Sat")
- Event colors
- Skip certain days
- Delete specific recurring event instances
