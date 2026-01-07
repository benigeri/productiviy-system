# Nylas Calendar API Reference

Quick reference for the weekly-cadence skill.

## Authentication

```
Authorization: Bearer $NYLAS_API_KEY
Content-Type: application/json
```

## Base URL

```
https://api.us.nylas.com/v3/grants/{grant_id}
```

## Environment Variables

```bash
NYLAS_API_KEY     # API key from Nylas dashboard
NYLAS_GRANT_ID    # Grant ID for the connected account
NYLAS_CALENDAR_ID # Calendar ID (use "primary" for main calendar)
```

---

## Endpoints

### Get Calendar

```bash
GET /calendars/{calendar_id}
```

### List Events

```bash
GET /events?calendar_id={calendar_id}&limit=10
```

Query params:
- `calendar_id` (required)
- `limit` - max results
- `start` - Unix timestamp (seconds)
- `end` - Unix timestamp (seconds)

### Create Event

```bash
POST /events?calendar_id={calendar_id}
```

Query params:
- `calendar_id` (required)
- `notify_participants` - boolean (default: false)

Request body:
```json
{
  "title": "Event Title",
  "when": {
    "start_time": 1674604800,
    "end_time": 1674608400,
    "start_timezone": "America/New_York",
    "end_timezone": "America/New_York"
  },
  "description": "Optional description",
  "location": "Optional location",
  "busy": true,
  "participants": [
    { "name": "Name", "email": "email@example.com" }
  ]
}
```

### Update Event

```bash
PUT /events/{event_id}?calendar_id={calendar_id}
```

Same body format as create (only include fields to update).

### Delete Event

```bash
DELETE /events/{event_id}?calendar_id={calendar_id}
```

---

## Time Formats

The `when` object uses Unix timestamps in **seconds** (not milliseconds):

```json
{
  "start_time": 1674604800,
  "end_time": 1674608400,
  "start_timezone": "America/Los_Angeles",
  "end_timezone": "America/Los_Angeles"
}
```

Convert with:
```bash
TZ=America/Los_Angeles date -j -f "%Y-%m-%d %H:%M" "2026-01-06 22:00" "+%s"
```

---

## Example: Create Sleep Block

```bash
curl -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sleep",
    "when": {
      "start_time": 1736218800,
      "end_time": 1736247600,
      "start_timezone": "America/New_York",
      "end_timezone": "America/New_York"
    },
    "busy": true
  }'
```

## Example: Create Workout Event

```bash
curl -X POST "https://api.us.nylas.com/v3/grants/$NYLAS_GRANT_ID/events?calendar_id=$NYLAS_CALENDAR_ID" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Workout",
    "when": {
      "start_time": 1736251200,
      "end_time": 1736254800,
      "start_timezone": "America/New_York",
      "end_timezone": "America/New_York"
    },
    "busy": true,
    "location": "Gym"
  }'
```

---

## Recurring Events

Add `recurrence` array with RRULE:

```json
{
  "title": "Daily Workout",
  "when": { ... },
  "recurrence": ["RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"]
}
```

Common patterns:
- `RRULE:FREQ=DAILY` - every day
- `RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR` - Mon/Wed/Fri
- `RRULE:FREQ=WEEKLY;COUNT=4` - weekly for 4 weeks

---

## Sources

- [Using the Events API](https://developer.nylas.com/docs/v3/calendar/using-the-events-api/)
- [Calendar API Quickstart](https://developer.nylas.com/docs/v3/getting-started/calendar/)
- [API Reference](https://developer.nylas.com/docs/v3/api-references/)
