# Tasks: 016-list-sharing

**Baseline:** `main` @ `a45a15d`
**Branch:** `claude/list-sharing-feature-872bcu`
**Total:** 24 tasks across 8 phases
**Legend:** `[P]` = parallelisable with its siblings · every task ends in a runnable VALIDATE

> **TDD is mandatory**, as in every spec before this one. Failing test (RED), minimal code (GREEN),
> refactor green.
>
> **Rules before code.** Phase 1 must be green before Phase 2 starts. The rules are the only
> server-side check this app has; a client written against rules that later change is a client
> written twice.
>
> **Invariant for the whole feature:** `listRepo.ts`, `localListStore.ts`, `session.ts`,
> everything in `parse/` and the `users/{uid}/lists` rule block are **not modified**. Private lists
> must behave exactly as on `main`.

---

## Phase 0: Owner setup, outside the repo (Tasks 1–2)

*Nothing here blocks Phases 1–6. The feature builds and tests with `VITE_INVITE_EMAIL=mailto`.*

### Task 1: SET UP the email provider (manual)
- **IMPLEMENT:** Create a Resend account, add and verify a sending domain (SPF + DKIM DNS records), create an API key scoped to sending.
- **GOTCHA:** Sending from an unverified domain or a free-mail address lands in spam or is refused outright.
- **VALIDATE:** Resend's dashboard shows the domain verified; a test email from its console arrives in an inbox, not spam.

### Task 2: SET the Worker secrets (manual)
- **IMPLEMENT:** `wrangler secret put RESEND_API_KEY`; set `FIREBASE_PROJECT_ID` and `INVITE_FROM` as vars on the Cloudflare dashboard.
- **VALIDATE:** `wrangler secret list` shows `RESEND_API_KEY`.

---

## Phase 1: Rules first (Tasks 3–6)

### Task 3: SPIKE the invite list-query rule (plan R1)
- **IMPLEMENT:** In the emulator, a throwaway rule and test: can a member run `where('listId','==',X)` on `invites` when `allow list` depends on `get(sharedLists/resource.data.listId)`?
- **WHY:** The answer decides whether invites carry a denormalised `memberUids`. Answer it before writing anything that depends on it.
- **VALIDATE:** A recorded yes/no in this file under § Execution status, with the test that proves it. Update plan.md § Rules if no.

### Task 4: WRITE `sharedLists` rules + tests
- **RED FIRST** (`tests/rules/firestore.rules.test.ts`): create by owner only and alone; member reads, non-member denied; member content edit allowed, with `updatedBy` required; member cannot touch `ownerUid`, `memberUids`, `members`; caps (200 / 500 / 10 members); owner delete, member delete denied; leave; owner removes member; owner hands ownership to a member, not to a stranger.
- **GOTCHA:** Test `setDoc` on an existing shared doc by a member is **denied** even with valid content, since it would rewrite `members`. The adapter relies on that.
- **VALIDATE:** `npm run test:rules`

### Task 5: WRITE `invites` rules + tests
- **RED FIRST:** create only by the list's owner (including via `getAfter` inside the first-share batch); create to own email denied; invitee `get` by verified email; unverified email denied; stranger denied; invitee accept/decline once, before 14 days; accept after 14 days denied; invitee cannot edit `emailCount`; owner throttle (10 min, 4 total); owner delete (cancel); invitee delete denied.
- **VALIDATE:** `npm run test:rules`

### Task 6: WRITE the join rule + tests
- **RED FIRST:** batch (invite → accepted, list add me) allowed; list add without the invite update denied; invite for another email denied; invite for another list denied; adding a second uid denied; re-join after leaving with a fresh invite allowed; already-member join denied.
- **GOTCHA:** `getAfter`, not `get`. With `get` the invite is still `pending` when the rule runs and every legitimate join is refused.
- **VALIDATE:** `npm run test:rules`

---

## Phase 2: Types and adapters (Tasks 7–10)

