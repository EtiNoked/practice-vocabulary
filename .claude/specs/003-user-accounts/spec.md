# Spec: User Accounts & Cloud-Saved Lists

**ID:** 003-user-accounts
**Status:** DRAFT
**Created:** 2026-09-05
**Feature Type:** New Capability (extends 001-vocab-trainer)
**Complexity:** Medium-High
**Depends on:** `001-vocab-trainer` (shipped)

## Overview

Sign in with Google and have your word lists follow you between devices, instead of being trapped in
one browser's `localStorage`. Once signed in, every list you save and every drill you finish is
written to your own private area of a cloud database, so you can start a list on a laptop and
practise it on a phone.

The app stays usable with **no account at all**. Signing in is an upgrade, not a gate.

## ⚠️ This feature reverses two v1 non-functional requirements

Spec 001 states, deliberately and repeatedly, that this app has no backend and that no user data
leaves the device. That was the right call for v1 and it is being knowingly reversed here. Recording
the reversal explicitly, rather than letting the two specs quietly contradict each other:

| v1 requirement | v1 wording | Status after 002 |
|---|---|---|
| NFR1 | "No backend, no server-side state, no API keys in the repo" | **Amended.** A managed backend (Firebase) now holds per-user state. Still no *self-hosted* server and no *secret* keys — the Firebase web config is public by design (see plan.md § Security). |
| NFR2 | "No user data leaves the device" | **Amended.** True for signed-out users, false for signed-in ones — that is the entire point of the feature. Replaced by NFR2a/NFR2b below. |
| NFR4 | "Total JS bundle under 150 KB gzipped" | **Amended.** Holds for signed-out users only; the Firebase SDK is lazy-loaded. See NFR4a/NFR4b. |
| Out of scope (v1) | "User accounts, cloud sync, cross-device sharing" | **This spec.** |
| Out of scope (v1) | "Score history across sessions" | **This spec** (Story 5). Accounts are what make it worth storing. |

Anyone reading spec 001 after this ships should treat those four lines as superseded.

## Core Assumptions

| # | Assumption | Rationale |
|---|-----------|-----------|
| A1 | Google is the **only** sign-in provider. No email/password, no magic links. | Stated directly by the user. One provider means no password reset flow, no email verification, no account-recovery surface. |
| A2 | A signed-in user's data is **private to them**. No sharing, no collaboration, no public lists. | Nothing in the request implies sharing. Per-user isolation is the simplest possible security model. |
| A3 | "Info per user" means **word lists plus score history**. | Confirmed with the user. Preferences and per-word mastery stats were offered and deferred. |
| A4 | One account per person, used on a handful of devices. Concurrent editing of the *same list* on two devices at once is rare. | Personal-use app. Justifies last-write-wins instead of CRDTs (see plan.md § Conflict handling). |
| A5 | A signed-out user is a first-class user, not a degraded one. | Preserves v1's zero-friction "open the page and type" flow, which is its best property. |

## User Stories

### Story 1: Sign in with Google
**As a** student who uses a laptop and a phone
**I want** to sign in with my Google account
**So that** my lists are mine rather than the browser's

**Acceptance Criteria:**
- [ ] The home screen shows a **Sign in with Google** button when signed out
- [ ] Clicking it opens the Google account chooser and returns me to the app signed in
- [ ] Once signed in, my name or email and a **Sign out** action are visible
- [ ] I stay signed in across page refreshes and browser restarts
- [ ] Signing in never loses the list I was in the middle of working on
- [ ] If I close the Google popup or deny consent, I return to exactly where I was with a neutral message — not an error screen
- [ ] If the popup is blocked by the browser, I'm told to allow popups for this site
- [ ] Sign-in works on iOS Safari and on desktop Chrome, Safari, Edge and Firefox

### Story 2: Use the app without an account
**As a** student who just wants to practise right now
**I want** the app to work with no sign-in
**So that** I'm not forced through a login wall for a vocabulary drill

**Acceptance Criteria:**
- [ ] Every v1 capability — type, paste, upload, edit, save, practise, score — works fully signed out
- [ ] Signed-out lists are saved to `localStorage` exactly as in v1
- [ ] The signed-out app downloads **no Firebase code at all**
- [ ] Copy makes it clear that signed-out lists live on this device only
- [ ] Sign-in is offered, never demanded, and never blocks a screen

### Story 3: Bring my existing lists with me
**As a** student who already has lists saved on this device
**I want** them copied into my account when I first sign in
**So that** signing in feels like an upgrade rather than starting over

