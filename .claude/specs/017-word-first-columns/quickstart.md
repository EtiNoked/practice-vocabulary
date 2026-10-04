# Quickstart: 017-word-first-columns

**Feature ID:** 017-word-first-columns
**Baseline:** `main` @ `6db3b98`

## What this feature does

The editor's **first** column becomes the word you practise — the one that is spoken and tested —
and the second becomes its meaning. Purely a flip of what is drawn first.

## The one fact that makes it cheap

The practised word is already `col2` at every site below the editor:
`speak(pair.col2)` in `StudyCard.tsx:65`, `TestCard.tsx:59`, and the game hears `col2` and offers
`col1` tiles in `GameCloud.tsx:270`. So `col2` stays the prompt and only its **position** moves.

**Nothing stored changes. No migration. Nothing is needed from any user — including the owners of
shared lists.**

## The one hazard

17 test call sites address editor inputs by DOM position (`cells()[0]`, `cells()[3]`). Flipping two
JSX siblings silently redefines all of them, and one will stay green while asserting the opposite
of its intent (`ListEditor.test.tsx:449-458`).

**So: phase 1 converts every test to address cells by `data-cell` field, and must be green before a
single production line is touched.**

## Files changed

| File | What |
|---|---|
| `src/components/ListEditor.tsx` | `col2` input renders first; labels become `Word` / `Meaning` with no numbers |
| `src/parse/textParse.ts` | `parseDelimited` puts the first field in `col2` |
| `src/parse/languageDetect.ts` | first header cell names `col2Lang` |
| `src/components/PastePanel.tsx` | placeholder shows the word first |
| `src/parse/types.ts` | `RawRow` doc: the names are historical, not positional |

**Not changed, and task 10 proves it:** `src/state/`, `src/storage/`, `src/share/`, `src/game/`,
`src/speech/`, `src/lang/`, `firestore.rules`, `sortRows.ts`.

## Two things that look like bugs and are not

- **`DEFAULT_DETECTION` stays `col1: 'en', col2: 'nl'`** (`languageDetect.ts:12-17`). After the flip it renders Dutch-first, which is the default you want. Do not "fix" it.
- **`handleSort` still sorts `'col2'`** (`ListEditor.tsx:267`) and `findDuplicates` still keys on `row.col2`. Both already meant "the practised word"; that word is now the first column, so both became more obviously correct without changing.

## Test command

```bash
npm run typecheck && npm run lint && npm run test
```

Blast-radius gate (task 10) — must print nothing:

```bash
git diff --name-only -- src/state src/storage src/share src/game src/speech src/lang firestore.rules
```

## Read in this order

1. `spec.md` § *Where the app actually is* — the table of what `col2` already means
2. `plan.md` § *Why the frozen box really is frozen* — nine modules, why each needs no change
3. `plan.md` § *The one real hazard* — then start at `tasks.md` Task 1
