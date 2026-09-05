# Vocabulary Trainer

A small web app for practising English↔Dutch vocabulary by **listening**.

Put a word list in — type it, paste it from a spreadsheet, or upload a file — then
drill yourself. The app reads **column 2** aloud and keeps **column 1** hidden as the
answer. Hear it again as often as you like, reveal both columns to check, mark
yourself right or wrong, and get a score at the end.

Everything runs in your browser. No account, no server, no API keys — and nothing you
type ever leaves your device.

## Adding a word list

Three ways, all reaching the same editable table:

| | How |
|---|---|
| **Type** | New list → type pairs; a new row appears as you fill the last one |
| **Paste** | Paste or import → paste from Excel, Google Sheets, or anywhere |
| **Upload** | Paste or import → Upload a file (`.csv`, `.tsv`, `.txt`) |

The separator is detected automatically — tab, comma, semicolon, ` - `, ` = `, or
runs of spaces. If it can't tell, it asks rather than guessing, because a silently
mis-parsed list is worse than one extra click. Commas inside the second column are
safe: lines split at the *first* separator only, so
`niece,My sibling's daughter, my niece` stays intact.

### Which column is which language

Detected automatically. Put `English` and `Dutch` in the first row and it's read
straight from there. Otherwise the app guesses from spelling patterns and shows an
amber **(guessed)** badge — if the guess is wrong, add that header row and it
corrects itself.

## Practising

Start → hear the word → **Hear it again 🔊** as needed → **Show answer** → mark
**Right ✓** or **Wrong ✗**. At the end you get a score, the words you missed, and
the option to shuffle and go again or drill only the ones you got wrong.

Keyboard: `Space` replays, `Enter` reveals, `Y` / `N` marks.

## If you hear nothing

Speech uses your device's own voices, so a Dutch voice has to be installed. If it
isn't, the app says so and shows the word as text instead, so you can still practise.

- **iPhone / iPad** — Settings → Accessibility → Spoken Content → Voices
- **Mac** — System Settings → Accessibility → Spoken Content → System Voice → Manage
- **Windows** — Settings → Time & Language → Language → Add a language

## Running it locally

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :5173 |
| `npm test` | Run the test suite |
| `npm run typecheck` | TypeScript, strict |
| `npm run lint` | oxlint |
| `npm run build` | Production build into `dist/` |

## Deploying

Any free static host works. **Cloudflare Pages** is the easiest: connect the repo,
build command `npm run build`, output directory `dist`. Done.

GitHub Pages also works but needs `base: '/practice-vocabulary/'` in
`vite.config.ts` — getting that wrong gives you a blank page, which is the most
common Vite deploy failure. Full instructions, including a ready-made workflow:
[`deployment.md`](.claude/specs/001-vocab-trainer/deployment.md).

Note that **HTTPS is required** — speech synthesis is blocked outside a secure
context, so opening `dist/index.html` from disk will be silent.

## Browser support

Current Chrome, Edge, Safari (including iOS) and Firefox. Voice availability varies
by device rather than by browser.

## How it's built

Vite · React · TypeScript (strict) · Tailwind · Vitest. Two runtime dependencies:
`react` and `react-dom`.

The interesting parts are all pure functions with thorough tests —
[`src/parse/`](src/parse) turns text into word pairs,
[`src/state/session.ts`](src/state/session.ts) runs the drill, and
[`src/speech/tts.ts`](src/speech/tts.ts) wraps the Web Speech API's various
cross-browser quirks.

Design notes and the full task breakdown live in
[`.claude/specs/001-vocab-trainer/`](.claude/specs/001-vocab-trainer/).
Photographing a textbook page and OCR'ing it is designed but deferred to v2 — see
the appendix in `plan.md`.
