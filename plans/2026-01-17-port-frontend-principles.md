# Plan: Port Frontend Principles to Email Workflow (ps-50)

## Goal
Migrate frontend patterns, components, and design system from `deep-research-archive` to `email-workflow` app. Result: professional, polished email productivity interface with consistent design system.

## Context
- **Source repo:** /Users/benigeri/Projects/deep-research-archive
- **Target repo:** /Users/benigeri/Projects/productiviy-system/email-workflow
- **Current state:** email-workflow has basic shadcn setup (5 components), no nav, hardcoded colors, 590-line ThreadDetail.tsx

---

## Architecture Decisions (from review)

### Kept
| Item | Rationale |
|------|-----------|
| NavBar with animated underlines | App needs navigation, nice polish |
| Base color: slate → neutral | Matches source repo, more professional |
| 1 custom font | Typography matters, but 3 is excessive |
| 4 Radix packages | May use hover-card, label, progress, select |
| Status color variables | Useful, documented |
| Typography plugin | Good for prose content |
| Theme variable cleanup | Core goal - consistency |

### De-scoped
| Item | Rationale |
|------|-----------|
| ThreadDetail → 5 components | Overkill for single-use code |
| Custom animations | Not needed for email productivity app |
| 3 fonts → 1 | Excessive |
| Future nav links | YAGNI - features don't exist yet |

### ThreadDetail Approach
- **Don't** fragment into 5 files
- **Do** use standard shadcn components (Card, Button, Badge, Label)
- **Maybe** extract `useDraftWorkflow` hook if it cleans things up

---

## Implementation Plan

### Phase 1: Foundation
1. Update `components.json` - baseColor: slate → neutral
2. Install Radix deps: `npm install @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-progress @radix-ui/react-select`
3. Add shadcn components: `npx shadcn@latest add hover-card label progress select`
4. Add `@tailwindcss/typography` plugin

### Phase 2: Theme System
**globals.css:**
- Neutral-based color palette
- Status colors: `--success`, `--warning`, `--error`, `--info`
- Update `--radius` to `0.625rem` (10px)

**tailwind.config.ts:**
- Add `fontFamily` (1 font)
- Add status colors to extend.colors
- Add typography plugin

**layout.tsx:**
- Import and configure font
- Apply `font-sans antialiased` to body

### Phase 3: NavBar
**Create `components/nav.tsx`:**
- Sticky header with `backdrop-blur-md bg-card/90`
- App name "Email Workflow"
- "Inbox" link with animated underline on hover
- "Compose" button (primary CTA)
- NO placeholder future links

**Update `layout.tsx`:**
- Import and render NavBar above children

### Phase 4: Component Polish
**Replace hardcoded colors:**
```
bg-gray-50 → bg-background
bg-white → bg-card
bg-blue-600 → bg-primary
text-gray-* → text-muted-foreground
border-gray-* → border-border
```

**Use shadcn components consistently:**
- Card for containers
- Button for actions
- Badge for status indicators
- Label for form fields
- Input/Textarea for form inputs

**Files to update:**
- `app/inbox/page.tsx`
- `app/inbox/ThreadList.tsx`
- `app/inbox/ThreadDetail.tsx`
- `app/inbox/ComposeForm.tsx`
- `app/inbox/ComposeFAB.tsx`

**Optional:** Extract `useDraftWorkflow` hook if beneficial

---

## Files Summary

| File | Action |
|------|--------|
| `components.json` | Update baseColor |
| `package.json` | Add dependencies |
| `app/globals.css` | Theme + status colors |
| `tailwind.config.ts` | Font + colors + plugin |
| `app/layout.tsx` | Font + NavBar |
| `components/nav.tsx` | **CREATE** |
| `app/inbox/page.tsx` | Theme variables |
| `app/inbox/ThreadList.tsx` | Theme + components |
| `app/inbox/ThreadDetail.tsx` | Theme + components |
| `app/inbox/ComposeForm.tsx` | Theme + components |
| `app/inbox/ComposeFAB.tsx` | Theme variables |

---

## Verification
- [ ] `npm run dev` succeeds
- [ ] Font loads (check Network tab)
- [ ] NavBar visible and sticky on scroll
- [ ] No hardcoded colors: `grep -r "bg-gray\|bg-white\|bg-blue\|text-gray" app/`
- [ ] `npm run build` succeeds

---

## Estimated Effort
~2-3 hours (single session)
