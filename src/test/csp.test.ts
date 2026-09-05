import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs: tsconfig.app.json deliberately omits Node types
// so app code cannot reach for Node APIs, and a test should not be the reason
// that restriction gets loosened.
import html from '../../index.html?raw'

/**
 * The Content-Security-Policy is easy to get wrong and fails in a way that is
 * hard to read: Firebase surfaces a blocked script as `auth/internal-error`,
 * and the real cause is only visible in the browser console.
 *
 * v1's policy was `default-src 'self'` with `connect-src 'self'`, which is
 * exactly right for an app that makes no network requests — and silently breaks
 * sign-in the moment one is added. These tests pin the origins Firebase needs
 * so that regression is a failing test rather than a support conversation.
 */


const csp = (): string => {
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
  if (!match?.[1]) throw new Error('No CSP meta tag found in index.html')
  return match[1]
}

const directive = (name: string): string => {
  const found = csp()
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `))
  return found ?? ''
}

describe('the policy exists at all', () => {
  it('is present', () => {
    expect(() => csp()).not.toThrow()
  })

  it('still defaults to self', () => {
    expect(directive('default-src')).toBe("default-src 'self'")
  })
})

describe('origins Firebase Auth needs', () => {
  it('allows the gapi loader that signInWithPopup pulls in', () => {
    // Without this the popup dies as `auth/internal-error`.
    expect(directive('script-src')).toContain('https://apis.google.com')
  })

  it('allows the Auth REST endpoints', () => {
    expect(directive('connect-src')).toContain('https://identitytoolkit.googleapis.com')
    expect(directive('connect-src')).toContain('https://securetoken.googleapis.com')
  })

  it('allows the authDomain helper iframe and the Google account chooser', () => {
    expect(directive('frame-src')).toContain('firebaseapp.com')
    expect(directive('frame-src')).toContain('https://accounts.google.com')
  })

  it("allows the signed-in user's profile photo", () => {
    expect(directive('img-src')).toContain('googleusercontent.com')
  })
})

describe('origins Firestore needs', () => {
  it('allows the database, including its WebChannel listens', () => {
    expect(directive('connect-src')).toContain('https://firestore.googleapis.com')
  })
})

describe('what must stay locked down', () => {
  it('keeps script-src scoped — no wildcard, no unsafe-inline, no unsafe-eval', () => {
    const scripts = directive('script-src')
    expect(scripts).toContain("'self'")
    expect(scripts).not.toContain("'unsafe-inline'")
    expect(scripts).not.toContain("'unsafe-eval'")
    // A bare `https:` would permit any host on the internet.
    expect(scripts).not.toMatch(/\shttps:(\s|$)/)
  })

  it('never opens connect-src to the whole internet', () => {
    expect(directive('connect-src')).not.toMatch(/\shttps:(\s|$)/)
    expect(directive('connect-src')).not.toContain('*')
  })

  it('keeps the v1 hardening', () => {
    expect(csp()).toContain("base-uri 'none'")
    expect(csp()).toContain("form-action 'none'")
    expect(csp()).toContain("object-src 'none'")
  })

  it('admits no third-party CDN, font host or analytics', () => {
    const policy = csp()
    for (const host of ['cdn', 'unpkg', 'jsdelivr', 'fonts.googleapis', 'analytics']) {
      expect(policy).not.toContain(host)
    }
  })
})
