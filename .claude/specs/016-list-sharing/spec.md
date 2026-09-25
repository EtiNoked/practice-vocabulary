# Spec: Sharing a list with someone else

**ID:** 016-list-sharing
**Status:** DRAFT, awaiting answers to the three open questions at the end
**Created:** 2026-09-25
**Baseline:** `main` @ `a45a15d`
**Feature Type:** New capability. New stored data, new security rules, and the app's first server-side code
**Complexity:** High. The UI is moderate; the risk is in the rules, the data move, and email delivery
**Depends on:** `003-user-accounts` (shipped). Sharing is a signed-in feature.
**Branch:** `claude/list-sharing-feature-872bcu`

---

## The ask

> "I want to add an option to share a list. When the list is shared, we send an email to the
> recipient, and ask if they want to join the list (or to create account and then accept the list).
> For the user that shares, he can see statuses: invite sent, and have an option to cancel
> invitation. After the accept, both users can edit and use the same list. Both see the members of
> the list."

Five things: **invite by email**, **accept (signing up first if needed)**, **invite status and
cancel for the sharer**, **one list, jointly edited and used**, and **a visible member list**.

---

## Where the app actually is

Three facts found while reading, and all three change what this feature costs.

**Every list is private by construction.** Lists live at `users/{uid}/lists/{listId}` and the rules
grant access with a single `isOwner(uid)` check. 003 A2 says so explicitly: *"No sharing, no
collaboration, no public lists. Per-user isolation is the simplest possible security model."* A list
two people can edit cannot live under one person's uid, so this feature needs a **second home for
lists** and a second, membership-based rule. That reverses 003 A2 and is recorded below.

**The app cannot send an email today, and its own spec forbids the obvious way.** There is no
backend. 003 NFR6 reads *"Free tier only. The design must not require Cloud Functions or any paid
plan."* Firebase's email extension runs on Cloud Functions, which need the paid Blaze plan. The app
is, however, already deployed as a **Cloudflare Worker** (`wrangler.jsonc`), currently assets-only.
Giving that Worker one small script is the free-tier route to sending mail (plan.md § Email).

**A list id is already a stable, global uuid.** It is the Firestore document id, saved tests store
it in `spec.listIds`, and session records store it in `listId`. So a list can **move** from the
private collection to a shared one without breaking a single saved test or history record, as long
as the id is kept. That is what makes the data move cheap.

---

## ⚠️ This feature reverses earlier decisions

| Earlier decision | Wording | After 016 |
|---|---|---|
| 003 A2 | "A signed-in user's data is private to them. No sharing, no collaboration" | **Amended.** Private lists stay private. A list the owner chooses to share is readable and writable by its members, enforced by the rules. |
| 003 A4 | "Concurrent editing of the same list on two devices at once is rare" | **Amended for shared lists.** Two people editing one list is the point. Last-write-wins stays, but a stale edit is now detected and the user is asked (D-6). |
| 003 NFR1a | "No self-hosted backend and no secret credentials in the repo" | **Amended.** One Worker route holds one secret (the email provider key) as a Cloudflare secret. Still nothing secret in the repo. Still no server holding user data. |
| 003 NFR2b | "A signed-in user's data is readable and writable only by that user" | **Amended.** True for everything except shared lists and invites, which are readable by their members and addressee. |
| 003 Story 8 | Privacy note lists name, email, lists, scores | **Extended.** Members of a shared list see each other's name, email and picture; an invitee's email address is stored and passed to an email provider. |

003 NFR6 (free tier, no Cloud Functions) **survives intact**, and is the reason for D-1.

---

## Decisions taken

Numbered so the plan and the tasks can cite them instead of re-arguing them. The three marked
**(open)** are recommendations waiting for the owner's answer; see § Questions.

