# Manage Calendar

Help manage calendar events using the Nylas Calendar API. This includes creating, modifying, and deleting events like sleep blocks, wake up routines, workouts, and other calendar items.

## Instructions

Read the skill file for detailed API reference and patterns:
${{file:.claude/skills/calendar-management/skill.md}}

## Additional Reference

For Nylas API specifics:
${{file:.claude/skills/calendar-management/nylas-api-reference.md}}

## Your Task

Based on the user's request: $ARGUMENTS

If no specific request provided, ask what calendar management they need help with:
- Set up sleep/wake blocks for a date range
- Create or modify workout events
- Delete recurring event instances
- Shift event times earlier/later
- Other calendar operations

Always confirm the timezone (default: EST/America/New_York) and event colors (default: green/color_id "10" for sleep/wake blocks) before creating events.
