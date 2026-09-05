# Tasks: Look and Feel

**Feature ID:** 005-look-and-feel
**Baseline:** `main` @ `d64aabc` — **381 tests across 28 files, all passing**
**Total:** 16 tasks across 5 phases
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD where there is behaviour**, as in 001–004: failing test (RED), minimal code (GREEN),
> refactor green. Phases 1, 4 and 5 are presentation, and there the rule is stricter:
> **no existing test may be edited.** If one breaks, the change broke behaviour — fix the
> change, not the test.

> **Order matters.** Phase 1 is purely additive — adding an `@theme` block does not change
> what `bg-slate-800` renders — so the app is shippable throughout. Phases 2 and 3 build the
> new screens **in the new visual language**, so nothing gets styled twice. Dark mode comes
> out in **one** sweep in Phase 5, never partially: `color-scheme` removed while `dark:`
> classes are still live is the one genuinely broken intermediate state.

---

## Phase 1 — The design system (Tasks 1–4)

### Task 1: ADD the Lexend font asset
- **IMPLEMENT:** Subset Lexend variable to latin + latin-ext with the `pyftsubset` command in
  `plan.md` § A. Commit `src/assets/fonts/lexend-variable.woff2` and `OFL.txt`.
- **GOTCHA:** **`src/assets/`, not `public/`.** A `public/` file is copied unhashed, so it can
  never be cached immutably and a font update would be invisible to returning users.
- **GOTCHA:** Verify ≤ 60 KB (NFR-3) **before** committing. If the subset lands materially
  larger, `--layout-features="*"` is the usual cause.
- **GOTCHA:** Commit `OFL.txt`. Redistributing an OFL font without its licence is a violation,
  not an oversight.
- **VALIDATE:** `du -h src/assets/fonts/lexend-variable.woff2`

### Task 2: WRITE the design system into `src/index.css`
- **IMPLEMENT:** `plan.md` § A **verbatim** — `@font-face`, `@theme`, `@layer base`,
  `@layer components`. Comments included; they carry the reasoning for the two
  contrast-forced substitutions and for the `color-scheme` removal.
- **GOTCHA:** Leave `color-scheme: light dark` **in place for now**. Removing it here, with 83
  `dark:` occurrences still live, gives light form controls against dark-variant surfaces.
  It comes out in Task 14.
- **GOTCHA:** Do **not** add a `tailwind.config.js`. Tailwind 4 reads `@theme` from CSS and
  `vite.config.ts` passes `@tailwindcss/vite` zero options — keep the system in one language.
- **GOTCHA:** Line heights pair as `--text-lg--line-height`, the Tailwind 4 double-dash
  convention. A single dash silently does nothing.
- **VALIDATE:** `npm run build` succeeds; `npm test` still reports **381 green** — the app
  looks identical, because tokens are additive.

### Task 3: VERIFY the font draws every glyph the app needs [P]
- **IMPLEMENT:** In `npm run dev`, render 004's French fixtures from
  `src/test/fixtures/text.ts` at 2.5 rem and inspect.
- **WHY:** E-12, and it is not hypothetical — 004 is in production, so `l'été`, `la fenêtre`
  and `le garçon` are real user data today.
- **GOTCHA:** Check `é è ê ç à û ï ë œ` and the typographic apostrophe `’` (`ReadyScreen.tsx:16`
  and `SyncStatus.tsx:46` use `&apos;` / `&rsquo;`).
- **GOTCHA:** A missing glyph does **not** error — the browser substitutes silently from a
  fallback face, so it reads as "that letter looks slightly wrong". Compare side by side.
- **VALIDATE:** every fixture word renders in Lexend with no substitution.

### Task 4: EXTEND `scripts/check-bundle.mjs` to count CSS and fonts [P]
- **TEST FIRST:** run `npm run check:bundle` on `main` and record the eager-JS figure. It is
  the number every later run is compared against.
- **IMPLEMENT:** `plan.md` § F3 — also collect `rel="stylesheet"` hrefs and `url(...)` font
  references from the emitted CSS. Report JS and total separately; budgets 150 KB and 220 KB.
- **WHY:** FR-30. The script measures only `<script>` and `modulepreload` (lines 36-37), so it
  is blind to exactly the two asset types this feature introduces. A guard that cannot see the
  new risk is not a guard.
