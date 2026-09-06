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

## Finding your way around

The home screen is a **brief**: how your last practice and last game went, how you have
been averaging lately, and four places to go.

| | What is there |
|---|---|
| **My lists** | Your word lists, and **New list** |
| **My tests** | Tests you have saved, and **Build a test** |
| **My games** | Rounds you have played, and **Play a game** |
| **My practices** | Every finished drill, grouped by day and filterable by list |

The same four are in the **menu** in the top corner, with an icon each, from every screen
in the app. Whichever section you are inside — the list editor, the test builder, a game —
the menu marks it, and leaving something unfinished asks first and says exactly what you
would lose.

Each list also shows how it has been going: *"5 practices · last 80%"* under its name,
which opens **My practices** already filtered to that list. A test that spanned three
lists counts as **one** practice for each of them, not three.

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

Two modes, chosen fresh each time you start — the choice belongs to the run, not to
the list.

### Practice — no score, no pressure

Hear the word, see it spelled, and have a go. The translation starts **covered**, and
**Reveal answer 👁** uncovers it whenever you want it. Move with **Next** and
**Previous**; nothing is marked and nothing is recorded.

Uncover once and it **stays uncovered for the rest of the run**, so a list you already
half-know doesn't mean tapping the eye forty times. Cover it again and that sticks too.
Every new run starts covered.

Keyboard: `Space` replays, `A` shows the answer, `→` next, `←` previous.

### Test — answer from memory, and mark yourself

Start → hear the word → **Hear it again 🔊** as needed → **Show answer** → mark
**Right ✓** or **Wrong ✗**. At the end you get a score, the words you missed, and
the option to shuffle and go again or drill only the ones you got wrong.

Keyboard: `Space` replays, `Enter` reveals, `Y` / `N` marks.

## Building a test

A drill covers one list. **My tests → Build a test** covers as many as you like, and lets
you say how much of them you want.

Pick your lists, choose **All words** or **Words I got wrong**, and set a length: **10**,
**15**, **20**, type a number, or **All**. The words are drawn at random. The screen keeps
a running count of how many words your selection actually has, so you decide against a
real number rather than a guess.

Lists have to share a language pair — you hear one language and answer in the other, and a
lone French option among five Dutch ones would give itself away. Incompatible lists stay
visible but disabled, with their own pair shown as the reason.

Then **Practice** or **Test**, exactly as on a single list.

### Two ways to go again

At the end you get both, and they are not the same thing:

- **Shuffle & restart** — the *same* words, in a new order.
- **Another 15, freshly drawn** — a *different* fifteen from the same pool. Only offered
  when there are more words to draw than you asked for.

The second one re-draws from the pool as it was when you started, so the length you chose
still means what it meant even if a list changed in another tab meanwhile.

### Saving a test

**Save this test** gives it a name and puts it under **My tests**, with its setup written
out — *"3 lists · words I got wrong · 15 of 34"*.

A saved test is a **definition, not a snapshot**. It stores which lists, which words and
how many — never the words themselves. Run it next month and it asks about your mistakes
*then*, not the ones you had the day you saved it. The count on each row is worked out
fresh every time you look at it, for the same reason.

Delete a list a saved test uses and the test stays put, saying it has no lists left. It is
never quietly repaired or removed — that would leave you with a test that has silently
become a different test.

### In your history

A test over three lists is filed against each of those lists, so its misses turn up in the
right list's *words you missed* chips. But it is still **one test**: My practices shows it
as a single row with its own score, and it counts once towards the average on your home
screen. Each list's share sits underneath, and opening one shows that list's answer
sheet.

## Reviewing what you got wrong

**My practices** lists every finished drill, newest first, grouped under Today, Yesterday
and dated headings, and filterable by list. Open one and you get the whole answer sheet:
the words you missed, and the words you got right.

Every practice — there and on the drill's own page — is bordered by how it went: **green** for a clean sweep, **amber** from 70% up,
**red** below that. Green means every card, not a percentage that rounded to 100, so
199/200 reads amber and the fraction printed beside it explains why. The numbers are always
there in text; a border colour on its own is no use to a colour-blind reader or a greyscale
screenshot.

From a list's start screen you can also drill **just the words you are still getting
wrong**, over **Today**, **This week**, **This month** or **All time**. Each chip shows
how many words it would drill.

"Still getting wrong" is meant literally. A word counts only if the **most recent** time
you saw it in that window, you missed it — answer it correctly later and it drops out on
its own, so the set shrinks as you learn. Those runs are logged as *missed words only* and
kept out of your full-run average, exactly as the wrong-only re-run already was.

Two things worth knowing:

