# Deployment: free hosting options

**Feature ID:** 001-vocab-trainer

The app is a pure static site — HTML, CSS, JS and WASM, no server, no database, no secrets. That means
every free static host works, and none of them will ever bill you. Below, in order of how little can
go wrong.

## Recommendation

**Use Cloudflare Pages.** The reason is narrow and practical: GitHub Pages serves a project site from
`https://user.github.io/repo-name/`, which forces a `base: '/repo-name/'` setting in `vite.config.ts`.
Getting that wrong produces a deployed page that is completely blank with 404s on every asset, and it
is the single most common Vite deployment failure. Cloudflare Pages serves from a domain root, so the
setting does not exist and neither does the failure mode.

You also get a shorter URL (`practice-vocabulary.pages.dev`), which matters when the app is opened on
a phone.

| | Cloudflare Pages | GitHub Pages | Netlify | Vercel |
|---|---|---|---|---|
| Cost | Free | Free | Free tier | Free hobby tier |
| Bandwidth | Unlimited | 100 GB/mo soft | 100 GB/mo | 100 GB/mo |
| Needs `base` config | No | **Yes** | No | No |
| Setup | Connect repo in UI | Commit a workflow | Connect repo | Connect repo |
| URL | `x.pages.dev` | `user.github.io/x/` | `x.netlify.app` | `x.vercel.app` |
| Custom domain | Free + free SSL | Free + free SSL | Free + free SSL | Free + free SSL |
| Preview per PR | Yes | No | Yes | Yes |
| Extra account | Yes | **No** | Yes | Yes |

Choose GitHub Pages instead if you want zero accounts beyond GitHub. Option B below gives the exact
config, including the `base` setting.

---

## Option A — Cloudflare Pages (recommended)

**One-time, ~5 minutes.**

1. Push the repo to GitHub.
2. Sign up free at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
3. Authorise GitHub and pick the `practice-vocabulary` repo.
4. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: set env var `NODE_VERSION` = `22`
5. **Save and Deploy.**

Live at `https://practice-vocabulary.pages.dev` in about a minute. Every push to `main` redeploys;
every PR gets its own preview URL.

No `vite.config.ts` change is needed — leave `base` unset.

---

## Option B — GitHub Pages (no extra account)

**Step 1 — set the base path.** This is the step that breaks deployments when skipped:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/practice-vocabulary/',   // MUST match the repo name exactly, with both slashes
});
```

**Step 2 — add the workflow** at `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Step 3 —** in the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
(Not "Deploy from a branch". Missing this is the second most common failure.)

**Step 4 —** push to `main`. Live at `https://<username>.github.io/practice-vocabulary/`.

---

## Option C — Netlify / Vercel

Both: connect the repo, build command `npm run build`, publish directory `dist`, no `base` needed.
Equivalent to Cloudflare in effort; Cloudflare's bandwidth terms are simply more generous.

---

## Verifying the deployment

Run these against the **live URL**, not localhost:

- [ ] Page loads with styling intact (blank page or unstyled text ⇒ wrong `base`)
- [ ] DevTools console is free of 404s on `/assets/*`
- [ ] Typing a pair and starting a drill works
- [ ] Pasting a tab-separated list from a spreadsheet parses correctly
- [ ] A word is spoken aloud in the correct language
- [ ] A full drill completes and shows a score
- [ ] Repeat all of the above **on a phone** — that is the real target device
- [ ] Reload the page: saved lists are still listed

## Notes

- **HTTPS is required**, not optional: the Web Speech API and camera capture are gated behind a secure
  context. All four hosts serve HTTPS by default, so this is automatic — but it means `file://` and
  plain-HTTP testing will silently break speech.
- **First load is light.** v1 has two runtime dependencies and makes no external requests after the
  page loads — no CDN, no fonts, no analytics. (v2's OCR would add a ~15 MB one-time language-data
  fetch and need a CSP exception for the CDN.)
- **Custom domain** is free on all four if you already own a domain — add a CNAME in the host's UI.
- **No secrets, ever.** There are no API keys in this design, so a public repo carries no exposure.
  If cloud OCR is ever adopted, that changes: the key would need a serverless proxy, and this
  document would need a section on it.
