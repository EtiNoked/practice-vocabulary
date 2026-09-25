# Tasks: 016-list-sharing

**Baseline:** `main` @ `a45a15d`
**Branch:** `claude/list-sharing-feature-872bcu`
**Total:** 23 tasks across 7 phases (revision 2: no Worker, no email provider, no manual setup)
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD is mandatory**, as in every spec before this one. Failing test (RED), minimal code (GREEN),
> refactor green.
>
> **Rules before code.** Phase 1 must be green before Phase 2 starts.
>
> **Invariant for the whole feature:** `listRepo.ts`, `localListStore.ts`, `session.ts`,
> everything in `parse/` and the `users/{uid}/lists` rule block are **not modified**. Private lists
> behave exactly as on `main`.

---

## Phase 1: Rules first (Tasks 1-4)

### Task 1: WRITE `sharedLists` rules + tests
- **RED FIRST** (`tests/rules/firestore.rules.test.ts`): create by owner, alone, as `owner`; member read, non-member denied; owner and editor content edit (with `updatedBy`), viewer denied; nobody but the owner changes `ownerUid`, roles or other members; caps (200 chars, 500 pairs, 20 members); owner delete, others denied; leave; owner changes a role; owner removes a member.
- **GOTCHA:** A member's `setDoc` on an existing shared list is **denied** even with valid content, because it rewrites `members`. The adapter relies on that; test it.
- **VALIDATE:** `npm run test:rules`

### Task 2: WRITE `shareLinks` rules + tests
- **RED FIRST:** `get` allowed signed-out; `list` only by creator with the filter, guest `list` denied; create only by the list owner (including via `getAfter` in the first-link batch), `uses == 0`, `maxUses` 1 to 20, role editor or viewer, `createdAt == request.time`; decline only on a live single-use link; `uses` bump alone denied; creator delete, others denied.
- **VALIDATE:** `npm run test:rules`

### Task 3: WRITE the join rule + tests
- **RED FIRST:** join batch allowed; list update alone denied; link bump alone denied; link for another list denied; expired, declined, used-up or deleted link denied; role other than the link's denied; two racing joins on a single-use link: exactly one succeeds; already-member denied; 21st member denied; rejoin after leaving with a new link allowed.
- **GOTCHA:** `getAfter`, not `get`, for the *other* document in the batch. With `get`, every legitimate join is refused.
- **VALIDATE:** `npm run test:rules`

### Task 4: WRITE `listFarewells` rules + tests
- **RED FIRST:** owner creates for a current member in the removal batch; non-owner denied; for a non-member denied; id not `{listId}_{uid}` denied; addressee reads and deletes; anyone else denied.
- **VALIDATE:** `npm run test:rules`

---

## Phase 2: Types and adapters (Tasks 5-9)

### Task 5: ADD types and pure helpers [P]
- **IMPLEMENT:** `ListRole`, `ListMember`, `ListSharing`, `WordList.sharing?` in `src/state/types.ts`; `ShareLink`, `Farewell`, `ShareStore` in `src/share/types.ts`; `linkStatus(link, now)`, `shareMessage(link, origin)`, `isEmbeddedBrowser(userAgent)` in `src/share/`.
- **RED FIRST** (`src/share/*.test.ts`): each link status incl. the exact 14-day boundary, with `now` as a parameter (the clock guard in `invariants.test.ts`); the share message text and URL; webview detection over a table of real user agents (Instagram, Facebook, Line, WhatsApp, Safari, Chrome).
- **VALIDATE:** `npm run typecheck && npx vitest run src/share`

### Task 6: MERGE shared lists into `subscribeLists`
- **IMPLEMENT:** plan § Merging.
- **RED FIRST** (`tests/rules/firestoreListStore.test.ts`): a user with no shared lists sees exactly what `main` shows; a member sees private + shared, sorted; saving a shared list is an `updateDoc` with `updatedBy`; a concurrent join is not undone by a content save.
- **VALIDATE:** `npm run test:rules && npm test`

### Task 7: IMPLEMENT `firestoreShareStore.ts`: sharing and joining
- **IMPLEMENT:** `createLink(list, { role, label, maxUses })` (first-link move or link only), `subscribeLinks(listId)`, `getLink(code)` (works signed-out), `cancelLink`, `join(code)` (the batch, re-keying a same-id private copy first), `decline(code)`.
- **RED FIRST** (`tests/rules/firestoreShareStore.test.ts`, two test users): the owner's merged subscription never emits a list set missing the list during the move.
- **GOTCHA:** `serverTimestamp()` for `createdAt`, converted to ms on read. `Date.now()` fails `== request.time`.
- **VALIDATE:** `npm run test:rules`

### Task 8: IMPLEMENT `firestoreShareStore.ts`: membership and endings
- **IMPLEMENT:** `setRole`, `removeMember` (with farewell), `leave({ keepCopy })`, `stopSharing`, `deleteForEveryone`, `subscribeFarewells`, `keepCopy(farewell)`, `dismiss(farewell)`.
- **RED FIRST:** each against the emulator; a kept copy has the farewell's words and the original id; stop sharing leaves the owner a private list with the same id and no links.
- **VALIDATE:** `npm run test:rules`

### Task 9: WIRE `useShareStore`
- **IMPLEMENT:** `null` for guests and while resolving; built from the same lazy `loadFirebase()`, tagged by uid (the `useListStore` identity rule). A separate `loadLinkPreview(code)` for the join screen that works signed-out.
- **VALIDATE:** `npm test && npm run build && node scripts/check-bundle.mjs`

---

## Phase 3: QR code (Tasks 10-11)

