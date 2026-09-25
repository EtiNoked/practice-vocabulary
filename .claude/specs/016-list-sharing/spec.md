# Spec: Sharing a list with someone else

**ID:** 016-list-sharing
**Status:** DRAFT, revision 3 (one `lists` collection for every list). Two questions open, see the end
**Created:** 2026-09-25
**Baseline:** `main` @ `a45a15d`
**Feature Type:** New capability. New stored data and new security rules. No server code
**Complexity:** High. The UI is moderate; the risk is in the rules and in the one-time move of existing lists
**Depends on:** `003-user-accounts` (shipped). Sharing is a signed-in feature.
**Branch:** `claude/list-sharing-feature-872bcu`

---

## The ask

> "I want to add an option to share a list. When the list is shared, we send an email to the
> recipient, and ask if they want to join the list (or to create account and then accept the list).
> For the user that shares, he can see statuses: invite sent, and have an option to cancel
> invitation. After the accept, both users can edit and use the same list. Both see the members of
> the list."

Revised in session, after the first draft:

> "Let's have a barcode that the sharer can send via WhatsApp or email or just show the receiver.
> Will it be easier?"

**Yes, much easier.** The first draft needed the app's first server code (a Cloudflare Worker
route), an email provider account, a verified sending domain and a secret key, because the app has
no backend and 003 NFR6 rules out Firebase's paid email extension. A share link with a QR code
needs **none of that**: the app makes the link, and the sharer's own phone sends it. WhatsApp,
email, SMS, or holding the phone up to someone's camera are all the same feature.

What the sharer loses is the app *knowing* the message was delivered. That is replaced by a status
the app can know for certain: whether the link has been **used** (Story 2).

---

## Answers taken in session

| Question | Answer | Becomes |
|---|---|---|
| How is the invite delivered? | A QR code the sharer sends via WhatsApp or email, or shows on screen | D-1 |
| Who can accept? | Anyone with the link | D-2 |
| What can each person do? | Per person: can edit, or can only practise | D-3 |
| Extras | Keep a copy when leaving; Stop sharing | D-11, D-12 |
| One place for lists, or two? (revision 3) | One `lists` collection, lists associated with users by membership | D-5, D-14 |

---

## Where the app actually is

**Every list is private by construction.** Lists live at `users/{uid}/lists/{listId}` and the rules
grant access with one `isOwner(uid)` check. A list two people can use cannot live under one
person's uid. Revision 2 answered that with a second collection for shared lists only; revision 3
instead moves **every** cloud list to one top-level `lists` collection, where each list names its
owner and members (D-5). A private list is simply a list with one member. That reverses 003 A2 and
retires `users/{uid}/lists`, both recorded below.

**A list id is already a stable, global uuid.** It is the Firestore document id, saved tests keep
it in `spec.listIds`, and session records keep it in `listId`. Existing lists can therefore **move**
to the new collection without breaking a saved test or a history record, as long as the id is kept
(D-14).

**The app is a static SPA with a single-page fallback** (`wrangler.jsonc`,
`not_found_handling: "single-page-application"`). A link like `/?join=<code>` already serves
`index.html`, so the entry point costs no deploy change.

---

## ⚠️ This feature reverses earlier decisions

| Earlier decision | Wording | After 016 |
|---|---|---|
| 003 A2 | "A signed-in user's data is private to them. No sharing, no collaboration" | **Amended.** Private lists stay private. A list the owner shares is readable by its members, and writable by its editors, enforced by the rules. |
| 003 data model | `users/{uid}/lists/{listId}`: everything a user owns under their uid | **Changed for lists only.** Cloud lists move to `lists/{listId}` with `ownerUid` and `memberUids`. Practice history, games and saved tests stay under `users/{uid}`. The old location becomes read-and-delete only, for the move (D-14). |
| 003 security model | "Everything under `users/{uid}/` collapses the security model into a single recursive rule" | **Amended.** A private list's privacy now comes from the membership rule, not from its path. That rule therefore guards every list, and its deny tests carry more weight than any rule before it (NFR3). |
| 003 A4 | "Concurrent editing of the same list on two devices at once is rare" | **Amended for shared lists.** Last-write-wins stays, but a stale edit is detected and the user is asked (D-8). |
| 003 NFR2b | "A signed-in user's data is readable and writable only by that user" | **Amended.** True for everything except shared lists and share links. |
| 003 Story 8 | Privacy note lists name, email, lists, scores | **Extended.** Members of a shared list see each other's name, email and picture. |

