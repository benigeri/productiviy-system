# Fix Email Forwarding - Implementation Plan

**Bead:** `productiviy-system-gvp`

## Problem

When user asks to forward an email, the current workflow only creates a reply draft with the same subject. It doesn't:
1. Include the original thread content in the body
2. Change recipients to the forward target
3. Use "Fwd:" subject prefix
4. Omit the `reply_to_message_id` (forwards start new threads)

---

## Deep Research Findings

### 1. Nylas API Has No Native Forward Support

Per [Nylas Messages API docs](https://developer.nylas.com/docs/v3/email/), there is **no dedicated "forward" endpoint**. The [nylas-mail GitHub issue #1746](https://github.com/nylas/nylas-mail/issues/1746) confirms that forwarding requires manual body construction:

- **Replies**: Use `<blockquote>` to wrap quoted content
- **Forwards**: Use plain `<div>` (NOT blockquote) to preserve original formatting without visual indentation

### 2. W3C Email Threading Standard

The [W3C HTML Threading conventions](https://www.w3.org/TR/1998/NOTE-HTMLThreading-0105) recommend:
- Use `<blockquote cite="mid:message-id">` for quoted content
- BLOCKQUOTE naturally indents in older clients, preserving conversation flow
- CLASS attributes can apply CSS styling for visual distinction

### 3. Email Client Blockquote Support

Per [Can I Email](https://www.caniemail.com/features/html-blockquote/):
- **97.56% support** across email clients
- Gmail, Apple Mail, Outlook all support `<blockquote>`
- Outlook uses inline `border-left` styling for visual distinction

### 4. Gmail's Forward Format

Gmail uses this exact structure for forwarded messages:
```html
<div dir="ltr">User's intro message here</div>
<br>
<div class="gmail_quote">
  <div dir="ltr" class="gmail_attr">
    ---------- Forwarded message ---------<br>
    From: <strong class="gmail_sendername">Sender Name</strong>
    <span dir="auto">&lt;sender@example.com&gt;</span><br>
    Date: Mon, Jan 6, 2025 at 10:30 AM<br>
    Subject: Original Subject<br>
    To: &lt;recipient@example.com&gt;<br>
  </div>
  <br><br>
  [Original message body here - NOT in blockquote]
</div>
```

**Key insight from nylas-mail issue**: Forwards should use `<div>` NOT `<blockquote>` to preserve original HTML formatting.

### 5. Outlook's Forward Format

Per [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5514300/how-to-detect-quoted-content-patterns-in-outlook-e):
- Uses `<div>` or `<table>` with inline styles
- Includes text markers: "From:", "Sent:", "To:", "Subject:"
- Often has `border-left` or `margin-left` inline styles

---

## Implementation Plan

### Phase 1: Add `--forward` Mode to draft-email.py

**Changes:**
```python
# New argument
parser.add_argument("--forward", action="store_true",
    help="Forward mode: include full thread content in body")
parser.add_argument("--forward-to",
    help="Recipient email for forward (required with --forward)")
```

**New function:**
```python
def build_forward_body(thread: dict, messages: list, intro: str) -> str:
    """Build Gmail-style forward body with all messages."""
    parts = []

    # User's intro
    if intro:
        parts.append(f'<div dir="ltr">{intro}</div><br>')

    # Forward header
    parts.append('<div class="gmail_quote">')
    parts.append('<div dir="ltr" class="gmail_attr">')
    parts.append('---------- Forwarded message ---------<br>')

    # Get first message for headers
    first_msg = messages[0]
    from_info = first_msg.get("from", [{}])[0]
    parts.append(f'From: <strong>{from_info.get("name", "")}</strong> ')
    parts.append(f'&lt;{from_info.get("email", "")}&gt;<br>')
    parts.append(f'Date: {format_date(first_msg.get("date", 0))}<br>')
    parts.append(f'Subject: {thread.get("subject", "")}<br>')
    to_info = first_msg.get("to", [{}])[0]
    parts.append(f'To: &lt;{to_info.get("email", "")}&gt;<br>')
    parts.append('</div><br><br>')

    # Original message bodies (in divs, NOT blockquotes)
    for msg in messages:
        body = msg.get("body", "") or msg.get("conversation", "")
        parts.append(f'<div>{body}</div><br>')

    parts.append('</div>')
    return ''.join(parts)
```

### Phase 2: Update AI Prompt for Forward Detection

Add to `email-writing-guidelines.md`:
```markdown
## Forward Detection

If the user's dictation indicates forwarding (e.g., "forward this to X", "share with Y",
"send to Z"), return a forward response:

{"action": "forward", "to": [{"email": "x@example.com", "name": "X"}], "intro": "<p>FYI</p>", "subject": "Fwd: Original Subject"}

- `action`: "forward" (vs default "reply")
- `to`: The NEW recipient(s), NOT the original sender
- `intro`: Optional intro message (empty string if user just says "forward to X")
- `subject`: Always prefix with "Fwd: "
```

### Phase 3: Update create-gmail-draft.py

```python
# Detect forward mode from draft JSON
is_forward = draft.get("action") == "forward"

# Build payload
payload = {
    "to": draft.get("to", []),
    "cc": draft.get("cc", []),
    "subject": draft.get("subject", ""),
    "body": draft.get("body", ""),
}

# Only add reply_to_message_id for replies, NOT forwards
if not is_forward and not args.no_reply_to:
    payload["reply_to_message_id"] = latest_message_id
```

### Phase 4: Update Workflow Skill

Add forward handling to SKILL.md workflow:
1. Detect "forward to X" in dictation
2. Pass `--forward --forward-to X` to draft-email.py
3. Skip label updates (forward creates new thread, original stays labeled)

---

## Files to Modify

| File | Changes |
|------|---------|
| `draft-email.py` | Add `--forward`, `--forward-to`, `build_forward_body()` |
| `email-writing-guidelines.md` | Add forward detection instructions |
| `create-gmail-draft.py` | Skip `reply_to_message_id` for forwards |
| `SKILL.md` | Forward workflow handling |

---

## Test Cases

- [ ] Forward single message to new recipient
- [ ] Forward multi-message thread (all messages included)
- [ ] Forward with intro message ("FYI", "Sharing this with you")
- [ ] Forward with no intro (just forward the content)
- [ ] Subject gets "Fwd:" prefix
- [ ] No `reply_to_message_id` in forward (new thread)
- [ ] Original thread labels unchanged
- [ ] Preserve attachments in forward (future enhancement)

---

## References

- [Nylas Send Email API](https://developer.nylas.com/docs/v3/email/send-email/)
- [Nylas Mail Issue #1746: HTML formatting of forward quoted text](https://github.com/nylas/nylas-mail/issues/1746)
- [W3C HTML Threading Conventions](https://www.w3.org/TR/1998/NOTE-HTMLThreading-0105)
- [Can I Email: blockquote support](https://www.caniemail.com/features/html-blockquote/)
- [RFC 5322: Internet Message Format](https://datatracker.ietf.org/doc/html/rfc5322)
- [Microsoft: Outlook quoted content patterns](https://learn.microsoft.com/en-us/answers/questions/5514300/how-to-detect-quoted-content-patterns-in-outlook-e)
