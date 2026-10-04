# Spec: The word you practise comes first

**ID:** 017-word-first-columns
**Status:** DRAFT
**Created:** 2026-10-04
**Baseline:** `main` @ `6db3b98`
**Feature Type:** Enhancement. Presentation only — **no stored data changes, no schema change, no rules change**
**Complexity:** Low to implement, Medium to verify. The diff is small; the risk is entirely in tests that address cells by position
**Branch:** `claude/word-first-columns` (off `origin/main`)

---

## The ask

> "If I want to change the order of the col that I have — so the first col will be the word that
> you practise on (meaning, the tests and practice will choose from it) and col2 will be the
> translation — what will it take?"

Three routes were put forward. This spec is **option A**: flip what the editor *shows* first, and
leave what the app *stores* exactly where it is.

---

## Where the app actually is

**The word being practised is `col2`.** Not column 1 — column 2.

| Site | Today |
|---|---|
| `StudyCard.tsx:65`, `TestCard.tsx:59` | `speak(pair.col2, subject.col2Lang)` |
| `StudyCard.tsx:119`, `TestCard.tsx:124` | the prompt on screen is `pair.col2` |
| `StudyCard.tsx:142`, `TestCard.tsx:130` | the revealed answer is `pair.col1` |
| `GameCloud.tsx:270` | you hear `col2`; the tiles you pick from are `col1` |
| `languages.ts:136` | says it outright: *"the prompt is column 2 and the answer is column 1"* |
| `ListEditor.tsx:55-69` | the **left** input writes `col1` — the answer |

So the editor asks for the translation first and the word second, and nothing on screen is wrong
about it: the header strip already reads `Column 1 — the answer` / `Column 2 — spoken aloud`
(`ListEditor.tsx:374-375`). The ask is not to correct a mislabelling. It is to reverse an order
that is correctly labelled and backwards to type in.

**Why this costs almost nothing.** `col2` is the prompt at *every* downstream site. If the editor
simply renders the `col2` input first, the first column the user sees becomes the word they
practise — with no pair moved, no list migrated, and no other module touched. The names `col1` and
`col2` stop describing position; they never described anything else that matters.

---

## Decisions

| # | Decision | Why |
|---|---|---|
| **D-1** | **Flip the display, not the data.** `col2` stays the prompt everywhere. `WordList`, `WordPair`, `RawRow` and every stored document are byte-identical before and after. | A semantic flip (option B) would need a one-time swap of every list, and there is no field the rules allow for an idempotency marker (`firestore.rules:186-188`), no way for a viewer to migrate a list shared with them, and no way to migrate append-only history. None of that buys anything the user asked for. |
| **D-2** | **No numbers in the editor's column labels.** `Word — spoken aloud` / `Meaning — the answer`; `Word language` / `Meaning language`. | After the flip a label reading "Column 1" would sit above the input that writes `col2`. Removing the numbering removes the contradiction rather than choosing which side of it to be wrong on. |
| **D-3** | **Field names stay `col1` / `col2`.** A comment on `RawRow` records that the names are historical and no longer track position. | A rename to `word`/`meaning` would ripple through ~35 source files and most of the 56 test files that mention these fields, to buy nothing a user can see. Recorded as a follow-up, not done here. |
| **D-4** | **`data-cell="col1"` / `"col2"` are unchanged.** They name the FIELD, and after this change they are the only honest way for a test to address a cell. | See FR8. Tests that index cells in DOM order are the single real hazard in this feature; the fix is to stop indexing and start naming. |
| **D-5** | **The ingest routes follow the display.** The first field of a pasted or uploaded line lands in `col2`; the first cell of a header row names `col2Lang`. | A paste and a typed row must agree about what "first" means, or the Paste panel contradicts the table it feeds. |
| **D-5a** | **`detectLanguages` is NOT changed.** By the time a row reaches it the first field is already in `col2` — `parseDelimited` put it there, or the editor's first input did. Flipping it too would double-flip. | Found by running the app, not by a test. See plan § *The double flip*. |
| **D-6** | **Existing lists are not touched and need no user action.** A saved list reopened in the editor simply shows its practised word on the left. | This is the entire point of choosing option A. |

---

## User stories

### Story 1: Typing a new list word-first
**As** someone building a Dutch list
**I want** the first box on each row to be the Dutch word
**So that** I type the word I am learning first, the way it is written in my textbook

**Acceptance criteria:**
- [ ] The left input of every row writes the word that will be spoken and tested
- [ ] The column above it is labelled `Word — spoken aloud`; the right one `Meaning — the answer`
- [ ] Typing in the left box of the last row still auto-appends a new row
- [ ] Starting a drill on the list speaks what was typed in the **left** box

### Story 2: Reopening a list I already have
**As** someone with lists already saved
**I want** them to open with the practised word on the left
**So that** nothing I own has to be re-entered, re-swapped or re-checked

