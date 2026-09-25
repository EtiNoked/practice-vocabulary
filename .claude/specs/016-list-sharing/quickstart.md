# Quickstart: 016-list-sharing

**TL;DR:** Share a list with a link and a QR code: send it over WhatsApp or email, or hold your
phone up. Whoever opens it signs in with Google (which creates an account if they have none) and
joins as **Can edit** or **Can practise**. The owner sees each link's status and can cancel it.
Everyone sees the members. Nobody ever loses their words: whenever a shared list goes away from
you, you can keep a private copy. Every list lives in one `lists` collection, linked to people by
membership. No server, no email provider, no secrets.

---

## The whole thing in one picture

```mermaid
sequenceDiagram
    actor A as Owner
    participant App as App (A)
    participant FS as Firestore
    actor B as Joiner

    A->>App: Share "French verbs" · Can practise · "For Dana"
    App->>FS: create share link (the list stays where it is)
    App-->>A: QR code · Share… · WhatsApp · Email · Copy
    A-->>B: WhatsApp message, email, or QR on screen
    B->>App: opens /?join=code
    App->>FS: read link preview (allowed signed-out)
    App-->>B: Eti invited you to "French verbs" · 42 words · you can practise
    B->>App: Sign in with Google (account created if new) → Join list
    App->>FS: batch: link uses +1, add B as viewer
    FS-->>A: live: link gone, Dana under Members
```

---

## Before → after

| | Before | After |
|---|---|---|
| Where a list lives | `users/{uid}/lists` | `lists/{id}` for every cloud list, same id, moved once on sign-in |
| How lists link to people | By path (under your uid) | By membership (`ownerUid`, `memberUids`, a role each) |
| Private list | A list under your uid | A list whose only member is you |
| Guests' lists | This browser | This browser (unchanged) |
| Who can see a list | Its creator | Private: its creator. Shared: its members |
| How someone is invited | n/a | A link, as a QR code or sent from your own apps |
| Server code | None | None |
| Secrets | None | None |
| Runtime dependencies | react, react-dom | + one tiny QR encoder, lazy-loaded |
| Practice history | Per person | Per person (unchanged, D-6) |

---

## What the owner sees for each link

| Status | Means | Actions |
|---|---|---|
| **Waiting · created 2h ago** | Not used yet | Share again · Cancel link |
| **Declined** | Someone opened it and said no | New link · Remove |
| **Expired** | 14 days, unused | New link · Remove |
| *(gone, now under Members)* | Someone joined through it | Change role · Remove member |

---

## Where things are stored

```
lists/{listId}                   every cloud list: words + owner + members and their roles
shareLinks/{code}                one per link: role, label, uses, preview for the join screen
listFarewells/{listId}_{uid}     "keep a copy?" offers for someone who lost access
users/{uid}/sessions|games|tests your own history and saved tests (unchanged)
users/{uid}/lists                old location: emptied on first sign-in, then unused
```

---

## Who can do what

| | Owner | Can edit | Can practise |
|---|---|---|---|
| Practise, test, games, saved tests | ✓ | ✓ | ✓ |
| See members | ✓ | ✓ | ✓ |
| Edit words, rename, languages | ✓ | ✓ | |
| Keep a private copy | ✓ | ✓ | ✓ |
| Make and cancel links, change roles, remove | ✓ | | |
| Stop sharing, delete for everyone | ✓ | | |
| Leave | | ✓ | ✓ |

---

## When a shared list goes away from you

| What happened | What you see on My lists |
|---|---|
| You leave | Asked right then: **Leave and keep a copy** or **Leave** |
| The owner removes you | "Eti removed you from "French verbs"." **Keep a private copy** / **Dismiss** |
| The owner stops sharing | "Eti stopped sharing "French verbs" with you." same choice |
| The owner deletes it | "Eti deleted "French verbs"." same choice |

The copy is the last version you could see, as a new list of your own. It remembers the list it
came from, so your practice history and "words you missed" come with it, and your saved tests are
switched over to it.

---

## Running it locally

```bash
npm install
npm run dev                      # app on :5173
npm run test:rules               # rules + adapters against the emulator
```

To try the joiner side, sign in as a second Google account in a private window and open the link
the Share panel gives you (it points at `http://localhost:5173/?join=<code>`). To try the QR code
on a phone, open the app at the **Network** address `npm run dev` prints (it already binds
`--host`), so the link it makes is reachable from the phone. Signing in there needs that address in
Firebase's authorised domains.

---

## Where to read more

- The why, decisions and stories: [`spec.md`](spec.md)
- Data model, rules, merge, QR, join screen, risks: [`plan.md`](plan.md)
- The ordered build: [`tasks.md`](tasks.md)
