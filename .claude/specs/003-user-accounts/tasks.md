# Tasks: User Accounts & Cloud-Saved Lists

**Feature ID:** 003-user-accounts
**Total:** 26 tasks across 8 phases
**Legend:** `[P]` = parallelisable with siblings · every task ends with a runnable VALIDATE

> **TDD is mandatory**, as in 001. Write the test, watch it fail (RED), write the minimal code
> (GREEN), refactor with tests green. Tasks name the test file wherever one applies.

> **The ordering is the risk mitigation, not a preference.** Phase 2 makes the storage interface
> async against `localStorage` *only*, before Firestore exists, so that every async bug found in
> Phase 2 is a refactor bug and every one found in Phase 5 is a Firestore bug. Phase 4 writes and
> tests security rules *before* any client code depends on them, because they are the only
> server-side check this app will ever have. Do not reorder these.

> **Invariant for the whole feature:** `src/state/session.ts`, `src/state/appMachine.ts` and
> everything in `src/parse/` are **not modified**. If a task starts editing them, the abstraction has
> leaked — stop and reconsider. The one exception is Task 19, which adds a new type to
> `src/state/types.ts`.

---

## Phase 1 — Firebase project & guarded config (Tasks 1–3)

*No app behaviour changes in this phase. It exists so that Phase 2's refactor lands on a repo where
the bundle guard is already in place.*

### Task 1: SET UP the Firebase project (manual, outside the repo)
- **IMPLEMENT:** Create a Firebase project. Enable **Authentication → Sign-in method → Google**. Create a **Firestore** database in *production mode* (locked by default — the rules in Phase 4 open it). Register a Web app and copy the config.
- **IMPLEMENT:** Under **Authentication → Settings → Authorised domains**, add `localhost`. Production domain comes in Task 26.
- **GOTCHA:** Choose *production mode*, not test mode. Test mode's default rule allows the world to read and write your database for 30 days.
- **GOTCHA:** Pick the Firestore region near you and note it — it is **permanent** and cannot be changed without recreating the database.
- **VALIDATE:** The Firebase console shows the Google provider enabled and an empty Firestore database

### Task 2: CREATE env config + `.env.example` [P]
- **IMPLEMENT:** `.env.local` with `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`. Commit a `.env.example` with the same keys and empty values. Confirm `.gitignore` covers `.env.local`.
- **IMPLEMENT:** `src/auth/config.ts` reading `import.meta.env`, throwing a clear, named error if any key is missing.
- **WHY:** The Firebase web `apiKey` is **public by design** and ships in the bundle — this is for environment separation (dev vs prod project), *not* secrecy. See plan.md § Security. Do not add a proxy to "hide" it.
- **VALIDATE:** `npm run typecheck` passes; `npm run build` fails with the named error when a key is absent

### Task 3: ADD the bundle guard [P]
- **IMPLEMENT:** Add an oxlint `no-restricted-imports` rule banning `firebase/*` imports everywhere except `src/auth/firebase.ts`. Add an npm script `check:bundle` that builds and asserts the main entry chunk is under **150 KB gzipped** (NFR4a).
- **WHY:** Broken windows (plan.md R3). A future edit that adds a top-level `import { getAuth } from 'firebase/auth'` would silently double the guest bundle. This makes that a lint failure instead. Retrofitting a bundle budget after it is breached never happens.
- **VALIDATE:** `npm run lint` exits 0 now; adding a `firebase/auth` import to `src/App.tsx` makes it exit non-zero

---

## Phase 2 — Async storage port, localStorage only (Tasks 4–7)

*Pure refactor. No new dependencies, no network, no Firebase. `App.test.tsx` is the regression net —
any test that breaks here is a real behaviour change.*

### Task 4: CREATE `src/storage/types.ts` — the `ListStore` port
- **IMPLEMENT:** The `ListStore` interface from plan.md § Storage port: `subscribeLists`, `saveList`, `renameList`, `removeList`, `subscribeSessions`, `recordSession`, `dispose`. Extend the existing `WriteResult` union with `'offline' | 'permission' | 'network'`. Add `StoreError`.
- **WHY:** DRY + design-for-change. One interface means neither adapter re-implements list logic, and the entire feature becomes testable with an in-memory fake.
- **GOTCHA:** Subscription-shaped, not `getAll()`-shaped. Firestore's native form is a live query; forcing it into `getAll()` would mean polling. The local store emits on write in three lines.
- **VALIDATE:** `npm run typecheck`

