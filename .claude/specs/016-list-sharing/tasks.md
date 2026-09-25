# Tasks: 016-list-sharing

**Baseline:** `main` @ `a45a15d`
**Branch:** `claude/list-sharing-feature-872bcu`
**Total:** 26 tasks across 8 phases (revision 3: one `lists` collection; no Worker, no email provider, no manual setup)
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD is mandatory**, as in every spec before this one. Failing test (RED), minimal code (GREEN),
> refactor green.
>
> **Rules before code.** Phase 1 must be green before Phase 2 starts.
>
> **Invariant for the whole feature:** `listRepo.ts`, `localListStore.ts`, `session.ts` and
> everything in `parse/` are **not modified**, and the `ListStore` port keeps its exact shape.
> Private lists move to `lists/` but behave exactly as on `main`; Phase 2 must be mergeable on its
> own with no visible change.

---

## Phase 1: Rules first (Tasks 1-5)

### Task 1: WRITE the `lists` read and create rules + the privacy deny suite
- **RED FIRST** (`tests/rules/firestore.rules.test.ts`), deny cases first and most: a stranger cannot `get` a private list; cannot query `lists` without `array-contains` their own uid; cannot query with someone else's uid; a removed member cannot read; create with a second member already in denied; create as owner for someone else denied; missing `sharing` denied. Then allow: creator alone as `owner` creates and reads.
- **WHY FIRST:** after this feature, this rule is the only thing keeping every private list private (plan R1). Review it on its own before writing any other rule.
- **VALIDATE:** `npm run test:rules`

### Task 2: WRITE the `lists` update and delete rules + tests
- **RED FIRST:** owner and editor content edit (with `updatedBy`), viewer denied; nobody but the owner changes `ownerUid`, roles or other members; caps (200 chars, 500 pairs, 20 members); owner delete, others denied; leave; owner changes a role; owner removes a member; owner hands ownership to a member, not to a stranger.
- **GOTCHA:** A member's `setDoc` on an existing list is **denied** even with valid content, because it rewrites `members`. The adapter relies on that; test it.
- **IMPLEMENT:** the legacy block `users/{uid}/lists`: read and delete only. Update the existing tests that wrote there so they assert the refusal instead (plan R9).
- **VALIDATE:** `npm run test:rules`

### Task 3: WRITE `shareLinks` rules + tests
- **RED FIRST:** `get` allowed signed-out; `list` only by creator with the filter, guest `list` denied; create only by the list owner, `uses == 0`, `maxUses` 1 to 20, role editor or viewer, `createdAt == request.time`; decline only on a live single-use link; `uses` bump alone denied; creator delete, others denied.
- **VALIDATE:** `npm run test:rules`

### Task 4: WRITE the join rule + tests
- **RED FIRST:** join batch allowed; list update alone denied; link bump alone denied; link for another list denied; expired, declined, used-up or deleted link denied; role other than the link's denied; two racing joins on a single-use link: exactly one succeeds; already-member denied; 21st member denied; rejoin after leaving with a new link allowed.
- **GOTCHA:** `getAfter`, not `get`, for the *other* document in the batch. With `get`, every legitimate join is refused.
- **VALIDATE:** `npm run test:rules`

### Task 5: WRITE `listFarewells` rules + tests
- **RED FIRST:** owner creates for a current member in the removal batch; non-owner denied; for a non-member denied; id not `{listId}_{uid}` denied; addressee reads and deletes; anyone else denied.
- **VALIDATE:** `npm run test:rules`

---

## Phase 2: One lists collection, invisible to users (Tasks 6-9)

*Mergeable on its own: at the end of this phase every signed-in user's lists live in `lists/` and
nothing on screen has changed.*