### Task 7: ADD types [P]
- **IMPLEMENT:** `ListMember`, `ListSharing`, `WordList.sharing?` in `src/state/types.ts`; `Invite`, `InviteStatus`, `ShareStore` in `src/share/types.ts`; `displayStatus(invite, now)` in `src/share/inviteStatus.ts` (pure).
- **RED FIRST** (`src/share/inviteStatus.test.ts`): each of the four displayed statuses, including the exact 14-day boundary, with `now` as a parameter (the clock guard in `invariants.test.ts`).
- **VALIDATE:** `npm run typecheck && npx vitest run src/share`

### Task 8: MERGE shared lists into `subscribeLists`
- **IMPLEMENT:** plan § Merging. Two listeners, emit once both answered, dedupe by id with shared winning, sort by `updatedAt`. Route `saveList` / `renameList` / `removeList` by the live shared-id set.
- **RED FIRST** (`tests/rules/firestoreListStore.test.ts`): private-only user sees exactly what `main` shows; member sees private + shared, sorted; saving a shared list uses `updateDoc` and sets `updatedBy`; a concurrent join is not undone by a content save.
- **VALIDATE:** `npm run test:rules && npm test`

### Task 9: IMPLEMENT `firestoreShareStore.ts`
- **IMPLEMENT:** `shareList(list, email)` (first-share batch or invite-only), `subscribeInvitesForList`, `subscribeMyInvites`, `getInvite`, `cancelInvite`, `acceptInvite` (the batch), `declineInvite`, `leaveList`, `removeMember`, `reinvite`.
- **RED FIRST** (`tests/rules/firestoreShareStore.test.ts`): each method against the emulator with two signed-in test users; the first-share move is never observed as "list missing" by the owner's merged subscription.
- **GOTCHA:** `serverTimestamp()` for `createdAt` / `lastEmailAt`, converted to ms on read. A `Date.now()` value fails the `== request.time` rule.
- **VALIDATE:** `npm run test:rules`