003 NFR1a (no self-hosted backend, no secrets) and NFR6 (free tier, no Cloud Functions) **survive
intact**. Revision 1 of this spec amended NFR1a; revision 2 no longer needs to.

---

## Decisions taken

Numbered so the plan and the tasks can cite them instead of re-arguing them.

**D-1. An invite is a share link, shown as a QR code.** The Share panel offers, for one link:
- **Share…** opens the phone's own share sheet (Web Share API), so WhatsApp, email, SMS, Telegram
  are all there without the app naming any of them
- **WhatsApp** and **Email** buttons as well, for desktop browsers with no share sheet
  (`https://wa.me/?text=` and `mailto:`)
- **Copy link**
- **Show QR code**, full screen, for someone standing next to you. Their phone's camera app opens
  the link; the app needs no scanner of its own

No email is sent by the app. No server, no provider, no secret.

**D-2. Anyone with the link can join.** The link is not tied to an email address. It carries a
random, unguessable code (122 bits), so it cannot be found by trying; it can only be passed on.
Two things keep "passed on" contained: the owner sees exactly who joined and can remove them, and
each link has a limited number of uses (D-4).

**D-3. Per-person roles: Owner, Can edit, Can practise.** The role is chosen when the link is
made, and the owner can change it for any member later.

| | Owner | Can edit | Can practise |
|---|---|---|---|
| Practise, test, use in games and saved tests | ✓ | ✓ | ✓ |
| See members | ✓ | ✓ | ✓ |
| Edit words, rename, change languages | ✓ | ✓ | |
| Keep a private copy | ✓ | ✓ | ✓ |
| Make links, cancel links, change roles, remove members | ✓ | | |
| Stop sharing, delete for everyone | ✓ | | |
| Leave | | ✓ | ✓ |

"Can practise" is a first-class role, not a degraded one. It is the teacher-to-students case: one
list, many learners, one person who maintains it.

**D-4. A link is for one person by default.** It is used up by the first person who joins. The
owner may instead make a **group link** (open question 1) that stays usable until they turn it off
or it reaches its limit. Single-use is the default because it makes the status the owner asked for
exact: a link is *waiting* or *used by Dana*, never "used by some people".

**D-5. One `lists` collection for every cloud list.** Each list carries `ownerUid`, `memberUids`
and a `members` map with each person's role. A private list has one member, its owner. Sharing
never moves a list: it only adds members, and stopping only removes them. "My lists" is one query:
the lists I am a member of. Personal data (history, games, saved tests) stays under `users/{uid}`,
because it belongs to one person even when the list does not.

**D-6. Practice history stays per person.** Each member's drills are written to their own
`users/{uid}/sessions`, exactly as now. Everyone practises the same words; nobody sees anyone
else's scores.

**D-7. Links expire after 14 days** if unused. Enforced by the rules on join, not by a cleanup job.
An expired link shows **Expired** to the owner, with **New link**.

**D-8. Concurrent edits: last write wins, but a stale write is caught.** The editor remembers the
list's `updatedAt` when it opened. If the live list moved on before Save, the user is told who
changed it and picks **Keep theirs** or **Save mine anyway**.

**D-9. At most 20 people per list**, owner included, and at most 10 open links. Blast-radius caps
like every other cap in `firestore.rules`.

**D-10. Sharing and joining both need a Google account.** A guest sees Share as
**Sign in to share**. A link opened signed-out shows who is inviting them and to what, and a
**Sign in with Google to join** button. For someone new, that sign-in *is* account creation, so
"create an account, then accept" is one tap, not two flows.