### Task 6: ADD types and pure helpers [P]
- **IMPLEMENT:** `ListRole`, `ListMember`, `ListSharing`, `WordList.sharing?`, `WordList.previousIds?`, `isShared` in `src/state/types.ts`; `listIdsFor` in `src/state/listIds.ts`; `ShareLink`, `Farewell`, `ShareStore` in `src/share/types.ts`; `linkStatus(link, now)`, `shareMessage(link, origin)`, `isEmbeddedBrowser(userAgent)` in `src/share/`.
- **RED FIRST** (`src/state/listIds.test.ts`, `src/share/*.test.ts`): `listIdsFor` with and without `previousIds`; each link status incl. the exact 14-day boundary, with `now` as a parameter (the clock guard in `invariants.test.ts`); the share message text and URL; webview detection over a table of real user agents (Instagram, Facebook, Line, WhatsApp, Safari, Chrome).
- **VALIDATE:** `npm run typecheck && npx vitest run src/share src/state/listIds.test.ts`

### Task 7: SWITCH `firestoreListStore` to `lists/`
- **IMPLEMENT:** plan § Reading and writing lists: one `array-contains` query, client-side sort, new lists created with `sharing` (me as owner), existing lists `updateDoc` only, `removeList` by role.
- **RED FIRST** (`tests/rules/firestoreListStore.test.ts`): a user sees exactly the lists they saw on `main`; a new list lands in `lists/` with me as owner; saving is an `updateDoc` with `updatedBy`; a content save does not undo a concurrent join; 003's device-to-account copy still writes each list once.
- **GOTCHA:** `invariants.test.ts` reads collection paths out of this file; update its expectation in this task, not later.
- **VALIDATE:** `npm run test:rules && npm test`

### Task 8: IMPLEMENT `moveLegacyLists` and the legacy listener
- **IMPLEMENT:** plan § Moving existing lists; run from `useListStore` in the background; `withLegacy` dedupe; `pvt.lists.moved.{uid}` flag.
- **RED FIRST** (`tests/rules/moveLegacyLists.test.ts`): first run moves every list with the same id; re-run is a no-op; interrupted between two lists then re-run finishes; offline then online; a refused copy keeps the legacy doc and reports once; saved tests and session records still resolve; the subscription never emits a set missing a list at any point.
- **VALIDATE:** `npm run test:rules && npm test`

### Task 9: ROUTE history through `listIdsFor`
- **IMPLEMENT:** plan § Kept copies and history: `App`'s per-list practice line, the My practices filter, and `missedWords` for a list use `listIdsFor`. Add the `invariants.test.ts` guard against a bare `r.listId ===` comparison.
- **RED FIRST:** a list with `previousIds` counts drills recorded against those ids, in all three places.
- **GOTCHA:** No existing test may change what it asserts: for every list with no `previousIds`, behaviour is identical.
- **VALIDATE:** `npm test`

---

## Phase 2b: Sharing adapters (Tasks 10-12)

### Task 10: IMPLEMENT `firestoreShareStore.ts`: links and joining
- **IMPLEMENT:** `createLink(list, { role, label, maxUses })`, `subscribeLinks(listId)`, `getLink(code)` (works signed-out), `cancelLink`, `join(code)` (the batch), `decline(code)`.
- **RED FIRST** (`tests/rules/firestoreShareStore.test.ts`, two test users).
- **GOTCHA:** `serverTimestamp()` for `createdAt`, converted to ms on read. `Date.now()` fails `== request.time`.
- **VALIDATE:** `npm run test:rules`

### Task 11: IMPLEMENT `firestoreShareStore.ts`: membership and endings
- **IMPLEMENT:** `setRole`, `removeMember` (with farewell), `leave({ keepCopy })`, `stopSharing`, `deleteForEveryone`, `subscribeFarewells`, `keepCopy(farewell)` (new id, `previousIds`, saved tests re-pointed), `dismiss(farewell)`.
- **RED FIRST:** each against the emulator; a kept copy has the farewell's words, a new id and `previousIds`; stop sharing leaves the owner's list in place with one member and no links.
- **VALIDATE:** `npm run test:rules`

### Task 12: WIRE `useShareStore`
- **IMPLEMENT:** `null` for guests and while resolving; built from the same lazy `loadFirebase()`, tagged by uid (the `useListStore` identity rule). A separate `loadLinkPreview(code)` for the join screen that works signed-out.
- **VALIDATE:** `npm test && npm run build && node scripts/check-bundle.mjs`

---

## Phase 3: QR code (Tasks 13-14)