**Acceptance Criteria:**
- [ ] On first sign-in with lists present locally, I'm asked whether to copy them — I'm never opted in silently
- [ ] The prompt states exactly how many lists will be copied
- [ ] I can decline, and the local lists stay on the device untouched
- [ ] After copying, the lists appear in my account and are available on my other devices
- [ ] Copying twice never produces duplicates
- [ ] The local copies are **not** deleted — declining or signing out leaves the device exactly as it was
- [ ] If copying fails part-way (offline, quota), I'm told which lists made it and can retry
- [ ] I'm not asked again on this device once I've answered

### Story 4: My lists on every device
**As a** student
**I want** the lists I save while signed in to appear on any device I sign in on
**So that** I can build a list at a desk and drill it on the bus

**Acceptance Criteria:**
- [ ] Saving a list while signed in writes it to my account, not to `localStorage`
- [ ] Signing in on a second device shows the same lists
- [ ] Creating, renaming, editing and deleting all sync to my other devices
- [ ] Changes made in one open tab appear in another open tab without a manual refresh
- [ ] The list I'm practising is a snapshot — a sync arriving mid-drill cannot disturb the running session
- [ ] With no network, my cached lists still load and I can still practise them
- [ ] Edits made offline are sent when the connection returns
- [ ] While offline, the UI says so rather than appearing to have lost data

### Story 5: See how I did last time
**As a** student
**I want** my finished drills recorded
**So that** I can see whether I'm actually improving

**Acceptance Criteria:**
- [ ] Finishing a drill records the date, the score, and which words I missed
- [ ] Quitting early records the cards I did answer, and is marked as a partial run
- [ ] A "wrong ones only" re-run is recorded but distinguishable from a full run, so it can't flatter my average
- [ ] Each list shows its last score and the trend across recent attempts
- [ ] History survives renaming the list
- [ ] History survives **deleting** the list — the list's name is kept with the record
- [ ] A drill run while signed out is recorded locally and is not sent anywhere
- [ ] History is never editable — it is a log, not a document

### Story 6: Sign out safely
**As a** student on a shared or borrowed computer
**I want** to sign out and leave nothing behind
**So that** the next person can't see my lists

**Acceptance Criteria:**
- [ ] **Sign out** returns me to the signed-out home screen
- [ ] After signing out, no cloud list of mine is visible or reachable
- [ ] The locally cached copy of my cloud data is cleared on sign out
- [ ] Lists that were on this device before I ever signed in are still there afterwards
- [ ] Signing back in restores my lists from the cloud

### Story 7: Delete my account and my data
**As a** person who is done with the app
**I want** to delete my account and everything in it
**So that** I'm not leaving personal data on someone's server indefinitely

**Acceptance Criteria:**
- [ ] A **Delete my account** action exists and is not hidden
- [ ] It states plainly what will be destroyed and that it cannot be undone
- [ ] It requires an explicit confirmation, not a single click
- [ ] It deletes my lists, my score history and my user record, then the account itself
- [ ] Google may require me to re-authenticate first; that is explained rather than surfaced as an error
- [ ] If deletion fails part-way, I'm told, and re-running it finishes the job
- [ ] Local device lists are untouched — they were never part of the account

### Story 8: Know where my data is
**As a** user handing over data to a cloud service
**I want** to be told what is stored and where
**So that** I can make an informed choice about signing in

**Acceptance Criteria:**
- [ ] Before signing in, a short, plain-language note says what is stored (name, email, lists, scores) and where
- [ ] It is one paragraph, not a legal document, and needs no scrolling on a phone
- [ ] It states that signed-out use sends nothing anywhere
- [ ] It links to the account-deletion action

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Google sign-in via Firebase Auth, popup flow | HIGH |
| FR2 | Auth session persists across refreshes and restarts | HIGH |
| FR3 | The app is fully functional signed out, backed by `localStorage` | HIGH |
| FR4 | One storage interface with a local and a cloud implementation, chosen by auth state | HIGH |
| FR5 | Per-user cloud storage of word lists under the signed-in user's own namespace | HIGH |
| FR6 | Security rules that make one user's data unreadable and unwritable by any other | HIGH |
| FR7 | Live sync — list changes propagate to other devices and tabs without a manual refresh | MEDIUM |
| FR8 | Offline read and write, replayed on reconnect | MEDIUM |
| FR9 | Opt-in, idempotent one-time migration of local lists into a new account | HIGH |
| FR10 | Record a `SessionRecord` for every completed or quit drill | MEDIUM |
| FR11 | Score history per list, surviving rename and deletion of the list | MEDIUM |
| FR12 | Sign out clears the local cache of cloud data | HIGH |
| FR13 | Self-service account and data deletion | MEDIUM |
| FR14 | Pre-sign-in privacy note | MEDIUM |
| FR15 | Lazy-load the Firebase SDK so signed-out users never download it | HIGH |
| FR16 | Explicit offline / syncing / synced status in the UI | LOW |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1a | No self-hosted backend and no *secret* credentials in the repo. Managed BaaS only. |
| NFR2a | A signed-out user's data never leaves the device — v1's NFR2 survives intact for guests. |
| NFR2b | A signed-in user's data is readable and writable **only** by that user, enforced server-side by security rules, not by client code. |
| NFR3 | v1's interactivity budget is unchanged for signed-out users: interactive within 1s on a mid-range phone. |
| NFR4a | **Signed-out bundle stays under 150 KB gzipped** — the v1 budget, protected by lazy-loading. |
| NFR4b | Signed-in users additionally load the Firebase auth + Firestore chunks (~150 KB gzipped), fetched only on demand. |
| NFR5 | Cloud reads are served from the local cache first, so a signed-in load is not gated on the network. |
| NFR6 | Free tier only. The design must not require Cloud Functions or any paid plan. |
| NFR7 | The app must never white-screen because of an auth or network failure. Every cloud failure degrades to a message plus a working local app. |
| NFR8 | Security rules are covered by automated tests that assert both allow **and** deny cases. |

