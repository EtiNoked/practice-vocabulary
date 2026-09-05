# Tasks: Dark mode

**Feature ID:** 007-dark-mode
**Baseline:** `main` @ `1848d6c` — **428 tests across 31 files, all passing**
**Total:** 14 tasks across 4 phases
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD where there is behaviour** (Phase 2), as in 001–005: failing test (RED), minimal code
> (GREEN), refactor green. Phases 1 and 3 are presentation, and there the rule is stricter:
> **no existing test may be edited** — with exactly two named exceptions in Task 9, which are
> the assertions that say dark mode is absent. Those invert because the behaviour genuinely
> inverted. Any *other* red test means the change broke something; fix the change, not the test.

> **Order matters.** Phase 1 lands the palette while the only way to see it is to emulate the
> OS — so the app is shippable from Task 4 onward with no UI at all, and the control in Phase 3
> has something real to switch. Task 2 (the token leaks) comes **before** Task 3 (the dark
> block), because merging them means the drill's answer buttons are unreadable for exactly one
> commit.

---

## Phase 1 — The palette (Tasks 1–5)

### Task 1: VERIFY the no-component-changes premise still holds
- **IMPLEMENT:** Nothing. Confirm the assumption the whole plan rests on, on the current build.
- **WHY:** If any colour utility were inlined rather than `var()`-based, Phase 1 would silently
  paint only half the app and the cause would be very hard to see.
- **VALIDATE:**
  ```bash
  npm run build
  grep -o '\.bg-ground{[^}]*}' dist/assets/*.css   # → background-color:var(--color-ground)
  grep -o '\.card{[^}]*}'      dist/assets/*.css   # → every value a var()
  ```
- **STOP IF:** either prints a literal colour. The plan needs rethinking, not adjusting.

### Task 2: FIX the three token-layer leaks
- **IMPLEMENT:** `plan.md` § C. Add `--color-correct-ink: #ffffff` and
  `--color-incorrect-ink: #ffffff` to `@theme`; swap `text-white` → `text-correct-ink` /
  `text-incorrect-ink` at `PracticeCard.tsx:112,119`; change `.btn-danger`'s `color: #fff` to
  `var(--color-incorrect-ink)`.
- **WHY FIRST:** These are light-mode no-ops — white stays white — so this task changes nothing
  visually and can be reviewed on its own. Do it after Task 3 and the "Right"/"Wrong" buttons
  are white-on-light-green for a commit.
- **GOTCHA:** Do **not** rename `--color-correct` / `--color-incorrect`. 005 renamed them once
  already (from `right`/`wrong`, which collided with `text-right`) and `theme.test.ts:67-88`
  pins the current names.
- **VALIDATE:** `npm test` — **428 green**, and the app is pixel-identical.

### Task 3: ADD the dark token blocks to `src/index.css`
- **IMPLEMENT:** `plan.md` § B **verbatim**, both blocks, comments included — they carry the
  specificity reasoning and the reason the duplication is safe.
- **GOTCHA:** **Top level of the file, immediately after `@theme`.** Not *inside* `@theme`
  (it would reject the media query); not inside `@layer base` (Tailwind 4.3 flattens layers, so
  a layer would win nothing — **specificity and source order** are the mechanism).
- **GOTCHA:** `:root:not([data-theme='light'])`, **not** bare `:root`, inside the media query.
  A bare `:root` there ties with `[data-theme='light']` on nothing and an explicit Light choice
  would fail to override a dark OS — the single most likely way to get this wrong.
- **GOTCHA:** Both blocks must list **the same 19 tokens**. Task 9 enforces it; do not rely on
  reading them side by side.
- **VALIDATE:** `npm run build`, then confirm the override actually reaches the browser:
  ```bash
  grep -c "data-theme='dark'\|data-theme=\"dark\"" dist/assets/*.css   # ≥ 1
  ```

### Task 4: RESTORE `color-scheme`, per state
- **IMPLEMENT:** `plan.md` § B, final snippet. Replace the "No `color-scheme` declaration,
  deliberately" comment at `index.css:127-134` with the new one — **rewrite the comment, do not
  just delete it.** It explains why 005 was right *and* why the reasoning inverts; a bare
  deletion loses that and invites someone to remove it again.
- **GOTCHA:** `color-scheme: light`, not `light dark`. Each dark selector declares `dark`
  itself. `light dark` on `:root` would hand form controls back to the OS and defeat an
  override.
- **VALIDATE:** `npm test` — Task 9 has not run yet, so **`theme.test.ts:44` now fails**. That
  is expected and is the only permitted red at this point. Everything else stays green.

### Task 5: UPDATE `theme-color` in `index.html` [P]
- **IMPLEMENT:** `plan.md` § G — two media-scoped `<meta name="theme-color">` tags.
- **WHY:** E-6. Left alone, an installed PWA in dark opens with a mint band above a near-black
  page — the mirror image of the defect 005's commit message called out.
