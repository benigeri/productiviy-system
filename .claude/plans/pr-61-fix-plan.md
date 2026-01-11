# PR #61 Code Review - Fix Plan

**Created**: 2026-01-10
**PR**: https://github.com/benigeri/productiviy-system/pull/61
**Branch**: `feature/email-workflow-iteration-ui`

---

## 🎯 Fix Now (This Session)

### Issue #1: Fix HTTP Method Semantics (P0)
**File**: `app/api/drafts/route.ts:93`
**Problem**: Using PUT to create new drafts (should be POST)
**Fix**: Rename PUT to POST and move to `/api/drafts/save/route.ts`
**Time**: 1 hour
**Test**: ❌ No test requested

### Issue #3: Fix Label Update Error Handling (P0)
**File**: `app/api/drafts/route.ts:136-148`
**Problem**: Silently ignores label update failures
**Fix**: Add retry logic + return warning on failure
**Time**: 2-3 hours
**Test**: ❌ No test requested

### Issue #4: Fix CC Recipients Logic (P1)
**File**: `app/inbox/ThreadDetail.tsx:174`
**Problem**: Drops original recipients from reply
**Fix**: Include all original recipients except self in CC
**Time**: 1 hour
**Test**: ✅ **WRITE TEST**

### Issue #5: Fix Race Condition in Draft State (P1)
**File**: `app/inbox/ThreadDetail.tsx:42`
**Problem**: Stale draft shows when navigating quickly
**Fix**: Use useEffect to sync draft with storedDraft
**Time**: 30 minutes
**Test**: ✅ **WRITE TEST**

### Issue #6: Fix Full Page Reload Navigation (P1)
**File**: `ThreadDetail.tsx:150, 195`
**Problem**: Forces full page reload instead of client-side nav
**Fix**: Use Next.js `useRouter().push()`
**Time**: 1 hour
**Test**: ✅ **WRITE TEST**

---

## 📦 Ship Later (Beads Created)

### Issue #2: Add CSRF Protection (P3)
**Bead**: `productiviy-system-wy4`
**Why Deferred**: Complex, 4-6 hours, not blocking for MVP

### Issue #7: Add Content Sanitization (P3)
**Bead**: `productiviy-system-52r`
**Why Deferred**: React escapes by default, refactor risk is future concern

### Issue #8: Add Authentication (P3)
**Bead**: `productiviy-system-id1`
**Why Deferred**: Major feature, 4-6 hours, requires auth strategy decision

### Issue #9: Parallelize API Calls (P2)
**Bead**: `productiviy-system-hkq`
**Why Deferred**: Performance optimization, not blocking

### Issue #10: Add Request Cancellation (P3)
**Bead**: `productiviy-system-fce`
**Why Deferred**: Edge case, minimal impact

### Issue #11: Add localStorage Quota Management (P3)
**Bead**: `productiviy-system-3ee`
**Why Deferred**: Only affects heavy users, can monitor in production

### Issue #12: Move Label IDs to Env Vars (P3)
**Bead**: `productiviy-system-80h`
**Why Deferred**: Works fine for single account, easy future fix

### Issue #13: Refactor Component Size (P3)
**Bead**: `productiviy-system-jdb`
**Why Deferred**: Code quality improvement, not blocking functionality

---

## Summary

**Fixing Now**: 5 issues (6.5 hours estimated)
- 2 P0 (critical blocking issues)
- 3 P1 (high priority with tests)

**Beads Created**: 8 issues
- 6 P3 (ship later)
- 1 P2 (performance optimization)

**Total Issues**: 13 identified
- **Fixing**: 5 (38%)
- **Deferred**: 8 (62%)

---

## Next Steps

1. ✅ Beads created and synced
2. 🔄 Compact/clear session
3. 🛠️ Fix issues #1, #3, #4, #5, #6
4. ✅ Write tests for #4, #5, #6
5. 🧪 Run all tests
6. 📝 Update PR description
7. ✅ Merge PR
8. 🎉 Close original beads (xhs, n0i, ohj)