### Task 5: CREATE `src/storage/memoryStore.ts` (test fake) [P]
- **TEST FIRST:** `src/storage/memoryStore.test.ts` — this fake is itself test infrastructure, so its subscription contract must be pinned.
- **IMPLEMENT:** A full in-memory `ListStore`: emits current state immediately on subscribe, and again after every write.
- **WHY:** Keeps the Firebase emulator off the critical path for every test except the Firestore adapter and the rules.
- **VALIDATE:** `npm test -- memoryStore`

### Task 6: CREATE `src/storage/localListStore.ts`
- **TEST FIRST:** `src/storage/localListStore.test.ts`
- **IMPLEMENT:** A `ListStore` that **wraps** the existing `listRepo`. `subscribeLists` emits `listRepo.getAll()` immediately, then re-emits after each write. Writes return `Promise.resolve(listRepo.…)`. `dispose()` drops listeners only — it must **not** clear `localStorage`.
- **GOTCHA:** Do **not** rewrite or modify `src/storage/listRepo.ts`. Its existing tests are the safety net for this whole phase; keeping it untouched is what makes the refactor cheap. Wrap, don't replace.
- **GOTCHA:** `dispose()` deleting local lists would destroy a guest's data on sign-out. Assert it doesn't.
- **VALIDATE:** `npm test -- localListStore listRepo` — both suites green

### Task 7: REFACTOR `App.tsx` onto `ListStore`
- **TEST FIRST:** Extend `src/App.test.tsx` — same user-visible behaviour, async store.
- **IMPLEMENT:** Replace the `useState(() => listRepo.getAll())` initialiser and every `refresh()` call with a `subscribeLists` effect. Route `persist`, rename and delete through the store. Keep the existing toast rendering, now driven by the widened `WriteResult`.
- **WHY:** This is R4 in isolation. Doing it before Firestore means async bugs and network bugs never get confused with each other.
- **GOTCHA:** The subscription must be torn down on unmount and re-established when the store instance changes (which is what sign-in/out will later do).
- **GOTCHA:** Behaviour must be **identical**. No new spinners, no loading flash — `localStorage` resolves in the same tick.
- **VALIDATE:** `npm test && npm run typecheck && npm run lint` — the full existing suite green with zero changes to `session.ts`, `appMachine.ts` or `src/parse/`

---

## Phase 3 — Firebase bootstrap & auth (Tasks 8–12)

### Task 8: INSTALL firebase + CREATE `src/auth/firebase.ts` (lazy init)
- **IMPLEMENT:** `npm i firebase@^12.18`. A single module owning **every** `firebase/*` import, behind a dynamic `import()`, memoised so repeated calls share one app instance. Initialise Firestore with `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`.
- **GOTCHA:** `initializeFirestore` must be called **before** any other Firestore call, or the cache config is silently ignored.
- **GOTCHA:** Use `persistentLocalCache`, **not** `enableIndexedDbPersistence` — the latter is the legacy API.
- **GOTCHA:** This is the only file the Task 3 lint rule permits to import `firebase/*`. Keep it that way.
- **VALIDATE:** `npm run lint && npm run check:bundle` — main chunk still under 150 KB gz, proving the dynamic import split the chunk

### Task 9: CREATE `src/auth/types.ts` — the `AuthPort` [P]
- **IMPLEMENT:** `AuthUser` (`uid`, `displayName`, `email`, `photoURL`), `AuthStatus = 'resolving' | 'guest' | 'signed-in'`, and `AuthPort` with `subscribe`, `signIn`, `signOut`, `deleteAccount`.
- **GOTCHA:** `'resolving'` is a distinct state, not `user === null`. Conflating them is R2.
- **VALIDATE:** `npm run typecheck`