- **GOTCHA:** `csp.test.ts` parses `index.html` with a regex for the CSP meta tag. Adding
  sibling `<meta>` tags is safe, but run it and confirm rather than assuming.
- **VALIDATE:** `npm test -- csp` — green.

---

## Phase 2 — The preference (Tasks 6–7)

### Task 6: TDD `src/theme/theme.ts`
- **TEST FIRST:** `src/theme/theme.test.ts`. Model it on `auth/guestChoice.test.ts` —
  round-trip, absence reads `null`, **a junk stored value reads `null`**, `writeTheme(null)`
  *removes* the key rather than storing a falsy string, and a `Storage.prototype` spy that
  throws is swallowed on both read and write.
- **IMPLEMENT:** `plan.md` § D — `THEME_KEY`, `readTheme`, `writeTheme`, `applyTheme`,
  `initTheme`.
- **GOTCHA:** `localStorage`, **not** `sessionStorage` — the opposite of `guestChoice.ts`, which
  is deliberately per-session. Comment the contrast; the two files otherwise look identical and
  the difference is the entire behaviour.
- **GOTCHA:** `applyTheme(null)` must `removeAttribute`, not set `data-theme=""`. An empty
  attribute still matches `[data-theme]` selectors.
- **GOTCHA:** Assert `applyTheme` is idempotent — `main.tsx` runs under `StrictMode` (E-7).
- **VALIDATE:** `npm test -- theme` green; `npm run typecheck`.

### Task 7: WIRE `initTheme()` into `main.tsx`
- **IMPLEMENT:** Call `initTheme()` **before** `createRoot(...).render(...)`.
- **GOTCHA:** Before `render`, not in an effect. In an effect the override paints light first
  and then snaps — the flash NFR-1 exists to avoid, for the users who chose a theme on purpose.
- **GOTCHA:** Do **not** add an inline `<script>` to `index.html` to move this earlier. It is
  the standard anti-flash trick and it is unavailable here: `script-src` forbids
  `'unsafe-inline'` and `csp.test.ts:71-78` pins that. The System path — the common one — is
  already flash-free via CSS.
- **VALIDATE:** `npm run build`; `npm test` — no new failures.

---

## Phase 3 — The control (Tasks 8–11)

### Task 8: TDD `src/components/ThemeToggle.tsx`
- **TEST FIRST:** `src/components/ThemeToggle.test.tsx` — renders three options; the active one
  is checked; choosing Dark writes `pvt.theme` **and** sets `data-theme` on
  `document.documentElement`; choosing System removes **both**.
- **IMPLEMENT:** `plan.md` § E.
- **GOTCHA:** A **radio group**, not a switch. `role="switch"` models two states; this has
  three (FR-9). Use native `<input type="radio">` and style it — grouping, keyboard and
  screen-reader state come free.
- **GOTCHA:** `useState(readTheme)` — the function, not `readTheme()`. Passing the result
  re-reads storage on every render; `App.tsx:45` makes exactly this point.
- **GOTCHA:** Reset `document.documentElement` between tests, or a stray `data-theme` leaks
  into the next file.
- **VALIDATE:** `npm test -- ThemeToggle` green.

### Task 9: UPDATE the design-system guards in `src/test/theme.test.ts`
- **IMPLEMENT:** Four changes:
  1. **Invert** `describe('dark mode is gone, and stays gone')` → rename it to something like
     `'dark mode is expressed in tokens, not in classes'`. Its `color-scheme` assertion at :44
     flips from `not.toMatch` to asserting it **is** declared. **Rewrite the comment above it**
     — the current one explains a decision that no longer holds.
  2. **Keep `'has no dark: variant anywhere in src'` exactly as it is.** This is the point of
     the whole feature: dark mode returns through the token layer, and this test is what stops
     it returning as 83 `dark:` pairs. It should never have needed changing, and it does not.
  3. **New:** both dark blocks define all 19 colour tokens, **and define the same set** — parse
     the `--color-*` names out of each block and compare as sets. This is the guard that makes
     § B's necessary duplication safe.
  4. **New:** no `text-white` / `bg-white` / `text-black` / `bg-black` in components. The
     existing `RAW_PALETTE` regex requires a numeric suffix, so these three leaks (Task 2) slid
     straight past it.
- **GOTCHA:** These are the **only** two existing assertions this feature may change. If
  anything else goes red, the change is wrong.
- **GOTCHA:** The set-equality check must read the **compiled** CSS via the existing `?inline`
  import, not the source — consistent with why this file was written that way.
- **VALIDATE:** `npm test -- theme` green, Task 4's expected failure now resolved.

### Task 10: MOUNT the toggle in `AccountMenu`
- **IMPLEMENT:** `plan.md` § F — both popovers, above the existing actions.
- **TEST:** Extend `AccountMenu.test.tsx`: the toggle is present in the signed-in popover and
  in the guest popover.
