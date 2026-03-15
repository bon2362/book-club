# Deferred Work

## Header.tsx: avatar initials crash on empty string (pre-existing)

**Source:** Edge case review, tech-spec-about-block-positioning
**File:** `components/nd/Header.tsx:151`
**Issue:** `(session.user.name ?? session.user.email ?? '?')[0].toUpperCase()` — if both `name` and `email` are `""` (empty string), `??` won't catch it (empty string is truthy for `??`), so `""[0]` is `undefined` and `.toUpperCase()` throws.
**Fix:** Use `||` instead of `??`: `(session.user.name || session.user.email || '?')[0].toUpperCase()`

## Header.tsx: onSignIn call not guarded (pre-existing)

**Source:** Edge case review, tech-spec-about-block-positioning
**File:** `components/nd/Header.tsx:173`
**Issue:** `onClick={onSignIn}` — if `onSignIn` is undefined and the button somehow renders, calling it throws.
**Fix:** `onClick={onSignIn ?? undefined}` or `onClick={() => onSignIn?.()}`
