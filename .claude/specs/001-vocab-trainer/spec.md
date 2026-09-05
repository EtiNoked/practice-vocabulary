# Spec: Vocabulary Trainer

**ID:** 001-vocab-trainer
**Status:** DRAFT (v1 scope)
**Created:** 2026-09-05
**Revised:** 2026-09-05 — v1 descoped to text entry only; photo/OCR moved to v2
**Superseded in part:** 2026-09-05 by `003-user-accounts` — see the ⚠️ note below
**Feature Type:** New Capability (greenfield repository)
**Complexity:** Low-Medium

> ## ⚠️ Partly superseded by `003-user-accounts`
>
> That feature adds Google sign-in and per-user cloud storage, which knowingly reverses **NFR1**
> ("no backend") and **NFR2** ("no user data leaves the device"), amends **NFR4**, and delivers two
> items this spec lists as out of scope. Struck-through lines below are the ones affected. The
> reasoning is recorded in `.claude/specs/003-user-accounts/spec.md` § "This feature reverses two v1
> non-functional requirements".
>
> Everything else in this spec still holds, and the app remains fully usable with no account.

## Overview

A free, static web app for practising English↔Dutch vocabulary from a word list you type or upload.

You enter word pairs into a two-column table — by typing them, pasting them from a spreadsheet, or
uploading a `.csv`/`.tsv`/`.txt` file. The app then runs a listening drill: **column 2 is spoken
aloud, column 1 is the answer**. You hear a word, may replay it, reveal both columns to check,
self-mark right or wrong, and get a score at the end. The list can be reshuffled and re-run.

Everything runs client-side — no backend, no accounts, no API keys, no running costs.

## v1 Scope Boundary

**In:** typing pairs, pasting pairs, uploading a text/CSV list, editing saved lists, the listening
drill, scoring, shuffling, local persistence, deployment.

**Out (deferred to v2):** photographing a textbook page and OCR'ing it. See § Deferred to v2.

The architecture keeps the v2 seam open at no cost: both v1 ingest routes converge on a `RawRow[]`
type before any UI exists, which is exactly where an OCR path would later attach. No v1 code needs to
change to add it.

## Core Assumptions (stated explicitly)

| # | Assumption | Rationale |
|---|-----------|-----------|
| A1 | "Randomize" means **shuffle the presentation order of the pairs**, not scramble which answer belongs to which prompt. | Scrambling pairings would make the exercise meaningless. |
| A2 | Column 2 is always the spoken prompt; column 1 is always the hidden answer. | Stated directly by the user. |
| A3 | Both languages are English and Dutch only. | Stated directly by the user. Keeps voice handling to two languages. |
| A4 | A list is a flat set of pairs with no grouping, tagging or lesson structure. | Matches a single textbook page; grouping is unrequested complexity. |

## User Stories

### Story 1: Type a word list
**As a** student
**I want** to type my word pairs into a two-column table
**So that** I can start practising without any setup

**Acceptance Criteria:**
- [ ] The home screen offers **New list** as the primary action
- [ ] I get a two-column table with one empty row, labelled by column
- [ ] Typing in the last row automatically adds another empty row beneath it
- [ ] I can delete any row and add a row explicitly
- [ ] Tab moves between cells and Enter from the last cell adds a row
- [ ] A running count shows how many complete pairs I have
- [ ] I cannot start practice until at least 1 complete pair exists

### Story 2: Paste or upload a list
**As a** student who already has the words in a spreadsheet or a file
**I want** to paste them in or upload the file
**So that** I don't retype dozens of rows

**Acceptance Criteria:**
- [ ] I can paste many lines at once into a bulk-paste box
- [ ] Pasting from a spreadsheet (tab-separated) works with no configuration
- [ ] Comma, semicolon, ` - `, ` – `, ` = ` and 2+ spaces are also recognised as separators
- [ ] The detected separator is shown, and I can change it if the guess was wrong
- [ ] If detection is inconclusive, no separator is guessed and I'm asked to pick one
- [ ] I can upload a `.csv`, `.tsv` or `.txt` file instead of pasting
- [ ] A live preview shows how many complete pairs will be added before I commit
- [ ] Lines producing only one field are added as incomplete rows and flagged, never silently dropped
- [ ] Pasting into a non-empty list appends rows rather than replacing them

### Story 3: Practise by listening
**As a** student
**I want** to hear a column-2 word, replay it, then check the answer and mark myself
**So that** I train recall rather than recognition

**Acceptance Criteria:**
- [ ] Clicking **Start** shuffles the pairs and speaks the first column-2 word automatically
- [ ] A **Hear it again 🔊** button replays the current word any number of times
- [ ] The answer is hidden until I click **Show answer**
- [ ] After revealing, **both** column 1 and column 2 are shown as text
- [ ] After revealing, I can mark the card **Right ✓** or **Wrong ✗**
- [ ] Marking advances to the next card and speaks it automatically
- [ ] A progress indicator shows "Card 7 of 24" and a running right/wrong tally
- [ ] I can quit the session early and still see the score for the cards I answered