### Task 10: CREATE `src/auth/firebaseAuth.ts`
- **TEST FIRST:** `src/auth/firebaseAuth.test.ts` with the SDK module mocked.
- **IMPLEMENT:** `AuthPort` over Firebase. `signIn` → `signInWithPopup(auth, new GoogleAuthProvider())`. Map `auth/popup-closed-by-user` and `auth/cancelled-popup-request` to a neutral `cancelled` result, and `auth/popup-blocked` to a distinct `blocked` result. Set the `pvt.auth.hint` localStorage flag on success, clear it on sign-out.
- **GOTCHA — the biggest in this feature:** Use `signInWithPopup`, **never** `signInWithRedirect`. This app is on Cloudflare Pages, so `authDomain` is a different origin, and redirect sign-in is silently broken on Safari 16.1+, Firefox 109+ and Chrome M115+. See plan.md R1. Do not "improve" this on mobile.
- **GOTCHA:** `signInWithPopup` must be reached **synchronously** from the click handler — any `await` before it loses the user-gesture context and the popup is blocked. Load the Firebase chunk *before* the button becomes enabled, not inside the handler. This is the same class of hazard as v1's iOS speech rule.
- **GOTCHA:** A cancelled popup is a normal outcome, not an error. It must not raise a toast.
- **VALIDATE:** `npm test -- firebaseAuth` — success, cancelled, blocked, and generic-failure paths

### Task 11: CREATE `src/auth/AuthContext.tsx`
- **TEST FIRST:** `src/auth/AuthContext.test.tsx` against a faked `AuthPort`.
- **IMPLEMENT:** Provider exposing `{ status, user, signIn, signOut }` via `useSyncExternalStore`. On boot: read `pvt.auth.hint`; if absent go straight to `'guest'` **without loading Firebase at all**; if present, load the chunk and stay `'resolving'` until the first settled emission.
- **WHY:** The hint flag is what delivers NFR4a — a guest downloads zero Firebase bytes. It is a cache of "this device has signed in before", not an auth claim; forging it earns an attacker a wasted download.
- **GOTCHA:** `onAuthStateChanged` fires `null` *before* restoring a persisted session. Never leave `'resolving'` on that first null when the hint is set.
- **GOTCHA:** `useSyncExternalStore`, not `useState` + effect — the auth object is an external mutable store and React 19 concurrent rendering can tear otherwise.
- **VALIDATE:** `npm test -- AuthContext` — including an explicit assertion that the guest UI is **never** rendered while `status === 'resolving'`

### Task 12: CREATE `src/components/AuthPanel.tsx`
- **TEST FIRST:** `src/components/AuthPanel.test.tsx`
- **IMPLEMENT:** Signed out → **Sign in with Google** plus the one-paragraph privacy note (Story 8). Resolving → a neutral placeholder. Signed in → name/email, avatar, **Sign out**. Inline messages for cancelled and blocked popups. Disable the button while a sign-in is in flight.
- **GOTCHA:** The privacy note must fit a phone screen without scrolling — one paragraph, plain language, no legal boilerplate.
- **VALIDATE:** `npm test -- AuthPanel` — all three states plus double-click guarding

---

## Phase 4 — Security rules (Tasks 13–15)

*Written and tested before any client code depends on them. These rules are the **only** server-side
protection this app has.*

### Task 13: CREATE `firestore.rules`
- **IMPLEMENT:** The rules from plan.md § Security verbatim: an `isOwner(uid)` helper, `users/{uid}` with a `hasOnly` field whitelist, `lists/{listId}` with the 500-pair and 200-char name caps, and `sessions/{sessionId}` with **`allow update: if false`**.
- **WHY:** History is a log. Making it append-only in the *rules* rather than in the UI means a client bug cannot rewrite the past.
- **GOTCHA:** No catch-all `match /{document=**}` at the root. Anything unmatched is denied, which is the desired default.
- **VALIDATE:** `firebase deploy --only firestore:rules --dry-run` parses cleanly

### Task 14: SET UP the Firebase emulator + rules tests
- **IMPLEMENT:** `npm i -D @firebase/rules-unit-testing firebase-tools`. `firebase.json` configuring the Firestore emulator. An npm script `test:rules` that runs the emulator and the rules suite.
- **VALIDATE:** `npm run test:rules` starts the emulator and reports 0 tests without erroring

### Task 15: TEST the rules — allow **and** deny
- **TEST FIRST:** `src/../firestore.rules.test.ts` (or `tests/rules/`).
- **IMPLEMENT:** Owner can CRUD their own lists and sessions. **A different signed-in uid cannot read or write them.** **An unauthenticated client cannot read or write anything.** A list with 501 pairs is rejected. A 300-char name is rejected. An unknown field on `users/{uid}` is rejected. **Updating a session document is rejected.**
- **WHY:** NFR8. The deny cases are the entire point — a rules suite that only tests the happy path proves nothing. Untested rules are a guess, and there is no backend to catch a mistake.
- **VALIDATE:** `npm run test:rules` — every case green, deny cases genuinely failing for the right reason