- **GOTCHA:** woff2 is already compressed — count raw bytes, do not gzip it again.
- **GOTCHA:** Keep the eager-JS number and its 150 KB budget separate and intact. It is what
  proves the Firebase chunk is still lazy (003's NFR4a); folding it into a total would quietly
  retire that guarantee.
- **VALIDATE:** `npm run check:bundle` passes and now prints three lines plus a total.

---

## Phase 2 — The welcome screen (Tasks 5–7)

### Task 5: CREATE `src/auth/guestChoice.ts` and `src/auth/messages.ts` [P]
- **TEST FIRST:** `src/auth/guestChoice.test.ts` — absent key reads `false`; write-then-read
  round-trips; `writeGuestChoice(false)` **removes** the key rather than storing `'0'`; a
  throwing `getItem` yields `false`; a throwing `setItem` is swallowed.
- **IMPLEMENT:** `plan.md` § B4 verbatim. Then move `messageFor` from `AuthPanel.tsx:5-21` **by
  cut and paste** into `messages.ts` as `signInFailureMessage`, and import it back into
  `AuthPanel` so the suite stays green — the deletion happens in Task 11, not here.
- **PATTERN:** `src/auth/types.ts:54-69` for the storage helpers; `src/storage/messages.ts` for
  the message module.
- **GOTCHA:** `sessionStorage`, **not** `localStorage` (D-5). One word apart, and the entire
  behaviour that was asked for.
- **GOTCHA:** Stub the throwing case with `vi.spyOn(Storage.prototype, 'getItem')`. Deleting
  `window.sessionStorage` breaks jsdom for the rest of the file.
- **GOTCHA:** Do not "improve" any message string. Four existing tests match `/allow popups/i`,
  `/cancelled/i`, `/sign in again/i`, `/could not be deleted/i`.
- **VALIDATE:** `npm test -- guestChoice AuthPanel` — new tests green, all 16 `AuthPanel` ones
  still green and unedited.

### Task 6: CREATE `src/components/WelcomeScreen.tsx`
- **TEST FIRST:** `WelcomeScreen.test.tsx`, porting the guest half of `AuthPanel.test.tsx:44-90`
  plus what is new:
  - Renders the app name, tagline, **Sign in with Google**, **Continue as guest**.
  - The privacy note — keep the matcher `/stays on this device and nothing is sent anywhere/i`.
  - Sign-in click calls `store.signIn` once; `blocked` → `role="alert"` `/allow popups/i`;
    `cancelled` → `/cancelled/i`; the button is disabled while in flight.
  - **After a failed sign-in, Continue as guest is still enabled** (E-4) — new.
  - **Continue as guest** calls `onContinueAsGuest` once and does **not** call `signIn`.
- **IMPLEMENT:** `plan.md` § D, in the new visual language — `.btn .btn-primary .btn-lg` and
  `.btn .btn-quiet .btn-lg`, tokens only, **no `dark:` classes**.
- **GOTCHA:** **Continue as guest is a button, not a text link**, and the same height as
  sign-in. It is a first-class choice, not a dismissal — that is the whole point of the screen.
- **GOTCHA:** `aria-hidden="true"` on the Google SVG, or its four paths surface in the button's
  accessible name and break the `getByRole` query.
- **GOTCHA:** This component renders **no** toast, `SyncStatus` or `VoiceWarning` — those
  belong to the app behind the gate.
- **VALIDATE:** `npm test -- WelcomeScreen`

### Task 7: WIRE the gate into `src/App.tsx`
- **TEST FIRST:** extend `src/test/renderApp.tsx` with `configuredGuestStore()` and
  `signedInStore(user)` — both building a **real** `createAuthStore({ configured: true })` so
  the boot path under test is production's. Then in `App.test.tsx`:
  - Configured + guest + no session choice → welcome shows, home does not (assert **New list**
    is *absent*, not just that a heading is present).
  - **Continue as guest** → the app appears and `sessionStorage` holds the choice.
  - Choice already set → straight to the app.
  - `renderApp()` (unconfigured) → **never** a welcome screen (FR-14).
  - `hasHint: true` with the port not yet emitting → `resolving` shows the app (E-1, FR-13).
  - Signing in from the welcome screen closes the gate on its own (FR-16).
- **IMPLEMENT:** `plan.md` § B2 and § B3. Move the toast, `SyncStatus` and `VoiceWarning`
  inside the non-welcome branch.
- **GOTCHA:** Run `npm test` **before** writing any of this and confirm 381 green, so a later
  failure is attributable to this task rather than inherited.
- **GOTCHA:** Add `sessionStorage.clear()` to `App.test.tsx`'s `beforeEach` — it clears only
  `localStorage` today. Without it the guest choice leaks between tests and ordering decides
  the result.
- **GOTCHA:** Seed with `useState(readGuestChoice)` — the **function** form. `useState(readGuestChoice())`
  re-reads storage every render.
- **GOTCHA:** `available` must be the first term of the `&&`, so an unconfigured build never
  evaluates the rest and never renders gate DOM.
- **GOTCHA:** `signedInStore` needs `hasHint: true`, or the store starts at `guest` and never
  attaches the port (`authStore.ts:48,82`) — the test then asserts against a signed-out app and
  passes for the wrong reason.
- **VALIDATE:** `npm test -- App` — the existing tests **unedited** and green, plus the new ones.

---

## Phase 3 — The account menu (Tasks 8–11)

### Task 8: CREATE `src/components/AccountMenu.tsx` — the four states
- **TEST FIRST:** `AccountMenu.test.tsx`, porting `AuthPanel.test.tsx`'s `resolving`,
  `signed in` and `unconfigured` blocks:
  - `available: false` → `container` empty (port `AuthPanel.test.tsx:112-120` verbatim).
  - `resolving` → no sign-in control anywhere, plus a `role="status"` placeholder.
  - `signed-in` → a button named for the display name; opening it reveals the email and
    **Sign out**; **Sign out** calls `store.signOut` once.
  - `displayName: null` → the email is the accessible name.
  - Both null → "your account" (E-3) — new.
  - `photoURL` set → an `<img>`; firing `error` swaps to the initial (E-2) — new.
  - `guest` → a compact **Sign in** control; its popover shows the Google button, and a
    `blocked` outcome shows `/allow popups/i` **inside the popover** (E-4) — new.
- **IMPLEMENT:** `plan.md` § C2 and § C4, tokens only.
- **GOTCHA:** Hooks first, `if (!available) return null` **after** them.
- **GOTCHA:** `alt=""` on the image, `aria-label` on the button (FR-20) — otherwise the name is
  announced twice.
- **GOTCHA:** Trigger the fallback in test with `fireEvent.error(img)`; jsdom never loads images
  so `onError` will not fire on its own.
- **GOTCHA:** The guest popover gets **one short sentence**, not the six-line privacy paragraph
  (FR-21). Putting it back here re-creates the problem this feature exists to solve.
- **VALIDATE:** `npm test -- AccountMenu`

### Task 9: ADD the popover mechanics and the delete dialog
- **TEST FIRST:**
  - `Escape` closes **and returns focus to the trigger** — assert `document.activeElement`, not
    merely that the menu is gone.
  - Outside pointer-down closes; on the trigger it toggles rather than reopening.
  - `aria-expanded` tracks state.
  - Port all six deletion tests from `AuthPanel.test.tsx:122-188`.
  - New: `role="dialog"`, `aria-modal="true"`, focus lands on **Cancel**.
- **IMPLEMENT:** `plan.md` § C3 and § C5.
- **GOTCHA:** Exclude the trigger from the outside-pointerdown check, or the menu closes and
  reopens on its own click — which presents as "the menu never opens".
- **GOTCHA:** `pointerdown`, not `click`. And **no** native `popover` attribute or
  `showPopover()` — jsdom support is partial and a test can pass for the wrong reason.
- **GOTCHA:** Carry the four copy assertions across by **cut and paste**; do not retype them.
- **GOTCHA:** Focus **Cancel**, not "Yes, delete everything". A dialog opening with the
  destructive button focused is one Enter keypress from an unrecoverable deletion.
- **VALIDATE:** `npm test -- AccountMenu`

### Task 10: MOUNT the bar, settle the keyboard conflict, wire sign-out
- **TEST FIRST:** in `App.test.tsx` with `signedInStore`:
  - The avatar is present on home **and still present on the `practising` screen** (D-6).
  - Absent entirely under `renderApp()` (FR-18).
  - **With the menu open during a drill, pressing `n` does not mark the card wrong.**
  - Sign out → the welcome screen appears; the session choice is cleared.
  - Sign out from `ready` → after signing back in, the app is on **home**.
  - Sign out mid-drill → `window.confirm` called; declining keeps the drill, accepting ends it
    and writes **no** `SessionRecord` (E-6).
  - Deleting the account follows the same path.
- **IMPLEMENT:** The bar from `plan.md` § B3 (rendered only when `available`),
  `handleSignedOut` from § B5, the confirm from § C6, and the `PracticeCard` key fix from § C3.
- **GOTCHA:** The bar is in **normal flow**, not `fixed`. `PracticeCard`'s header already owns
  the top-right with **Quit** (`PracticeCard.tsx:62`) and an overlay lands on it (NFR-6).
- **GOTCHA:** It must render **below** `SyncStatus` and the toast, which are full-width banners.
- **GOTCHA:** `setState(initialState)`, not `act({ type: 'GO_HOME' })` — `act` runs the
  record-session branch (`App.tsx:126`) and re-reads `sessionMode`.
- **GOTCHA:** `setSavedIds(new Set())` is required, not tidiness (§ B5).
- **GOTCHA:** Stub `window.confirm` with `vi.spyOn` and assert **both** branches. A one-branch
  test proves only that the dialog appears.
- **VALIDATE:** `npm test -- App AccountMenu PracticeCard`

### Task 11: DELETE `AuthPanel` and unhook it from `Home`
- **IMPLEMENT:** `git rm src/components/AuthPanel.tsx src/components/AuthPanel.test.tsx`.
  Remove the import at `Home.tsx:3` and the render at `Home.tsx:41`.
- **GOTCHA:** Before deleting, diff the 16 assertions against what Tasks 6, 8 and 9 now cover.
  Every one must have a home. If any does not, that is a behaviour about to be lost, not a
  test to be dropped.
- **GOTCHA:** `Home`'s `scope` prop and empty-state copy stay — they describe where lists live,
  which is still true.
- **GOTCHA:** Expect the count to drop by 16 then rise. Confirm the net is ≥ 381.
- **VALIDATE:** `npm run typecheck && npm test`

---

## Phase 4 — Restyle every screen (Tasks 12–14)

Same shape each time: apply `plan.md` § E, delete every `dark:`, change nothing else. The
per-file counts in § E are the checksum.

### Task 12: RESTYLE `App.tsx`, the banners, and the home screen
- **SCOPE:** `App.tsx` (2), `SyncStatus` (1), `VoiceWarning` (1), `MigratePrompt` (5),
  `Home` (1), `SavedLists` (7), `ScoreHistory` (4).
- **IMPLEMENT:** `<main>` → `bg-ground text-ink`. Toast, `VoiceWarning`, `MigratePrompt` →
  `bg-accent-soft text-ink`. `SyncStatus` → `bg-surface-sunken` + `border-line`. Saved-list rows
  → `.card`. **New list** → `.btn .btn-primary .btn-lg`. Row actions → `.btn .btn-quiet`.
- **GOTCHA:** Keep `min-h-dvh` on `App.tsx:152` — `dvh` rather than `vh` is what stops mobile
  browser chrome cropping the drill, and it is easy to lose in a class rewrite.
- **GOTCHA:** The toast keeps `role="alert"`, `SyncStatus` keeps `role="status"`.
- **GOTCHA:** Once `.btn` carries the 44 px minimum, **remove** the now-redundant `min-h-11`
  rather than leaving both.
- **VALIDATE:** `npm test -- App SyncStatus VoiceWarning MigratePrompt Home SavedLists ScoreHistory`

### Task 13: RESTYLE `ListEditor` and `PastePanel` [P]
- **SCOPE:** 15 + 8 — the largest chunk. `ListEditor` is 368 lines since 004.
- **IMPLEMENT:** Every input, textarea **and both language selects** → `.field`. The language
  badge (`ListEditor.tsx`) → `.badge`, `bg-accent-soft` when guessed, `bg-primary-soft` when
  authoritative.
- **GOTCHA:** The guessed/authoritative distinction is **semantic**, not decorative — it is how
  the user learns the language was inferred rather than declared (004's FR-17). Keep them
  visually distinct, not merely both pale.
- **GOTCHA:** 004's selects must stay ≥ 44 px.
- **GOTCHA:** Rows carry `data-cell` attributes that `App.test.tsx:33` filters on. Touch nothing
  but `className`.
- **VALIDATE:** `npm test -- ListEditor PastePanel`

### Task 14: RESTYLE the drill — `ReadyScreen`, `PracticeCard`, `ResultsScreen`
- **SCOPE:** 4 + 5 + 6.
- **IMPLEMENT:** The drill card → `.card p-6`. **The prompt and revealed words → `text-word`**
  (FR-10). Right/Wrong → `.btn .btn-lg` with `bg-right` / `bg-wrong`. The score → `text-3xl`.
- **WHY:** This is the screen the feature is really for. The word under test is `text-2xl`
  today — the same size as the list name on the screen before it.
- **GOTCHA:** Right and Wrong keep their ✓ and ✗ glyphs — the non-colour carrier of meaning,
  which keeps the drill usable in forced-colors mode and for a red/green-colourblind user (E-10).
- **GOTCHA:** Preserve `aria-live="polite"` on the card div (`PracticeCard.tsx:68`).
- **GOTCHA:** Check at 375 × 667 **with the account bar present** that Right/Wrong stay above
  the fold (E-11). If they do not, reduce the card's padding rather than the buttons.
- **VALIDATE:** `npm test -- ReadyScreen PracticeCard ResultsScreen`

---

## Phase 5 — Retire dark mode and ship (Tasks 15–16)

### Task 15: REMOVE dark mode, add the guards, audit by hand
- **TEST FIRST:** write `src/test/theme.test.ts` with guards F1 and F2 from `plan.md` § F. Both
  should pass now that Tasks 12–14 have swept — if either fails, it names the file that was
  missed. That is the guard doing its job on its first run.
- **IMPLEMENT:** Delete `color-scheme: light dark` from `index.css`. Change `index.html`'s
  `theme-color` from `#0f172a` to `#f6fbfa`.
- **THEN AUDIT** in `npm run dev`, on welcome, home, editor, ready, practising and results:
  1. Contrast checker — body ≥ 4.5:1, large/UI ≥ 3:1 (NFR-4). Check `ink-faint` on
     `surface-sunken` first; it is the likeliest failure.
  2. Tab through every control; a visible ring on each (FR-5).
  3. 375 × 667 — no horizontal scroll, drill buttons above the fold.
  4. OS in dark mode — the app is fully light, no dark form control (E-9).
  5. Reduced motion — no transitions (E-6 of the system).
- **GOTCHA:** `theme-color` is easy to forget and very visible: it paints Android's address bar
  and an installed PWA's status bar. Left dark, the app opens with a black bar above a mint page.
- **GOTCHA:** Touch **only** that line in `index.html`. The CSP must come out byte-identical
  (NFR-2) and `csp.test.ts`'s 14 assertions prove it.
- **GOTCHA:** Exclude `theme.test.ts` from its own guards, or its regex source fails them.
- **GOTCHA:** Check tokens **in situ**, not in isolation. A pair that passes on `ground` can
  fail on `surface-sunken`, and only one of those is what the user sees.
- **VALIDATE:** `npm test -- theme csp` — both green, `csp.test.ts` unedited.

### Task 16: UPDATE `README.md` and run every gate
- **IMPLEMENT:** The **Accounts** section (README 18-32) describes the panel this feature
  deletes — rewrite it around the welcome screen and the corner menu, keeping the storage table
  and the migration and deletion sentences. Add a short design-system paragraph to "How it's
  built" (line 117): tokens in `index.css`, the primitives, the self-hosted font and its
  licence, and that light is the only theme — **with the reason**, so the next person does not
  read it as an oversight.
- **VALIDATE:**
  ```bash
  npm run typecheck && npm run lint && npm test && npm run check:bundle
  ```
  Expect **≥ 381 tests green**, eager JS within 150 KB, total eager within 220 KB.
- **GOTCHA:** `git diff --stat` should show almost nothing but `className` strings,
  `index.css`, `index.html`, the new components and `check-bundle.mjs`. A changed handler,
  prop or piece of copy in an existing screen means scope slipped (FR-11).
- **GOTCHA:** `npm run test:rules` is unaffected, but run it once to prove it:
  `PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run test:rules`.

---

## Definition of done

- [ ] Tasks 1–16 complete, every VALIDATE green.
- [ ] All fourteen `spec.md` § Acceptance criteria confirmed **by hand**, not only by test.
- [ ] `grep -r "dark:" src/` returns nothing, and `theme.test.ts` enforces it.
- [ ] `grep -rE "(bg|text|border)-(slate|emerald|amber|rose|red)-[0-9]" src/` returns nothing
      but the Google mark's brand fills.
- [ ] Every colour, size, radius and shadow has exactly one definition, in `index.css`.
- [ ] `AuthPanel.tsx` and its test no longer exist; each of their 16 assertions has a named home
      in `WelcomeScreen.test.tsx` or `AccountMenu.test.tsx` — confirm by reading, not by count.
- [ ] ≥ 381 tests green; no existing test edited except the `AuthPanel` ones that moved.
- [ ] `git diff` on `index.html` shows a single changed line: `theme-color`.
- [ ] `package.json` unchanged — the font did not come from npm.
- [ ] `appMachine.ts` unmodified: the drill still knows nothing about accounts.
- [ ] A French list renders `l'été`, `la fenêtre` and `le garçon` with no fallback glyph.
</content>
