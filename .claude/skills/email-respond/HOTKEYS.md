# Email Workflow Hotkeys

Tmux hotkeys for instant email actions during workflow.

## Available Hotkeys

| Hotkey | Command | Action |
|--------|---------|--------|
| **Alt+A** | `approve` | Approve current draft and save to Gmail |
| **Alt+S** | `skip` | Skip current thread (keep labels unchanged) |
| **Alt+D** | `done` | Exit workflow and show summary |
| **Alt+V** | (paste) | Paste clipboard content as multi-line dictation |

## How It Works

- Hotkeys are **automatically activated** when the email panel is created
- Commands are sent to the Claude Code conversation pane (not the email panel)
- Hotkeys are **automatically deactivated** when the panel is closed
- Alt+V uses tmux clipboard integration for multi-line paste support

## Usage

Just press the hotkey combinations during the email workflow. The commands will be sent to the agent as if you typed them.

### Example Workflow

1. Panel shows email thread
2. You dictate response: "tell them we'll have it ready by Friday"
3. Draft appears in panel
4. Press **Alt+A** → Draft saved, next thread shown
5. Press **Alt+S** → Skip current thread
6. Press **Alt+D** → Workflow ends

### Multi-line Dictation

For complex dictation, copy text to clipboard first, then press **Alt+V**:

1. Write/copy your dictation to clipboard
2. Press **Alt+V** in email workflow
3. Full multi-line text is pasted as dictation

## Implementation

- **email-hotkeys.sh** - Setup/teardown tmux key bindings
- **panel-manager.sh** - Integrates hotkeys on panel create/close
- Stores agent pane ID in `/tmp/email-agent-pane-id.txt`
- Uses tmux `bind-key -n` for global hotkeys