---

## Phase 5 — Firestore store (Tasks 16–18)

### Task 16: CREATE `src/storage/firestoreListStore.ts`
- **TEST FIRST:** `src/storage/firestoreListStore.test.ts`, against the emulator with the real rules loaded.
- **IMPLEMENT:** `ListStore` over `users/{uid}/lists` and `users/{uid}/sessions`. `subscribeLists` uses `onSnapshot`. Writes use the list's **existing client uuid as the document id**. Map Firestore error codes to the `WriteResult` union: `permission-denied` → `'permission'`, `unavailable` → `'offline'`.
- **GOTCHA:** Strip `undefined` field values before writing — Firestore throws on them, and `RawRow.conf` is optional under `exactOptionalPropertyTypes` (plan.md R7). Do **not** set `ignoreUndefinedProperties` globally; it hides real bugs.
- **GOTCHA:** Reusing the client uuid as the doc id is what makes migration idempotent in Task 20. Do not let Firestore auto-generate ids.
- **GOTCHA:** `dispose()` must detach every `onSnapshot` listener. Leaked listeners keep firing after sign-out and will write one user's data into another's view.
- **VALIDATE:** `npm run test:rules && npm test -- firestoreListStore`

### Task 17: WIRE store selection into `App.tsx`
- **TEST FIRST:** Extend `src/App.test.tsx`.
- **IMPLEMENT:** Choose `localListStore` when `status === 'guest'`, `firestoreListStore(uid)` when signed in. Render nothing list-shaped while `'resolving'`. On a store change, dispose the old one and resubscribe.
- **GOTCHA:** The guest path must still involve **zero** Firebase. Assert it — a test that the signed-out app never touches the Firebase module.
- **GOTCHA:** Dispose-then-subscribe ordering matters. Subscribing the new store before disposing the old one can briefly render the previous user's lists.
- **VALIDATE:** `npm test && npm run check:bundle`

### Task 18: ADD sync status (FR16) [P]
- **TEST FIRST:** `src/components/SyncStatus.test.tsx`
- **IMPLEMENT:** A small indicator: offline / syncing / synced, driven by the store's error channel and the browser `online`/`offline` events.
- **WHY:** R5. Last-write-wins is acceptable for a single-user app *only* if "you are offline" is visible rather than a mystery. This is the UI half of that decision.
- **VALIDATE:** `npm test -- SyncStatus`

---

## Phase 6 — Migration (Tasks 19–21)

### Task 19: ADD `SessionRecord` to `src/state/types.ts` [P]
- **IMPLEMENT:** The `SessionRecord` interface from plan.md § Data Model, including `listName`, `mode` and `partial`.
- **GOTCHA:** `listName` is denormalised deliberately — Story 5 requires history to survive deleting the list. Do not "normalise" it into a lookup.
- **GOTCHA:** This is the **only** permitted edit to `src/state/` in this feature. It adds a type; it changes no existing one.
- **VALIDATE:** `npm run typecheck`

### Task 20: CREATE `src/storage/migrate.ts`
- **TEST FIRST:** `src/storage/migrate.test.ts` using two `memoryStore` instances.
- **IMPLEMENT:** `migrateLists(from: ListStore, to: ListStore)` copying every list, preserving ids. Returns per-list success/failure so a partial run can be reported and retried. Records completion per-uid in `localStorage` so the prompt does not reappear.
- **GOTCHA:** **Never delete from the source.** Story 3 requires the device's lists to survive declining, migrating and signing out.
- **GOTCHA:** Idempotency comes from preserving list ids — a re-run overwrites the same documents. Test it explicitly: migrate twice, assert the destination count is unchanged.
- **VALIDATE:** `npm test -- migrate` — including the run-twice case and a partial-failure case

### Task 21: CREATE `src/components/MigratePrompt.tsx`
- **TEST FIRST:** `src/components/MigratePrompt.test.tsx`
- **IMPLEMENT:** Shown on first sign-in **only** when local lists exist. States the exact count. Copy / Not now. Reports partial failure with a retry. Also reachable later from the account area for a user who declined.
- **GOTCHA:** Opt-in. Never migrate silently — Story 3 is explicit.
- **GOTCHA:** Zero local lists ⇒ no prompt at all, not an empty one.
- **VALIDATE:** `npm test -- MigratePrompt`

---

## Phase 7 — Score history (Tasks 22–23)