**Acceptance criteria:**
- [ ] A list saved before this change opens with its spoken word in the left column
- [ ] Its languages, its badge and its drill behaviour are identical to before
- [ ] No migration runs, no prompt appears, no write is made on open
- [ ] A list shared with me behaves the same whether I own it or not

### Story 3: Pasting a list word-first
**As** someone pasting from a textbook or a spreadsheet
**I want** the first column of my paste to be the word
**So that** the preview and the table agree with each other

**Acceptance criteria:**
- [ ] `dochter<TAB>daughter` produces a row whose left box reads `dochter`
- [ ] A header row `Dutch<TAB>English` sets the **word** language to Dutch
- [ ] A line with only one field fills the word box and leaves the meaning box empty, flagged `Incomplete`
- [ ] A quoted CSV line keeps everything after the first comma as the meaning
- [ ] The placeholder in the Paste panel shows the new order

### Story 4: Everything else keeps working
**As** the person who has to maintain this
**I want** the flip to be provably confined to presentation
**So that** no drill, game, score, share or history behaviour can change

**Acceptance criteria:**
- [ ] `src/game/`, `src/state/`, `src/storage/`, `src/share/`, `src/speech/` are **not modified**
- [ ] `StudyCard`, `TestCard`, `GameCloud`, `ReadyScreen`, `TestSetup`, `GameSetup` are **not modified**
- [ ] `sortRows.ts` and `duplicates.ts` have **no behaviour change** (comments only)
- [ ] `npm run test` is green with no snapshot or fixture rewritten to accommodate a changed meaning

---

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The `col2` input renders before the `col1` input in every editor row | HIGH |
| FR2 | Row inputs are labelled `Row N word` and `Row N meaning`; `data-cell` values are unchanged | HIGH |
| FR3 | The column header strip reads `Word — spoken aloud` then `Meaning — the answer` | HIGH |
| FR4 | The language badge reads `{col2Lang} → {col1Lang} 🔊` | HIGH |
| FR5 | The language selectors render word-language first, labelled `Word language` / `Meaning language` | HIGH |
| FR6 | `parseDelimited` puts the first field in `col2` and the remainder in `col1` | HIGH |
| FR7 | `detectLanguages` reads the first header cell as `col2Lang`, the second as `col1Lang` | HIGH |
| FR8 | No test addresses an editor cell by its ordinal position | HIGH |
| FR9 | The Paste panel placeholder shows word-first example rows | MEDIUM |
| FR10 | `RawRow`'s doc comment records that `col1`/`col2` no longer track display position | MEDIUM |
| FR11 | Comments in `duplicates.ts`, the `Sort A to Z` note and `handleSwap` say "the word column" rather than "column 2" | MEDIUM |
| FR12 | `Swap columns ⇄` continues to exchange both contents and languages together | HIGH |

---

## Edge cases

- **Same-language lists** (a word and its explanation in one language, `c2847c7`). The badge renders `Dutch → Dutch 🔊`, which is already what it does; `isSameLanguage` is untouched. The `Word` / `Meaning` labels read correctly for an explanation list.
- **A reopened list whose languages were guessed.** `resolveLangs` (`ListEditor.tsx:116-124`) is untouched, so the stored-beats-weak-guess rule still holds. Its doc comment describes a Dutch-first list being reversed — that comment is about *language assignment*, not display order, and stays accurate.
- **`Swap columns ⇄` after the flip.** Still swaps `col1`↔`col2` contents and languages together, so it still means "I put these the wrong way round" — it just now moves the left box's content to the right box, which is what it looks like it does.
- **A bare one-column paste.** Previously filled `col1` (the meaning) and left the word blank. After FR6 it fills `col2`, the word column, and the row is flagged `Incomplete` until a meaning is typed. Assert it rather than discover it.
- **`parseDelimited`'s quoted-CSV join** (`textParse.ts:156`) keeps everything after the first comma in one field. That field must become `col1`, so a sentence-length meaning survives intact.
- **Rows mid-edit when the Paste panel appends.** `onAdd` appends `RawRow[]`; appending is field-addressed and unaffected by render order.
- **Long lists.** `Row` is `memo`ised on field props, not on index position; swapping two JSX siblings does not change its memo behaviour.

---

## Out of scope

- **Any change to what is stored.** No migration, no schema bump, no `firestore.rules` edit.
- **Renaming `col1`/`col2` to `word`/`meaning`** (D-3). A follow-up if the names grate.
- **A per-list "which column is the prompt" setting** (option C from the assessment).
- **Reversing the drill direction** — being shown the meaning and answering with the word. A different feature, and one this change neither helps nor hinders.
- **`normalize.ts:3-5`'s claim that "column 2 holds whole sentences."** After this change column 2 is the short word and column 1 may be the sentence, so the comment reads oddly — but `cleanCell` is applied to both cells identically, so there is nothing to fix behaviourally. Flagged for `015-stale-comment-repair`'s next pass rather than edited blind here.