## Edge Cases

| Case | Expected behaviour |
|------|-------------------|
| User closes the Google popup | Neutral "sign-in cancelled" message; app state untouched |
| Popup blocked by the browser | Explicit "allow popups for this site" message, with a retry |
| Two rapid clicks on Sign in | Second call is ignored while one is in flight |
| Auth state still resolving on first paint | A distinct "checking" state — never flash the signed-out UI at a signed-in user |
| Signed in but offline at load | Cached lists load from IndexedDB; a banner says changes will sync later |
| Offline edit, then the tab is closed before reconnecting | Firestore replays the queued write on next load; documented as expected |
| Same list edited on two devices while both offline | Last write to reach the server wins, whole-document. Documented, not silently reconciled |
| Local migration interrupted half-way | Already-copied lists keep their ids, so a retry overwrites rather than duplicating |
| User signs in on a device with 0 local lists | No migration prompt at all |
| User declines migration, then wants it later | A **Copy this device's lists to my account** action stays available in settings |
| Same account signs in on a device that already migrated a *different* set of local lists | Both sets merge by id; identical ids overwrite |
| Firestore quota / permission error on write | Toast explaining the save failed; the in-memory list still practises, matching v1's `localStorage`-full behaviour |
| Token expired or revoked mid-session | SDK refreshes silently; on hard failure, the user is signed out with an explanation |
| User deletes their Google account externally | Next token refresh fails; app signs them out cleanly |
| Account deletion requires recent login | Re-authentication is prompted for and explained, then deletion resumes |
| Account deletion fails part-way | Partial state is safe; re-running completes it |
| Session ends with 0 cards marked | No `SessionRecord` written — an empty log entry is noise |
| List deleted while its history exists | History is retained, showing the name captured at drill time |
| Signed-out user accumulates hundreds of local session records | Local history is capped (newest kept), matching the existing `MAX_LISTS` approach |
| `localStorage` unavailable (private mode) **and** signed out | v1 behaviour: works in memory, save fails with a toast |
| Firebase SDK chunk fails to load | Sign-in reports a load failure; the local app keeps working |
| Practising when a sync deletes the list underneath | Session holds a snapshot; the drill finishes normally (same guarantee as v1 editing) |

## Out of Scope

- Any sign-in provider other than Google
- Sharing lists between users, or any collaborative or public list
- Real-time collaborative editing, or conflict resolution finer than whole-document last-write-wins
- Server-side rendering, or any self-hosted API
- Cloud Functions or anything requiring a paid Firebase plan
- Per-word mastery statistics and spaced repetition (offered and deferred — a likely 003)
- Synced user preferences (offered and deferred)
- Admin tooling, analytics, or usage telemetry
- Exporting or importing an account's data as a file
- Multi-tenant, team or classroom features

## Deferred — flagged for a later decision

- **Merging duplicate lists during migration.** Migration merges by list id, so the same list copied
  from two different devices lands twice under two ids with the same name. Deduplicating by *content*
  is guesswork and can destroy a deliberate copy. Left alone; the user can delete one.
- **Per-word mastery stats.** `SessionRecord` deliberately stores the full `wrongPairs` snapshot,
  which is enough to derive per-word miss counts retrospectively. The data is being captured now so
  that a later spaced-repetition feature is not blocked on a backfill.
- **PR preview deployments cannot sign in.** Firebase authorised domains do not accept wildcards, and
  Cloudflare Pages gives every PR a new hostname. Auth will be verified on `localhost` and on
  production only. Adding each preview host by hand is possible but not worth it.