**D-1 (open). Email goes out from the existing Cloudflare Worker, through a transactional email
provider (Resend).** Free tier on both sides (Workers: 100k requests/day; Resend: 3,000 emails/month),
no Cloud Functions, and the key lives in a Worker secret. Rejected: the Firebase "Trigger Email"
extension (needs Blaze, breaks NFR6); `mailto:` from the sharer's own mail client (works with no
backend, but "we send an email" becomes "you send an email", and nothing can report it as sent).
`mailto:` is kept as the fallback if the owner declines a provider.

**D-2 (open). An invite is bound to an email address, and only a Google account with that exact
verified address can accept it.** The link alone is not enough. Safer, because a forwarded email
cannot hand the list to a stranger; the cost is a person whose Google account uses a different
address than the one the sharer typed. They get a clear message naming both addresses (Story 4).

**D-3 (open). Two roles: owner and member.** Every member can edit and practise the list and see
the members. Only the **owner** (whoever shared it first) can invite, cancel an invite, remove a
member, or delete the list for everyone. A member can **leave**. Keeps the answer to "who can do
what" one sentence long; the alternative, any member may invite, is a small rules change later.

**D-4. A shared list lives at `sharedLists/{listId}`, keeping its id, and moves there on its first
invite.** Not on accept: the invite has to point at a list the invitee can join, and the owner's
view must not change shape twice. The move is one batch (create shared, delete private, create
invite), so there is no moment where the list exists twice or not at all.

**D-5. Practice history stays per person.** Each member's drills are written to their own
`users/{uid}/sessions`, exactly as now. Both people use the same words; neither sees the other's
scores. A shared score history is a separate feature with its own privacy question.

**D-6. Concurrent edits: last write wins, but a stale write is caught.** The editor remembers the
list's `updatedAt` when it opened. If the live list has moved on by the time Save is pressed, the
user is told who changed it and chooses **Keep theirs** or **Save mine anyway**. No merging, no
CRDT; a word list is small and the choice is legible.

**D-7. Invites expire after 14 days.** Enforced by the rules on accept, not by a cleanup job (there
is nowhere to run one). An expired invite shows as **Expired** to the owner, with **Invite again**.

**D-8. Cancelling an invite deletes it.** The link then says *"This invitation is no longer
available"*. A declined invite is kept, so the owner sees **Declined**.

**D-9. At most 10 people per list, members and pending invites together.** A blast-radius cap like
every other cap in `firestore.rules`, and a spam cap, since each invite sends an email.

**D-10. Sharing needs an account; accepting needs one too.** A guest sees **Share** as
*"Sign in to share"*. An invite link opened signed-out shows who invited them and a **Sign in with
Google to join** button. For a new person that sign-in *is* account creation, so "create an
account, then accept" is one tap, not two flows.

**D-11. The owner deleting their account does not delete the list from under its members.**
Ownership passes to the longest-standing member. Only a list with no other members is deleted.

---

## User Stories

### Story 1: Invite someone to a list
**As a** student with a good word list
**I want** to share it with a friend by typing their email
**So that** we can practise the same words

**Acceptance Criteria:**
- [ ] Each of my lists, while signed in, has a **Share** action (list row menu and list editor)
- [ ] Share opens a panel: an email field, **Send invite**, and the list's current members and invites
- [ ] Sending validates the address, refuses my own address, and refuses an address already a member or already pending
- [ ] On success the invite appears at once as **Invite sent · just now**
- [ ] The recipient receives an email naming me, the list, its size and languages, with one **Join the list** button
- [ ] If the email could not be sent, the invite shows **Email not sent** with **Try again**, and the invite itself still exists
- [ ] Offline, **Send invite** is disabled with the reason on screen
- [ ] Signed out, Share reads **Sign in to share** and leads to sign-in

### Story 2: See and manage my invites
**As the** person who shared a list
**I want** to see what happened to each invite
**So that** I know who has joined and can take an invite back