**D-11. Nobody loses their words when a shared list goes away from them.** Whenever a member stops
having the list (they leave, they are removed, the owner stops sharing, or the owner deletes it),
they are offered **Keep a private copy**. The copy is a new list with its own id (the original may
still exist), and it remembers the id it came from, so their practice history, their "words you
missed" and their saved tests carry over to it.

To make that offer possible when the member was not looking at the moment it happened, a removed
member keeps **read-only access to the last version** until they answer the offer. They cannot
see any later edit.

**D-12. The owner can Stop sharing.** Every other member is removed and shown the keep-a-copy
offer, every open link stops working, and the owner's list is left with one member, which is all a
private list is. Nothing moves and the owner's list keeps its id.

**D-13. The owner deleting their account does not delete the list from under its members.**
Ownership passes to the longest-standing member who can edit, or failing that the longest-standing
member. Only a list with no other members is deleted.

**D-14. Existing cloud lists move once, automatically, on sign-in.** The app copies each
`users/{uid}/lists/{id}` to `lists/{id}` with the user as owner, then deletes the old document.
Same id, so saved tests and history are untouched. Safe to re-run and safe to interrupt, like 003's
device-to-account copy. Until a user's move finishes, the app keeps reading the old location too,
so no list ever disappears, including offline. Nothing new is ever written to the old location.

---

## User Stories

### Story 1: Share a list
**As a** student with a good word list
**I want** to send it to a friend however we normally talk
**So that** we can practise the same words

**Acceptance Criteria:**
- [ ] Each of my lists, while signed in, has a **Share** action (list row and list editor)
- [ ] Share opens a panel with **Who can join** (Can edit / Can practise), an optional **Label** ("For Dana"), and **Create link**
- [ ] Creating shows a QR code and **Share…**, **WhatsApp**, **Email**, **Copy link**, **Show QR code**
- [ ] **Share…** appears only where the device has a share sheet; WhatsApp, Email and Copy are always there
- [ ] The shared message reads *"{my name} invited you to practise "{list}" ({n} words, {langs}) in Vocabulary Trainer: {link}"*
- [ ] **Show QR code** fills the screen, is large enough to scan from arm's length, and works in dark mode (always dark modules on a light square)
- [ ] Offline, **Create link** is disabled with the reason on screen
- [ ] Signed out, Share reads **Sign in to share** and leads to sign-in

### Story 2: See and manage my links
**As the** person who shared a list
**I want** to see what happened to each link
**So that** I know who joined and can take a link back

**Acceptance Criteria:**
- [ ] Each link shows its label (or "Link 1", "Link 2"), its role, and one status: **Waiting · created 2h ago**, **Declined**, **Expired**
- [ ] When someone joins, the link disappears and they appear under **Members**, with *"joined via For Dana"*
- [ ] A waiting link has **Share again** (reopens the share options and QR) and **Cancel link**
- [ ] Cancel asks for confirmation; the link then says *"This invitation is no longer available"*
- [ ] An expired or declined link has **New link** and **Remove**
- [ ] Status updates live, without reopening the panel

### Story 3: Join from a link (with or without an account)
**As** someone who was sent a link or shown a QR code
**I want** to join in a tap or two
**So that** I get the list without retyping it

**Acceptance Criteria:**
- [ ] The link opens the app on a **join screen**, not the home screen
- [ ] Signed out, it already shows who invited me, the list name, word count and languages, and whether I will be able to edit, with **Sign in with Google to join**
- [ ] After signing in (creating my account if I had none) I land back on the join screen, not on the home screen
- [ ] Signed in: **Join list** and **No thanks**
- [ ] **Join list** adds me with the link's role and opens **My lists** with the list there, marked shared
- [ ] **No thanks** marks the link declined (the owner sees it) and returns me home
- [ ] The first-sign-in "copy this device's lists" prompt (003 Story 3) still appears, **after** the join screen, never on top of it
- [ ] A cancelled, expired or already-used link says so plainly, names the owner, and suggests asking them for a new one
- [ ] Opening a link for a list I am already in just opens the list
- [ ] Opening my own link says *"This is your own link"* and offers to show its QR code