### Task 10: CHOOSE and wrap the QR encoder
- **IMPLEMENT:** measure `uqr` and `qrcode-generator` gzipped as used; take the smaller if under 10 KB (NFR5), else hand-write a byte-mode encoder for versions 1 to 6. Wrap in `src/share/qr.tsx`: matrix to `<rect>`s, no `innerHTML`.
- **RED FIRST** (`src/share/qr.test.tsx`): a known URL gives the expected module count and finder patterns; the SVG has a white background rect in both themes; it carries an accessible label naming what it links to.
- **VALIDATE:** `npx vitest run src/share && npm run build && node scripts/check-bundle.mjs`

### Task 11: BUILD the full-screen QR view [P]
- **IMPLEMENT:** largest square that fits, minimum 240 px, Wake Lock where available, Close and Copy link on screen.
- **VALIDATE:** `npx vitest run src/components/QrFullScreen.test.tsx`

---

## Phase 4: Owner UI (Tasks 12-14)

### Task 12: BUILD `SharePanel`
- **IMPLEMENT:** role picker (Can edit / Can practise), label, Create link; after create: QR, **Share…** (only when `navigator.canShare`), WhatsApp, Email, Copy link, Show QR code; the "Anyone with this link can join" line; list of links with their statuses, Share again, Cancel link (confirm), New link, Remove. Offline and cap-reached states with the reason on screen.
- **RED FIRST** (`src/components/SharePanel.test.tsx`), fake `ShareStore`, with and without `navigator.share`.
- **VALIDATE:** `npx vitest run src/components/SharePanel.test.tsx`

### Task 13: BUILD `MembersPanel`
- **IMPLEMENT:** everyone: members with picture, name, email, role, "Owner", "You", "joined via"; owner: role picker and Remove (confirm), Stop sharing (confirm, names the count); members: Leave with "keep a copy" choice.
- **VALIDATE:** `npx vitest run src/components/MembersPanel.test.tsx`

### Task 14: ADD entry points and row decoration [P]
- **IMPLEMENT:** Share and Members actions on each `SavedLists` row and in `ListEditor`; Shared badge, up to three avatars + "+N", role chip when not an editor; "Sign in to share" for guests; Delete vs Leave copy by role.
- **VALIDATE:** `npx vitest run src/components/SavedLists.test.tsx src/components/ListEditor.test.tsx`

---

## Phase 5: Joiner UI (Tasks 15-17)

### Task 15: CAPTURE `?join=` and route
- **IMPLEMENT:** `main.tsx` capture to `sessionStorage` + `replaceState`; `appMachine` `join` screen and actions; boot order ahead of welcome and migration.
- **RED FIRST** (`src/state/appMachine.test.ts`, `src/App.join.test.tsx`).
- **VALIDATE:** `npm test`

### Task 16: BUILD `JoinScreen`
- **IMPLEMENT:** states: in-app browser (Open in your browser + Copy link, plan R1); guest (preview + Sign in with Google to join); ready (preview, role line, Join list / No thanks); own link; already a member; unavailable (cancelled, used up); expired.
- **RED FIRST** (`src/components/JoinScreen.test.tsx`).
- **VALIDATE:** `npx vitest run src/components/JoinScreen.test.tsx`

### Task 17: BUILD the farewell banner [P]
- **IMPLEMENT:** on `ListsScreen`, one row per farewell: "{name} stopped sharing / removed you from / deleted "{list}"." Keep a private copy / Dismiss.
- **VALIDATE:** `npx vitest run src/components/ListsScreen.test.tsx`

---

## Phase 6: Living together (Tasks 18-20)

### Task 18: READ-ONLY editor for "Can practise"
- **IMPLEMENT:** plan § Stale-edit detection and read-only editing, first half.
- **VALIDATE:** `npx vitest run src/components/ListEditor.test.tsx`

### Task 19: DETECT stale edits (D-8)
- **RED FIRST:** someone else saved since open → dialog, both choices work; I saved in another tab → no dialog; demoted while editing → the specific message and a keep-a-copy offer.
- **VALIDATE:** `npm test`

### Task 20: HANDLE account deletion (D-13)
- **IMPLEMENT:** plan § Account deletion; the `invariants.test.ts` sibling check.
- **RED FIRST** (emulator): member leaves; owner with members hands over to the longest-standing editor; lone owner's list and links deleted; my links and farewells gone; re-running after a partial failure finishes.
- **VALIDATE:** `npm run test:rules && npm test`

---

## Phase 7: Prose, guards, device pass (Tasks 21-23)

### Task 21: UPDATE docs and privacy note [P]
- **IMPLEMENT:** README "Sharing a list" section, the Accounts table, "How it's built" (the QR encoder as the third runtime dependency, and why); privacy note (members see each other's name, email and picture; anyone with a link sees the list name, word count and your name); `firestore.rules` header comments for the three new collections.
- **VALIDATE:** `npm run lint && npm run typecheck && npm test`

### Task 22: FULL gate
- **VALIDATE:** `npm run lint && npm run typecheck && npm test && npm run test:rules && npm run build && node scripts/check-bundle.mjs`

### Task 23: DEVICE pass (manual)
- **IMPLEMENT:** `firebase deploy --only firestore:rules`, deploy; then with two Google accounts: share via WhatsApp (iOS and Android), via email, and by showing the QR in dark mode to another phone's camera; join as a brand-new account; edit on one device, see it on the other; demote, remove, stop sharing, and keep a copy.
- **VALIDATE:** every step above works, and each join lands on the join screen, not on sign-in or home.

---

## Execution status

*Not started.*