**Acceptance Criteria:**
- [ ] Each invite shows its address and one status: **Invite sent** (with when), **Email not sent**, **Declined**, **Expired**
- [ ] A pending invite has **Cancel invitation** and **Resend**
- [ ] Cancel asks for confirmation, then removes the invite; the link stops working
- [ ] Resend is limited (once per 10 minutes, 3 times per invite) and says so when unavailable
- [ ] A **Declined** or **Expired** invite has **Invite again** and **Remove**
- [ ] When the recipient accepts, the invite disappears from the list and they appear under **Members**
- [ ] Status updates live, without reopening the panel

### Story 3: Accept an invite (with or without an account)
**As** someone who received an invite
**I want** to join the list from the email
**So that** I get the list without retyping it

**Acceptance Criteria:**
- [ ] The email's button opens the app on an **invitation screen**, not the home screen
- [ ] Signed out: the screen says I've been invited to a shared list and offers **Sign in with Google to join**; after signing in (creating my account if I had none) I land back on the invitation
- [ ] Signed in: I see who invited me, the list name, word count and languages, and **Join list** / **Decline**
- [ ] **Join list** adds me as a member and opens **My lists** with the list there, marked shared
- [ ] **Decline** tells the owner and returns me home; nothing is added
- [ ] The first-sign-in "copy this device's lists" prompt (003 Story 3) still appears, **after** the invitation, never on top of it
- [ ] An invite that was cancelled, expired or already used says so plainly, with a way home
- [ ] Pending invites also appear on **My lists** as a banner, so a lost email does not lose the invite

### Story 4: The wrong Google account
**As an** invitee whose Google account uses another address
**I want** to be told why I cannot accept
**So that** I am not stuck guessing

**Acceptance Criteria:**
- [ ] The invitation screen names both addresses: *"This invite was sent to a@x.com. You're signed in as b@y.com."*
- [ ] It offers **Switch account** (sign out and sign in again) and explains that the sharer can invite b@y.com instead
- [ ] No list data is shown to the wrong account

### Story 5: Use and edit the list together
**As a** member of a shared list
**I want** to edit and practise it like any of my own
**So that** sharing costs nothing in daily use

**Acceptance Criteria:**
- [ ] A shared list appears in **My lists** beside my private lists, with a **Shared** badge and member avatars
- [ ] Any member can edit words, rename it, change languages, practise it, test on it, and include it in saved tests and games
- [ ] An edit by one member appears for the others without a refresh
- [ ] If someone else saved the list since I opened the editor, Save warns me, names them, and lets me keep theirs or save mine (D-6)
- [ ] A drill in progress is unaffected by another member's edit (the existing snapshot rule)
- [ ] My practice history for the list is mine; the "5 practices · last 80%" line counts only my drills (D-5)

### Story 6: See who is in the list
**As a** member (owner or not)
**I want** to see who shares this list
**So that** I know who can see and change it

**Acceptance Criteria:**
- [ ] The Share panel (for the owner) and a **Members** panel (for everyone) list each member's picture, name and email, with **Owner** and **You** marked
- [ ] Members also see pending invites, as addresses only, without the owner's controls
- [ ] The list row shows up to three avatars and "+N"

### Story 7: Leave, remove, delete
**As a** member or owner
**I want** to get out of a shared list, or take someone out of it
**So that** sharing is never a one-way door