### Story 4: Use and edit the list together
**As a** member of a shared list
**I want** it to work like any of my own lists
**So that** sharing costs nothing in daily use

**Acceptance Criteria:**
- [ ] A shared list appears in **My lists** beside my private ones, with a **Shared** badge, member avatars, and my role if I cannot edit
- [ ] Every member can practise it, test on it, and use it in saved tests and games
- [ ] Owner and editors can edit words, rename it and change languages; for "Can practise" members the editor opens read-only with the reason at the top
- [ ] An edit by one member appears for the others without a refresh
- [ ] If someone else saved since I opened the editor, Save warns me, names them, and lets me keep theirs or save mine (D-8)
- [ ] A drill in progress is unaffected by another member's edit (the existing snapshot rule)
- [ ] My practice history for the list is mine; "5 practices · last 80%" counts only my drills (D-6)

### Story 5: See who is in the list
**As a** member (any role)
**I want** to see who shares this list
**So that** I know who can see and change it

**Acceptance Criteria:**
- [ ] A **Members** panel, open to every member, lists each person's picture, name, email and role, with **Owner** and **You** marked
- [ ] The owner sees the same panel with a role picker and **Remove** beside each member
- [ ] The list row shows up to three avatars and "+N"

### Story 6: Leave, remove, stop sharing, delete
**As a** member or owner
**I want** a way out that never loses anyone's words
**So that** sharing is never a one-way door

**Acceptance Criteria:**
- [ ] A member has **Leave list**, confirmed with a choice: **Leave and keep a copy** / **Leave**
- [ ] The owner can **Remove** a member (confirmed)
- [ ] The owner can **Stop sharing** (confirmed, naming how many people): the list becomes private again for the owner, all links stop working
- [ ] The owner's **Delete** on a shared list says it deletes it for everyone and names how many people
- [ ] A member who was removed, or whose list was unshared or deleted, sees on **My lists**: *"Dana stopped sharing "French verbs" with you."* **Keep a private copy** / **Dismiss**. The offer waits for them however long they take to come back (D-11)
- [ ] The kept copy has the same words as the last version they could see; its "5 practices" line and "words you missed" include their drills on the shared list; their saved tests now point at the copy
- [ ] A member's saved tests that used a list they left without a copy behave exactly as 011 does for a deleted list
- [ ] Deleting my account: I leave every list I am in; lists I own pass to another member (D-13) or are deleted if I am alone; my open links are cancelled

### Story 7: Nothing changes for people who never share
**As a** signed-in student who never shares anything
**I want** my lists to be exactly where they were after this ships
**So that** a feature I do not use cannot cost me anything

