# Vocabulary Trainer

A small web app for practising vocabulary by **listening**. English, Dutch and
French, in any pairing — English↔Dutch, Dutch↔French, French↔English.

Put a word list in — type it, paste it from a spreadsheet, or upload a file — then
drill yourself. The app reads **column 2** aloud and keeps **column 1** hidden as the
answer. Hear it again as often as you like, reveal both columns to check, mark
yourself right or wrong, and get a score at the end.

**Works with no account at all.** Signed out, everything runs in your browser and nothing
you type ever leaves your device — exactly as it always has.

**Or sign in with Google** and your lists follow you between devices, with every finished
drill recorded so you can see whether you're improving. Signing in is an upgrade, never a
gate: the app is fully usable without it, and a signed-out visitor downloads no
account-related code at all.

The first thing you see is that choice — **Sign in with Google** or **Continue as guest** —
on a screen of its own, asked once per browser session rather than as a banner above your
lists on every visit. Continuing as a guest is a first-class answer, not a way of putting
the question off.

## Accounts

| | Signed out | Signed in |
|---|---|---|
| Where lists live | This browser (`localStorage`) | Your own private area of Firestore |
| Other devices | No | Yes |
| Score history | This browser | Your account |
| Data sent anywhere | None | Your name, email, lists and scores |
| Offline | Yes | Yes — cached, and changes sync on reconnect |

Signing in for the first time offers to copy this device's lists into your account. It's
opt-in, it never deletes the local copies, and running it twice can't duplicate anything.

Once signed in, your Google picture sits in the top corner of every screen. Behind it are
**Sign out** and **Delete my account**. Signed out but still using the app, that corner
holds a small **Sign in** instead, so syncing is always one tap away without the home
screen advertising it.

Signing out clears the cached copy of your cloud data from the device and returns you to
that first screen. If a drill is running it asks first, because ending it there means it
is not recorded. **Delete my account** removes your lists, your history and the account
itself, permanently.

Your data is readable only by you — enforced by Firestore security rules on the server, not
by the app. Lists you had before signing in are never touched by any of this.

### Running it yourself

Sign-in needs a Firebase project. Copy `.env.example` to `.env.local` and fill in the values
from **Firebase console → Project settings → Your apps → Web app**. Without them the app
still runs, signed-out only, and never offers sign-in. Setup is in
[`.claude/specs/003-user-accounts/quickstart.md`](.claude/specs/003-user-accounts/quickstart.md).

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

**Pick them from the two dropdowns** in the editor. That is the reliable way, and
your choice is saved with the list.

The app also fills them in for you. Name the languages in the first row — `English`
and `Dutch`, or `Nederlands` and `Frans` — and it reads them straight from there.
Failing that it guesses from spelling patterns and shows an amber **(guessed)**
badge. When it can't tell, it says so rather than picking: a French column read in
an English voice is worse than being asked.

Got the columns the wrong way round? **Swap columns ⇄** exchanges the words and
their languages together.

## Practising

Start → hear the word → **Hear it again 🔊** as needed → **Show answer** → mark
**Right ✓** or **Wrong ✗**. At the end you get a score, the words you missed, and
the option to shuffle and go again or drill only the ones you got wrong.

Keyboard: `Space` replays, `Enter` reveals, `Y` / `N` marks.

## If you hear nothing

Speech uses your device's own voices, so a voice for the language being read has to
be installed. If it isn't, the app names the missing language and shows the word as
text instead, so you can still practise.

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

Every colour, type size, radius and shadow in the app is defined once, in
[`src/index.css`](src/index.css), and nothing outside that file names a raw Tailwind
palette colour. Shared `.btn` / `.card` / `.field` classes live there too, which is where
the 44px minimum touch target is enforced — it used to be a convention retyped at every
call site, and a convention is not something a test can check.

The typeface is [Lexend](https://github.com/googlefonts/lexend), self-hosted and served
from `src/assets/fonts/` under the SIL Open Font License. It was chosen because its design
brief is reading proficiency, which is the actual job here; self-hosted because the app's
Content-Security-Policy allows no third-party font host and should stay that way.

**The app is light-only.** Dark mode was removed deliberately, not lost: one palette gets
designed well where two get designed adequately. Because every value lives in one place,
a dark theme would come back as a second block of the same token names rather than as the
83 hand-picked `dark:` class pairs it used to be. `src/test/theme.test.ts` fails if one
reappears by accident.

Adding a fourth language is a data change: one entry in
[`src/lang/languages.ts`](src/lang/languages.ts) — a voice tag, a display name,
the words that name it in a header row, and a spelling profile — and nothing else
anywhere. `languages.test.ts` fails if any of the four is missed.

The interesting parts are all pure functions with thorough tests —
[`src/parse/`](src/parse) turns text into word pairs and works out which column
holds which language,
[`src/state/session.ts`](src/state/session.ts) runs the drill, and
[`src/speech/tts.ts`](src/speech/tts.ts) wraps the Web Speech API's various
cross-browser quirks.

Design notes and the full task breakdown live in
[`.claude/specs/001-vocab-trainer/`](.claude/specs/001-vocab-trainer/).
Photographing a textbook page and OCR'ing it is designed but deferred to v2 — see
the appendix in `plan.md`.