**Acceptance Criteria:**
- [ ] A member has **Leave list**; after confirming, the list disappears from their lists and they from the members
- [ ] The owner has **Remove** beside each member, with confirmation
- [ ] The owner's **Delete** on a shared list says it deletes it for everyone and names how many people; a member sees **Leave** where Delete would be
- [ ] A member's saved tests that used a list they left behave exactly as 011 already does for a deleted list
- [ ] Deleting my account: I leave every list I'm a member of; lists I own pass to the longest-standing member, or are deleted if I'm alone (D-11); my pending invites are removed

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `sharedLists/{listId}` collection with owner, member uids and a member profile map | HIGH |
| FR2 | `invites/{inviteId}` collection with a random id, addressee email, status and denormalised preview | HIGH |
| FR3 | Rules: members read and edit content; only the owner changes membership (except join and leave) | HIGH |
| FR4 | Rules: join is only possible with an accepted, unexpired invite addressed to the caller's verified email | HIGH |
| FR5 | First invite moves the list from private to shared in one batch, keeping its id | HIGH |
| FR6 | `subscribeLists` returns private and shared lists as one sorted array | HIGH |
| FR7 | Worker route `POST /api/invites/:id/send` verifies the caller, checks the invite, sends one email | HIGH |
| FR8 | Resend throttle enforced by the rules, not only the Worker | MEDIUM |
| FR9 | Invitation screen reachable by `?invite=<id>`, surviving sign-in | HIGH |
| FR10 | Owner view: invite statuses, cancel, resend, invite again, remove member | HIGH |
| FR11 | Member view: members, pending invites, leave | HIGH |
| FR12 | Stale-edit detection on save for shared lists | MEDIUM |
| FR13 | Account deletion handles shared lists and invites (D-11) | HIGH |
| FR14 | Pending-invite banner on My lists | MEDIUM |
| FR15 | Privacy note and README updated | MEDIUM |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | Free tier only (003 NFR6 unchanged). No Cloud Functions. |
| NFR2 | Signed-out bundle budget unchanged: all sharing code is in the lazy Firebase chunk or its own lazy chunk. `check-bundle.mjs` still passes. |
| NFR3 | Every new rule has an allow **and** a deny test (the rule stated at the top of `firestore.rules`). |
| NFR4 | Private lists behave exactly as today. `listRepo.ts`, `localListStore.ts`, `session.ts` and `parse/` are not modified. |
| NFR5 | The email provider key never reaches the client or the repo. |
| NFR6 | The Worker holds no user data; every read and write it makes uses the caller's own ID token, so the rules still decide. |
| NFR7 | No new runtime dependency in the client. The Worker may use one small JWT library if WebCrypto alone proves awkward. |

## Edge Cases

| Case | Expected behaviour |
|------|-------------------|
| Invite to an address that already has a pending invite for this list | Refused client-side: "Already invited" with Resend |
| Invite to my own address | Refused: "That's you" |
| Owner edits the list while an invite is pending | Fine; the invite points at the list, the preview on the invite is refreshed on resend |
| Owner cancels while the invitee has the invite screen open | Join fails; screen says the invite is no longer available |
| Invitee accepts twice (two tabs) | Second accept is a no-op; both tabs show the list |
| Invitee is already a member (re-invited after leaving) | Allowed; joining re-adds them |
| Owner deletes the list with a pending invite | Batch deletes the list and its invites; the link says no longer available |
| Member removed while editing | Save fails with permission; message says they were removed from the list |
| Member offline edits, then is removed before reconnecting | Queued write rejected on reconnect; the toast explains it; nothing else lost |
| Owner offline when trying to share | Share disabled: invites need a connection (the email cannot queue) |
| Email bounces | Not detectable on the free tier without webhooks; the invite stays **Invite sent**. Documented, not solved |
| Two members save within the same second | D-6 catches the later one if its editor opened before the earlier save landed |
| 10-person cap reached | Send invite disabled with the reason |
| Shared list's name or pairs exceed caps | Same caps as private lists (200 chars, 500 pairs) |

---

## Out of scope

- Sharing with a guest (no account), or by public link without an addressee
- Read-only members / roles beyond owner and member
- A shared practice history or leaderboard
- Sharing saved tests or games
- Push or in-app notifications beyond the pending-invite banner
- Transfer of ownership by choice (it happens only on account deletion, D-11)
- Email bounce handling

---

## Questions for the owner

These change the plan if answered differently; everything else has a safe default.

1. **Email transport (D-1).** OK to add a Resend account (free, needs a domain you control to send
   from) and a script to the Cloudflare Worker? Or should v1 open the sharer's own mail client
   (`mailto:`) and skip server-side sending?
2. **Invite binding (D-2).** Must the accepting Google account match the invited address, or should
   anyone holding the link be able to join?
3. **Who can invite (D-3).** Owner only, or any member?