### Task 10: WIRE `useShareStore`
- **IMPLEMENT:** returns `null` for guests and while resolving; built from the same lazy `loadFirebase()` as the list store, tagged by uid the same way (`useListStore`'s identity-tag rule).
- **VALIDATE:** `npm test && npm run build && node scripts/check-bundle.mjs`

---

## Phase 3: The Worker (Tasks 11–13)

### Task 11: ADD the Worker entry [P]
- **IMPLEMENT:** `worker/index.ts`, `wrangler.jsonc` `main` + `assets.run_worker_first: ["/api/*"]`, `worker/tsconfig.json`, `.dev.vars` in `.gitignore`.
- **GOTCHA:** Keep `not_found_handling: "single-page-application"`. The invite link depends on `/?invite=` serving `index.html`.
- **VALIDATE:** `npx wrangler dev` serves the app unchanged, and `POST /api/ping` answers.

### Task 12: VERIFY Firebase ID tokens
- **RED FIRST** (`worker/verifyToken.test.ts`): valid; expired; wrong `aud`; wrong `iss`; bad signature; unknown `kid`; JWKs cached.
- **VALIDATE:** `npx vitest run worker`

### Task 13: IMPLEMENT `POST /api/invites/:id/send`
- **IMPLEMENT:** plan § Email, steps 1–5; Resend call; escaped template; daily per-uid rate-limit binding.
- **RED FIRST** (`worker/sendInvite.test.ts`): not my invite → 403; not pending → 409; throttle PATCH 403 → 429; provider 5xx → 502 and `emailError` written; `<script>` in list name arrives escaped.
- **VALIDATE:** `npx vitest run worker`

---

## Phase 4: Owner UI (Tasks 14–16)

### Task 14: BUILD `SharePanel`
- **IMPLEMENT:** email field, Send invite, members section, invites section with the four statuses, Cancel (confirm), Resend (disabled with the reason when throttled), Invite again, Remove member (confirm). Offline and 10-person-cap disabled states with the reason on screen.
- **RED FIRST** (`src/components/SharePanel.test.tsx`) against a fake `ShareStore`.
- **VALIDATE:** `npx vitest run src/components/SharePanel.test.tsx`

### Task 15: ADD the Share entry points [P]
- **IMPLEMENT:** Share action on each `SavedLists` row and in `ListEditor`; "Sign in to share" for guests.
- **VALIDATE:** `npx vitest run src/components/SavedLists.test.tsx src/components/ListEditor.test.tsx`

### Task 16: CALL the Worker, with the `mailto` fallback
- **IMPLEMENT:** `src/share/sendInviteEmail.ts`: `getIdToken()` → `fetch('/api/invites/:id/send')`; on `VITE_INVITE_EMAIL=mailto`, open a `mailto:` link instead.
- **VALIDATE:** `npm test`

---

## Phase 5: Invitee UI (Tasks 17–19)

### Task 17: CAPTURE `?invite=` and route
- **IMPLEMENT:** `main.tsx` capture to `sessionStorage` + `replaceState`; `appMachine` `invitation` screen and actions; boot order ahead of welcome and migration.
- **RED FIRST** (`src/state/appMachine.test.ts`, `src/App.invite.test.tsx`).
- **VALIDATE:** `npm test`

### Task 18: BUILD `InvitationScreen`
- **IMPLEMENT:** five states: signed out (Sign in with Google to join), ready (preview, Join, Decline), wrong account (both addresses, Switch account), unavailable (cancelled / not found), expired.
- **RED FIRST** (`src/components/InvitationScreen.test.tsx`).
- **VALIDATE:** `npx vitest run src/components/InvitationScreen.test.tsx`

### Task 19: ADD the pending-invites banner [P]
- **IMPLEMENT:** on `ListsScreen`, from `subscribeMyInvites`, each opening the invitation screen.
- **VALIDATE:** `npx vitest run src/components/ListsScreen.test.tsx`

---

## Phase 6: Living together (Tasks 20–22)

### Task 20: SHOW shared state on lists
- **IMPLEMENT:** Shared badge, up to three avatars + "+N" on the row; Members panel for non-owners with Leave; Delete vs Leave copy by role.
- **VALIDATE:** `npm test`

### Task 21: DETECT stale edits (D-6)
- **IMPLEMENT:** plan § Stale-edit detection.
- **RED FIRST:** someone else saved since open → dialog, both choices; I saved in another tab → no dialog.
- **VALIDATE:** `npm test`

### Task 22: HANDLE account deletion (D-11)
- **IMPLEMENT:** plan § Account deletion; extend `invariants.test.ts` so a top-level collection in `firestoreShareStore.ts` that `deleteAccount.ts` does not handle fails the build.
- **RED FIRST** (emulator): member leaves; owner with members hands over to earliest joiner; lone owner deletes list and invites; my invites gone; re-running after a partial failure finishes.
- **VALIDATE:** `npm run test:rules && npm test`

---

## Phase 7: Guards, prose, deploy (Tasks 23–24)

### Task 23: UPDATE docs and privacy note
- **IMPLEMENT:** README (a "Sharing a list" section, the Accounts table, "How it's built" on the Worker); privacy note copy (who sees your name/email/picture; invitee email passed to the email provider); `firestore.rules` header comment on the two new collections.
- **VALIDATE:** `npm run lint && npm run typecheck && npm test && npm run build && node scripts/check-bundle.mjs`

### Task 24: DEPLOY (manual, owner)
- **IMPLEMENT:** `firebase deploy --only firestore:rules`; set `VITE_INVITE_EMAIL=worker` in the Cloudflare build env; deploy the Worker; send one real invite end to end between two Google accounts.
- **VALIDATE:** the invitee joins from the email on a phone; both see each other under Members; an edit on one device appears on the other.

---

## Execution status

*Not started.*