### Task 22: RECORD sessions on results
- **TEST FIRST:** Extend `src/App.test.tsx`.
- **IMPLEMENT:** When the app lands on the `results` screen, build a `SessionRecord` from the existing `score()` output and call `store.recordSession`. Set `mode: 'wrong-only'` for a `RESTART_WRONG_ONLY` run and `partial: true` when reached via `QUIT`.
- **GOTCHA:** Record in `App.tsx`, **not** in `appMachine.ts`. The reducer is pure and must stay that way — a write inside it would be a side effect in a pure function and would break its existing tests.
- **GOTCHA:** Zero marks ⇒ write nothing. An empty log entry is noise.
- **GOTCHA:** Marking wrong-only runs is what stops them flattering the average (Story 5).
- **VALIDATE:** `npm test -- App` — full run, quit-early, wrong-only, and zero-mark cases

### Task 23: CREATE `src/components/ScoreHistory.tsx`
- **TEST FIRST:** `src/components/ScoreHistory.test.tsx`
- **IMPLEMENT:** Per-list last score and recent trend on the home screen. History is read-only. Records whose list no longer exists still render, using the stored `listName`.
- **GOTCHA:** Cap locally stored history the way `listRepo` caps lists (`MAX_LISTS`), newest kept — a guest drilling daily would otherwise grow `localStorage` without bound.
- **VALIDATE:** `npm test -- ScoreHistory` — including a record for a deleted list

---

## Phase 8 — Account deletion, docs & deploy (Tasks 24–26)

### Task 24: IMPLEMENT account deletion
- **TEST FIRST:** `src/auth/deleteAccount.test.ts` against the emulator.
- **IMPLEMENT:** Client-side recursive delete — all `lists`, all `sessions`, then the `users/{uid}` document, then `deleteUser()`. Batch in chunks of ≤500. Handle `auth/requires-recent-login` by prompting re-authentication and resuming.
- **WHY:** R6 — Cloud Functions need the paid Blaze plan, so there is no server-side path. The delete loop has to live in the client.
- **GOTCHA:** 500 is Firestore's hard batch limit, not a tuning choice.
- **GOTCHA:** Must be safe to re-run after a partial failure (Story 7). Delete data **before** the account — deleting the account first orphans the documents permanently, since only that uid could ever have deleted them.
- **GOTCHA:** Local device lists are untouched. They were never part of the account.
- **VALIDATE:** `npm run test:rules && npm test -- deleteAccount` — including the resume-after-partial-failure case

### Task 25: UPDATE the 001 spec and README [P]
- **IMPLEMENT:** Annotate NFR1, NFR2, NFR4 and the two out-of-scope lines in `.claude/specs/001-vocab-trainer/spec.md` as superseded by 003, pointing at spec.md § "This feature reverses two v1 NFRs". Update `README.md` and the Home screen copy — "Everything stays on this device" is no longer unconditionally true.
- **WHY:** Broken windows. Two specs that silently contradict each other on whether the app has a backend will mislead the next reader, human or agent.
- **VALIDATE:** `grep -n "stays on this device" src/ README.md` returns only correctly-qualified copy

### Task 26: DEPLOY
- **IMPLEMENT:** Add `VITE_FIREBASE_*` to the Cloudflare Pages build environment. Add `practice-vocabulary.pages.dev` to Firebase **authorised domains**. `firebase deploy --only firestore:rules`. Restrict the browser API key by HTTP referrer in the Google Cloud console. Add the rules deploy and `test:rules` to `.github/workflows/ci.yml`.
- **GOTCHA:** Forgetting the authorised domain is the most likely deploy-day failure — sign-in works perfectly on `localhost` and fails on production with an opaque error.
- **GOTCHA:** Rules are **not** part of the Vite build. A green Pages deploy with undeployed rules means the client is talking to the old (locked) rules.
- **GOTCHA:** PR previews get fresh hostnames and wildcards are unsupported, so preview deploys cannot sign in. Expected — verify auth on `localhost` and production.
- **VALIDATE:** On the live URL: sign in on desktop and on a phone, save a list, sign in on the second device and see it, go offline and still practise, finish a drill and see it in history, sign out and confirm the lists are gone from the device

---

## Validation Gate

Before calling the feature done, all of:

```bash
npm run typecheck && npm run lint && npm test && npm run test:rules && npm run check:bundle && npm run build
```

Plus the manual checks in Task 26, **on a phone** — the real target device, per 001.