### Story 4: See my score and go again
**As a** student
**I want** a final score and a way to restart
**So that** I can measure improvement and drill the words I missed

**Acceptance Criteria:**
- [ ] At the end I see score as "18 / 24 (75%)"
- [ ] I see the list of words I got wrong, showing both columns
- [ ] **Shuffle & restart** re-randomises the full list and starts a new session
- [ ] **Practise wrong ones only** starts a new session containing just the missed pairs
- [ ] Ending a session does not mutate the saved list

### Story 5: Re-use a saved list
**As a** student
**I want** my lists kept on this device
**So that** I can re-practise next week without retyping them

**Acceptance Criteria:**
- [ ] I can name and save a list from the editor (default name is date-based)
- [ ] Saved lists are listed on the home screen with name, pair count and date
- [ ] Selecting a saved list goes straight to the ready-to-practise screen
- [ ] I can rename and delete saved lists
- [ ] Lists survive a page refresh and a browser restart
- [ ] Lists are stored per-device with no account and are never uploaded anywhere

### Story 6: Review and edit an existing list
**As a** student who spotted a typo after saving
**I want** to reopen any list and correct it
**So that** I'm not forced to delete it and start over

**Acceptance Criteria:**
- [ ] Every saved list has an **Edit** action that opens it in the same editor
- [ ] I can change any cell, delete rows, add rows, and bulk-paste more rows into it
- [ ] Saving updates the list in place, keeping its id and name, and bumps an `updatedAt` timestamp
- [ ] I can cancel and leave the saved list untouched
- [ ] I'm warned before leaving with unsaved changes
- [ ] Language detection re-runs on save, so adding a header row like `English | Dutch` corrects a wrong guess
- [ ] Editing a list never affects a session already in progress

### Story 7: Cope with a missing Dutch voice
**As a** student on a device with no Dutch TTS voice installed
**I want** the app to tell me and stay usable
**So that** I'm not stuck on a silent screen

**Acceptance Criteria:**
- [ ] If no voice matches the prompt language, a persistent banner explains this and how to install one
- [ ] In that degraded mode the prompt word is shown as text on the prompt card, so the drill still runs
- [ ] The banner is dismissible for the session

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Two-column editable table for typing pairs, with auto-growing rows | HIGH |
| FR2 | Bulk-paste box parsing many lines at once | HIGH |
| FR3 | Automatic separator detection with a manual override and a no-guess floor | HIGH |
| FR4 | Import `.csv` / `.tsv` / `.txt` files through the same parser | HIGH |
| FR5 | Live preview of parse results before committing | MEDIUM |
| FR6 | Detect column languages from a header row, with a word heuristic and an `en`/`nl` default as fallbacks | MEDIUM |
| FR7 | Shuffle pair order at session start (Fisher–Yates) | HIGH |
| FR8 | Speak column 2 via the Web Speech API using a voice matching the detected language | HIGH |
| FR9 | Replay the current word on demand | HIGH |
| FR10 | Reveal both columns on demand | HIGH |
| FR11 | Self-mark right/wrong per card | HIGH |
| FR12 | Show final score, percentage, and the missed words | HIGH |
| FR13 | Shuffle & restart, and practise-wrong-only | HIGH |
| FR14 | Persist lists in `localStorage` with a versioned schema | HIGH |
| FR15 | Reopen and edit any saved list, updating it in place | MEDIUM |
| FR16 | Re-run language detection whenever a list is saved from the editor | MEDIUM |
| FR17 | Warn and degrade gracefully when no matching TTS voice exists | MEDIUM |
| FR18 | Be usable one-handed on a phone screen | MEDIUM |
| FR19 | Deploy as a static site on a free host | HIGH |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | ~~No backend, no server-side state, no API keys in the repo~~ — **SUPERSEDED by 003-user-accounts.** A managed backend (Firebase) now holds per-user state for signed-in users. Still no self-hosted server and no *secret* keys. |
| NFR2 | ~~No user data leaves the device~~ — **SUPERSEDED by 003-user-accounts.** Still true for signed-out users; deliberately false for signed-in ones. |
| NFR3 | Interactive within 1s on a mid-range phone |
| NFR4 | Total JS bundle under 150 KB gzipped (v1 has no heavy dependencies) — **AMENDED by 003-user-accounts:** still enforced for signed-out users, who download zero Firebase. Signed-in users additionally fetch lazy Firebase chunks. |
| NFR5 | Keyboard operable: Space = replay, Enter = reveal, Y/N = mark |
| NFR6 | Works on current Chrome, Safari (incl. iOS), Edge, Firefox |