### Task 13: CHOOSE and wrap the QR encoder
- **IMPLEMENT:** measure `uqr` and `qrcode-generator` gzipped as used; take the smaller if under 10 KB (NFR5), else hand-write a byte-mode encoder for versions 1 to 6. Wrap in `src/share/qr.tsx`: matrix to `<rect>`s, no `innerHTML`.
- **RED FIRST** (`src/share/qr.test.tsx`): a known URL gives the expected module count and finder patterns; the SVG has a white background rect in both themes; it carries an accessible label naming what it links to.
- **VALIDATE:** `npx vitest run src/share && npm run build && node scripts/check-bundle.mjs`

### Task 14: BUILD the full-screen QR view [P]
- **IMPLEMENT:** largest square that fits, minimum 240 px, Wake Lock where available, Close and Copy link on screen.
- **VALIDATE:** `npx vitest run src/components/QrFullScreen.test.tsx`

---

## Phase 4: Owner UI (Tasks 15-17)

### Task 15: BUILD `SharePanel`
- **IMPLEMENT:** role picker (Can edit / Can practise), label, Create link; after create: QR, **Share…** (only when `navigator.canShare`), WhatsApp, Email, Copy link, Show QR code; the "Anyone with this link can join" line; list of links with their statuses, Share again, Cancel link (confirm), New link, Remove. Offline and cap-reached states with the reason on screen.
- **RED FIRST** (`src/components/SharePanel.test.tsx`), fake `ShareStore`, with and without `navigator.share`.
- **VALIDATE:** `npx vitest run src/components/SharePanel.test.tsx`

### Task 16: BUILD `MembersPanel`
- **IMPLEMENT:** everyone: members with picture, name, email, role, "Owner", "You", "joined via"; owner: role picker and Remove (confirm), Stop sharing (confirm, names the count); members: Leave with "keep a copy" choice.
- **VALIDATE:** `npx vitest run src/components/MembersPanel.test.tsx`

### Task 17: ADD entry points and row decoration [P]
- **IMPLEMENT:** Share and Members actions on each `SavedLists` row and in `ListEditor`; Shared badge, up to three avatars + "+N", role chip when not an editor; "Sign in to share" for guests; Delete vs Leave copy by role.
- **VALIDATE:** `npx vitest run src/components/SavedLists.test.tsx src/components/ListEditor.test.tsx`

---

## Phase 5: Joiner UI (Tasks 18-20)

### Task 18: CAPTURE `?join=` and route
- **IMPLEMENT:** `main.tsx` capture to `sessionStorage` + `replaceState`; `appMachine` `join` screen and actions; boot order ahead of welcome and migration.
- **RED FIRST** (`src/state/appMachine.test.ts`, `src/App.join.test.tsx`).
- **VALIDATE:** `npm test`

### Task 19: BUILD `JoinScreen`
- **IMPLEMENT:** states: in-app browser (Open in your browser + Copy link, plan R1); guest (preview + Sign in with Google to join); ready (preview, role line, Join list / No thanks); own link; already a member; unavailable (cancelled, used up); expired.
- **RED FIRST** (`src/components/JoinScreen.test.tsx`).
- **VALIDATE:** `npx vitest run src/components/JoinScreen.test.tsx`

### Task 20: BUILD the farewell banner [P]
- **IMPLEMENT:** on `ListsScreen`, one row per farewell: "{name} stopped sharing / removed you from / deleted "{list}"." Keep a private copy / Dismiss.
- **VALIDATE:** `npx vitest run src/components/ListsScreen.test.tsx`

---

## Phase 6: Living together (Tasks 21-23)

### Task 21: READ-ONLY editor for "Can practise"
- **IMPLEMENT:** plan § Stale-edit detection and read-only editing, first half.
- **VALIDATE:** `npx vitest run src/components/ListEditor.test.tsx`

### Task 22: DETECT stale edits (D-8)
- **RED FIRST:** someone else saved since open → dialog, both choices work; I saved in another tab → no dialog; demoted while editing → the specific message and a keep-a-copy offer.
- **VALIDATE:** `npm test`