- **GOTCHA:** Leave the `if (!available) return null` early return at line 95 **alone**. Its
  "renders nothing at all" test and comment are still correct; FR-8 is solved in App, not here.
- **GOTCHA:** The popover closes on outside `pointerdown` (line 60-78). The toggle is inside
  `popoverRef`, so it is already excluded — but assert that clicking it does **not** close the
  menu, because that is a genuinely easy regression.
- **VALIDATE:** `npm test -- AccountMenu` green.

### Task 11: MOUNT the standalone toggle in the corner slot
- **IMPLEMENT:** `plan.md` § F — `App.tsx:227`'s bar becomes unconditional, rendering
  `<AccountMenu>` or `<ThemeToggle>`.
- **TEST:** In `App.test.tsx`, with the default unconfigured `renderApp()`, a theme control is
  reachable (FR-8).
- **GOTCHA:** `renderApp()` defaults to `configured: false` (`renderApp.tsx:39` says not to
  change that) — so this new branch is what **every existing App test** now renders. Watch for
  tests that assert on the first button or on document structure.
- **GOTCHA:** Keep the `mx-auto flex max-w-xl justify-end px-4 pt-3` wrapper as-is so both
  controls align to the same content edge (App.tsx:217-226 explains why it is in normal flow).
- **VALIDATE:** `npm test` — **all green**, count ≥ 428 plus the new tests.

---

## Phase 4 — Verify what jsdom cannot (Tasks 12–14)

### Task 12: SWEEP every screen in dark, in a real browser
- **IMPLEMENT:** `npm run dev`. Chrome DevTools → Rendering → *Emulate CSS media feature
  prefers-color-scheme: dark*. Walk **every** screen: welcome, home (empty **and** with lists),
  paste panel, list editor, ready, drill (prompt **and** revealed), results, score history,
  sync status, voice warning, migrate prompt, the account popover, and the delete-account
  dialog.
- **WHY:** `jsdom` does not evaluate `prefers-color-scheme` against anything real, so FR-1,
  FR-6 and FR-7 cannot be honestly asserted in the suite (`plan.md` § Testing).
- **CHECK SPECIFICALLY:**
  - the drill's **"Right" / "Wrong" buttons** — the E-1 pair, the one a naive inversion breaks;
  - the **revealed answer** (`text-correct`) — the token that cost a real bug in 005;
  - the **delete-account dialog** — `border-incorrect bg-incorrect-soft` plus the `bg-ink/50`
    scrim behind it (E-5);
  - the **focus ring** (Tab through the drill — it is keyboard-driven) against the dark ground;
  - **card edges** — in dark, `--color-line` carries the separation shadows carry in light
    (§ B). If cards look like they float on nothing, that is the value to adjust.
- **VALIDATE:** every screen legible, nothing invisible, no light panel stranded on a dark page.

### Task 13: VERIFY the four override behaviours by hand [P]
- **IMPLEMENT:** With the emulator above:
  1. OS dark, nothing stored → app dark, **and no flash of light on reload** (FR-1, NFR-1).
  2. OS dark, choose Light → app light, survives reload (FR-3, FR-5).
  3. Override set, flip the emulated OS → **nothing changes** (FR-6). This is the assertion
     that catches a bare `:root` inside the media query (Task 3's second gotcha).
  4. Choose System → key gone from `localStorage`, follows the OS live with no reload (FR-4,
     FR-7).
- **ALSO:** start a drill, switch theme mid-drill — the card must repaint and the session must
  **not** restart (E-8).
- **VALIDATE:** all four, plus the drill check.

### Task 14: CHECK the budget and update the docs [P]
- **IMPLEMENT:** `npm run check:bundle`. Update `README.md`'s design-system section: dark mode
  is back, how it is expressed, and that `--color-*-ink` names the foreground for a fill.
- **GOTCHA:** `index.css:81-85`'s "Light only. Dark mode was deliberately dropped…" comment is
  now **wrong** and must be rewritten. It is the note that specified this feature; leaving it
  stale is exactly the broken window it warned about.
- **VALIDATE:**
  ```bash
  npm run check:bundle    # under 150 KB JS / 220 KB assets (NFR-4)
  npm run lint && npm run typecheck && npm test
  git grep -c "dark:" -- src   # only index.css + theme.test.ts. No component (AC-8)
  ```

---

## Definition of done

- [ ] `npm test` green, ≥ 428 + new tests, no existing assertion weakened beyond Task 9's two
- [ ] `npm run lint`, `npm run typecheck`, `npm run check:bundle` all pass
- [ ] Zero `dark:` variants in any component (AC-8)
- [ ] Zero `className` changes outside `PracticeCard`'s two leak fixes and the two mount points
- [ ] Every screen swept in a real browser, dark (Task 12)
- [ ] All four override behaviours verified by hand (Task 13)
- [ ] `index.css`'s "Light only" comment and `README.md` rewritten, not left stale