## Edge Cases

| Case | Expected behaviour |
|------|-------------------|
| Pasted line contains the separator more than once | Split on the **first** occurrence only: field 1 → col1, remainder → col2. Handles `niece,My sibling's daughter, my niece` |
| Pasted CSV uses quoted fields (`"a, b",c`) | Minimal RFC 4180 quote handling on the comma/CSV path |
| Pasted text has a header line (`English<TAB>Dutch`) | Consumed for language detection and excluded from the pairs |
| Pasted line yields only one field | Row added with an empty cell and flagged incomplete — never silently dropped |
| Separator detection inconclusive (< 60% of lines yield 2 fields) | No guess applied; picker shown with a "couldn't tell" hint |
| Bulk paste is empty or whitespace-only | Preview shows "0 pairs"; the commit button stays disabled |
| Bulk paste into a non-empty list | Rows appended, not replaced; the preview says which |
| Uploaded file is not text, or over 1 MB | Rejected with an inline message |
| Uploaded file has a BOM or CRLF line endings | Stripped/normalised before parsing |
| A row has an empty cell | Excluded from practice, flagged in the editor |
| Duplicate pairs in the list | Kept as-is; each is drilled separately |
| List has exactly 1 pair | Session runs with one card; score is x/1 |
| No header row present | Word-based heuristic; if inconclusive, default col1=en, col2=nl, badge shows "(guessed)" |
| No `nl-NL` voice installed | Banner + text-visible degraded mode (Story 7) |
| `getVoices()` empty on first call | Wait for `voiceschanged`, 3s timeout, then re-check |
| iOS blocks speech outside a user gesture | All speech is triggered by taps; first speak happens on the Start tap |
| `speechSynthesis` stuck after backgrounding | `cancel()` before every `speak()` |
| `localStorage` full or disabled (private mode) | Save fails with a clear toast; the current session still works in memory |
| User refreshes mid-session | Session is not restored; the saved list is intact — documented, not a bug |
| Editing a list a running session came from | Session holds a snapshot; the running drill is unaffected |
| Leaving the editor with unsaved changes | Confirmation prompt |
| Very long list (200+ pairs) | Table virtualisation is out of scope; a soft warning is shown above 200 rows |

## Out of Scope (v1)

- **Photographing a page and OCR** — see § Deferred to v2
- ~~User accounts, cloud sync, cross-device sharing~~ — **DELIVERED by 003-user-accounts**
- Languages other than English and Dutch
- Speech *recognition* (speaking the answer instead of self-marking)
- Spaced repetition / long-term scheduling
- ~~Score history across sessions (only the current session's score is shown)~~ — **DELIVERED by 003-user-accounts**
- Grouping, tagging or lesson structure within a list
- Automatic deduplication on import (duplicates are kept; see Edge Cases)
- Editing a list *during* a practice session
- Offline PWA install

## Deferred to v2

### Photo → word list (OCR)

The originally-planned capability: photograph a two-column textbook table, OCR it in-browser with
Tesseract.js, split the columns geometrically from word bounding boxes, and drop the result into the
same editor for correction.

**Why it is deferred, not cancelled:** it was the highest-risk and highest-effort third of the build
(OCR accuracy on angled phone photos, a crop/rotate UI, a column-splitting algorithm, a ~15 MB
language-data download), and it is *optional* — every word list it produces can be typed or pasted
instead. Shipping v1 without it gets a working trainer into use sooner and de-risks the rest.

**What v1 does to keep the door open at zero cost:**

- Both ingest routes converge on `RawRow[]` before any UI exists. An OCR path attaches at that exact
  point with no change to `normalize`, `languageDetect`, the editor, saving or practice.
- The editor takes an optional per-row `conf` field it currently never receives, so OCR confidence
  flagging needs no new prop.
- The editor is reached through an `Editing` state with three inbound edges already modelled; OCR
  becomes a fourth.

The full OCR design — column-splitting algorithm, Tesseract.js version gotchas, crop-step rationale —
is preserved in `plan.md` § Appendix: v2 OCR design, so none of that research is lost.

### Other v2 candidates

- Manual language override control (see § Deferred below)
- Score history and "practise the words I've missed most"
- PWA install for offline use

## Deferred — flagged for a later decision

- **Manual language override.** The user chose header auto-detection without an override control.
  Detection is therefore made *visible* in the editor so a wrong guess is obvious rather than silent.

  **Story 6 largely resolves this without adding a control.** Because detection re-runs on every save,
  typing or correcting a header row (`English` / `Dutch`) in the first row of the table *is* the
  override — it moves detection from the amber "(guessed)" heuristic path to the green `header` path.
  A discoverable escape hatch that costs no extra UI. Making the badge itself a toggle remains roughly
  a one-hour change if the heuristic disappoints.