- Words are matched **by what they say**, not by an internal id — so fixing a typo in one
  word does not lose the practice history for the rest of the list. Change what a word
  *says*, though, and it counts as a new word with a clean slate.
- Drills finished **before this feature shipped** only recorded the words you got wrong,
  never the ones you got right. History is append-only by design, so there is no backfill:
  those drills show a line saying so rather than pretending you scored zero.

## Playing a game

**My games → Play a game** is the drill's faster, noisier
sibling. You hear a word and grab its meaning from a cloud of ten before a ten-second
clock runs out, and the clock *is* the score: tap while it reads 7 and you bank 7. Wrong
scores nothing, and says so three ways at once — the tile you tapped, the tile you should
have tapped, and a line naming the answer.

Setting one up takes three choices:

- **Which lists.** Several at once, and the running total tells you how many words you
  have before you commit to anything. A word in two lists counts once.
- **All words, or just the ones you keep getting wrong** — the same "still getting wrong"
  set the drill offers, pooled across every list you picked.
- **How many words.** 10, 15 or 20, or type a number. Options bigger than your pool are
  disabled rather than hidden, so the reason is on screen.

Lists can only be combined when they share **both** languages. That is partly because
speech needs one language to read in, and mostly because a lone French option among five
Dutch ones can be picked out with no vocabulary at all.

At the end you get your score, your correct count, and the words worth another look.
**Play again** keeps your settings and deals a completely new set of words; **New game**
takes you back to setup with those settings already filled in.

Two things worth knowing:

- **Games count.** A word you miss in a game joins the same *words you got wrong* pool the
  drill fills, so you can drill it properly afterwards — and a word you get right leaves
  it again. Game scores are kept in their own history and never folded into your drill
  average, because marking yourself and being marked are not the same measurement.
- **A game does not survive a reload**, unlike a drill in progress. There is no honest
  answer to how much of the ten seconds was left, and the word could not be re-spoken on
  the way back in — a silent, mis-timed round is worse than starting again.

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

**Choosing words from settings is one shared function**, not something each feature does
its own way. [`src/state/wordPool.ts`](src/state/wordPool.ts) turns a small declarative
spec — these lists, all words or just my misses — into the words themselves, deduped
across lists and tagged with where each came from. The game is its first caller rather
than its owner, and it knows nothing about games: how many to take, and what to do with
them, belongs to whoever asked.

The typeface is [Lexend](https://github.com/googlefonts/lexend), self-hosted and served
from `src/assets/fonts/` under the SIL Open Font License. It was chosen because its design
brief is reading proficiency, which is the actual job here; self-hosted because the app's
Content-Security-Policy allows no third-party font host and should stay that way.

**Dark mode is a second block of the same token names**, and nothing else. It was removed
in 005 as 83 hand-picked `dark:` class pairs and came back in 007 as nineteen redefined
custom properties — no component knows which theme it is in, and `src/test/theme.test.ts`
still fails if a `dark:` variant reappears anywhere in `src/`.

It offers **System, Light and Dark**, from the menu behind the avatar (or, where there is
no Firebase project and so no avatar, from the same corner slot on its own). System is the
default, and it costs no JavaScript: the OS preference is answered by a
`prefers-color-scheme` media query in CSS, so the first frame is already right. Only an
explicit override reaches for storage — a `data-theme` attribute written by
[`src/theme/theme.ts`](src/theme/theme.ts) before React renders. That split is not
incidental; the usual anti-flash trick, a blocking inline `<script>`, is barred by the
app's own CSP.

Two rules follow from having two palettes. A colour must be defined in **all three** blocks
or none — one defined only in light silently keeps its light value in dark. And a filled
control names its foreground with a `--color-*-ink` token rather than a literal, because
`--color-correct` is a dark green in light and a light green in dark, and white only works
on one of them.

Practice history is a **log, not a document**. A finished drill is written once and never
updated — `allow update: if false` in [`firestore.rules`](firestore.rules) enforces that on
the server, so no client bug can rewrite a past score. That is also why the right-answer
snapshot added in 006 can never be backfilled onto an older record, and why the review
screen explains the gap instead of inventing data to fill it.

The one genuinely subtle rule in the codebase is that **`WordPair.id` is not a word
identity**. The list editor re-mints every pair id on every save, so the same untouched
word has a different id before and after any edit. Anything comparing words across drills
goes through `wordKey` in [`src/state/missedWords.ts`](src/state/missedWords.ts), which
keys on the normalised text; [`src/test/invariants.test.ts`](src/test/invariants.test.ts)
fails the build if a second route appears. Getting this wrong produces no error at all —
just a missed-words list that quietly empties itself weeks later.

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