### Task 23: HANDLE account deletion (D-13)
- **IMPLEMENT:** plan § Account deletion; the `invariants.test.ts` sibling check over both store files.
- **RED FIRST** (emulator): member leaves; owner with members hands over to the longest-standing editor; lone owner's lists and links deleted; a user who never shared ends with no lists, as on `main`; legacy lists from an unfinished move are deleted too; my links and farewells gone; re-running after a partial failure finishes.
- **VALIDATE:** `npm run test:rules && npm test`

---

## Phase 7: Prose, guards, device pass (Tasks 24-26)

### Task 24: UPDATE docs and privacy note [P]
- **IMPLEMENT:** README "Sharing a list" section, the Accounts table, "How it's built" (the QR encoder as the third runtime dependency, and why); privacy note (members see each other's name, email and picture; anyone with a link sees the list name, word count and your name); `firestore.rules` header comments for the three new collections.
- **VALIDATE:** `npm run lint && npm run typecheck && npm test`

### Task 25: FULL gate
- **VALIDATE:** `npm run lint && npm run typecheck && npm test && npm run test:rules && npm run build && node scripts/check-bundle.mjs`

### Task 26: DEVICE pass (manual)
- **IMPLEMENT:** `firebase deploy --only firestore:rules` and the app **together** (the new build needs the new rules, and the new rules refuse the old build's list writes); check in the Firebase console that your own `users/{uid}/lists` empties after one sign-in; then with two Google accounts: share via WhatsApp (iOS and Android), via email, and by showing the QR in dark mode to another phone's camera; join as a brand-new account; edit on one device, see it on the other; demote, remove, stop sharing, and keep a copy.
- **VALIDATE:** every step above works, and each join lands on the join screen, not on sign-in or home.

---

## Execution status

| | |
|---|---|
| Branch | `claude/list-sharing-feature-872bcu` |
| Done | Tasks 1-25. Task 26 (deploy and the two-phone device pass) is the owner's |
| Unit tests | 1517 pass (1417 on `main`) |
| Emulator tests | 153 pass (72 on `main`): rules, list store, move, release, share store |
| Eager bundle | 93.3 KB gzipped JS (90.1 KB on `main`), budget 150 KB |
| QR encoder | `uqr` 0.1.3, 3.9 KB gzipped, lazy with the sharing screens |
| Invariant | `listRepo.ts`, `localListStore.ts`, `session.ts`, `parse/` byte-identical to `main` |

**Open questions, taken at their recommended defaults:** group links exist (a checkbox, up to
20 people less those already in); the owner can change anyone's role at any time.

**Deviations from the plan as written:**

- **History for kept copies** goes through one `canonicalRecords` call where `App` receives the
  records, instead of `listIdsFor` at each of the four call sites plus a guard. Every screen
  downstream sees the copy's history without knowing copies exist, and there is no second
  route to guard against.
- **Account deletion (Task 23)** landed in Phase 2, not Phase 6. Once lists left `users/{uid}`,
  the old purge no longer reached them, so shipping Phase 2 alone would have stranded every
  deleted account's lists. `releaseAllLists` and its invariant came with the move.
- **The join screen** is an early return in `App`, beside the welcome screen, not an
  `appMachine` screen. It replaces the welcome gate for that visit and the migration prompt lives
  on Home, so the ordering in Story 3 falls out with no reducer change.
- **"Can practise" members** do not get a read-only editor (Task 21): Edit and Rename are simply
  not offered to them, and the Members dialog says how to get an editable copy. Practice mode
  already shows every word.
- **Share entry point** is on the list row (Share for the owner, Members and Leave for others),
  not also inside the editor.
- **The stale-edit question** uses `window.confirm`, like every other confirmation in the app,
  rather than a custom two-button dialog. OK saves over theirs; Cancel reopens the editor with
  their version.
- **Saving before the first snapshot** tries an update and creates on refusal. An update of a
  missing document is refused as permission-denied (the rule reads `resource.data`), not
  not-found, which the plan did not anticipate.

**Still the owner's (Task 26):** `firebase deploy --only firestore:rules` together with the app
(the new rules refuse the old build's list writes); check in the console that
`users/{uid}/lists` empties after one sign-in; then the two-phone pass: share over WhatsApp on
iOS and Android, by email, and by QR in dark mode; join as a brand-new account; edit on one
device and see it on the other; change a role, remove, stop sharing, keep a copy.