**Acceptance Criteria:**
- [ ] The first sign-in after the update moves my lists without a prompt, a spinner that blocks the app, or any visible change (D-14)
- [ ] During and after the move, every list, its practice history, its "5 practices" line and my saved tests are exactly as before
- [ ] Opening the app offline before the move has run still shows all my lists
- [ ] If the move is interrupted (closed tab, lost connection), the next visit finishes it; no list is ever duplicated or lost
- [ ] Signed-out lists on the device are untouched

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | One `lists/{listId}` collection for every cloud list, with owner, member uids and a per-member role and profile | HIGH |
| FR2 | `shareLinks/{code}` with a random code, role, label, use limit, status and a list preview | HIGH |
| FR3 | Rules: members read; owner and editors edit content; only the owner changes membership, except join and leave | HIGH |
| FR4 | Rules: join only with a waiting, unexpired link for this list, taking exactly the link's role | HIGH |
| FR5 | One-time, idempotent move of `users/{uid}/lists` to `lists`, keeping ids (D-14) | HIGH |
| FR6 | `subscribeLists` is one query, lists where I am a member (plus the old location until the move finishes) | HIGH |
| FR7 | Share panel: role, label, create; QR code; share sheet, WhatsApp, Email, Copy, full-screen QR | HIGH |
| FR8 | Join screen via `?join=<code>`, surviving sign-in, readable before sign-in | HIGH |
| FR9 | Owner view: link statuses, cancel, share again, new link; members with role change and remove | HIGH |
| FR10 | Member view: members, role, leave (with or without a copy) | HIGH |
| FR11 | Keep-a-copy offer after leave, removal, stop sharing and delete (D-11) | HIGH |
| FR12 | Stop sharing (D-12) | MEDIUM |
| FR17 | A kept copy inherits history through `previousIds` (D-11) | MEDIUM |
| FR13 | Stale-edit detection on save for shared lists (D-8) | MEDIUM |
| FR14 | Read-only editor for "Can practise" members | MEDIUM |
| FR15 | Account deletion handles shared lists and links (D-13) | HIGH |
| FR16 | Privacy note and README updated | MEDIUM |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | Free tier only, no Cloud Functions, no server code, no secrets (003 NFR1a and NFR6 unchanged). |
| NFR2 | Signed-out bundle budget unchanged. The QR encoder and all sharing UI are in a lazy chunk; `check-bundle.mjs` still passes. |
| NFR3 | Every new rule has an allow **and** a deny test. The `lists` read rule gets the strongest suite in the file: it is now the only thing keeping every private list private. |
| NFR4 | Private lists behave exactly as today from the user's side, although they are stored somewhere new. `listRepo.ts`, `localListStore.ts`, `session.ts` and `parse/` are not modified; guests are untouched. |
| NFR5 | One new runtime dependency at most: a QR encoder under 10 KB gzipped, MIT, no transitive dependencies, rendering SVG (CSP forbids nothing about inline SVG). Writing an encoder by hand is the fallback. |
| NFR6 | The QR code is readable in both themes and at 200% zoom, and never the only way to get the link (Copy link is always beside it). |

## Edge Cases

| Case | Expected behaviour |
|------|-------------------|
| Link forwarded to a group chat, first stranger joins | Used up by that person; owner sees them under Members and can remove them (D-2, D-4) |
| Two people open a single-use link at the same moment | The first join wins; the second is told it was just used |
| Joiner is already a member | Opens the list; the link is not used up |
| Joiner is the owner | "This is your own link"; not used up |
| Owner cancels while someone has the join screen open | Join fails; screen says the link is no longer available |
| Owner changes a member's role while they are editing | Their Save fails with a clear "you can now only practise this list"; they may keep a copy |
| Member removed while editing | Save fails; the keep-a-copy offer includes their unsaved edits |
| Member offline edits, then is removed before reconnecting | Queued write rejected on reconnect; the keep-a-copy offer appears with the last version plus a note that their offline changes could not be saved |
| Owner offline when trying to share | Create link disabled; the link must exist on the server before it is sent |
| Member keeps a copy, then rejoins the shared list | Both exist, with different ids; no conflict |
| Move interrupted halfway | Some lists in each place; both are read and deduped by id; the next sign-in finishes |
| A list id already exists in `lists` owned by someone else (practically impossible, uuids) | The rules refuse the copy; that one list stays in the old location, still readable, and the error is logged |
| Old app version still open in another tab after the update | It writes to `users/{uid}/lists`, which the rules now refuse; it shows its existing permission toast. Reloading fixes it |
| Owner deletes the list with waiting links | All links stop working at once |
| 20-person or 10-link cap reached | The action is disabled with the reason |
| QR scanned by a camera app that opens a different browser than the one signed in | Works: they sign in there; nothing depends on the original browser |

---

## Out of scope

- Delivery by the app itself (email, push). The sharer's own apps deliver the link
- Sharing with someone who will not make an account
- A shared practice history, leaderboard or "who practised" view
- Sharing saved tests or games
- Transfer of ownership by choice (only on account deletion, D-13)
- In-app QR scanning

---

## Questions for the owner

1. **Group links (D-4).** Besides one-person links, should the owner be able to make one link for a
   whole group (a class), usable by up to 20 people until turned off? Recommended: **yes**, it is
   small once single-use links exist, and it is the natural way to use "Can practise".
2. **Changing roles later.** Is it fine that the owner can switch any member between "Can edit" and
   "Can practise" at any time? Recommended: **yes**.
