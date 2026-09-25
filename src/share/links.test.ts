import { describe, expect, it } from 'vitest'
import { isEmbeddedBrowser, joinUrl, LINK_LIFETIME_MS, linkStatus, newLinkCode, shareMessage } from './links'
import type { ShareLink } from './types'

const link = (over: Partial<ShareLink> = {}): ShareLink => ({
  code: 'c',
  listId: 'l1',
  role: 'editor',
  label: null,
  maxUses: 1,
  uses: 0,
  declined: false,
  createdByUid: 'a',
  createdAt: 1_000,
  preview: { listName: 'French verbs', ownerName: 'Eti', wordCount: 42, col1Lang: 'en', col2Lang: 'fr' },
  ...over,
})

describe('linkStatus (derived, never stored: D-7)', () => {
  it('is waiting until 14 days have passed, and expired from that exact millisecond', () => {
    expect(linkStatus(link(), 1_000 + LINK_LIFETIME_MS - 1)).toEqual({ kind: 'waiting', joined: 0 })
    expect(linkStatus(link(), 1_000 + LINK_LIFETIME_MS)).toEqual({ kind: 'expired' })
  })

  it('counts who has joined a group link', () => {
    expect(linkStatus(link({ maxUses: 20, uses: 7 }), 2_000)).toEqual({ kind: 'waiting', joined: 7 })
  })

  it('a used-up link is used, even once it would have expired', () => {
    expect(linkStatus(link({ uses: 1 }), 1_000 + 2 * LINK_LIFETIME_MS)).toEqual({ kind: 'used' })
  })

  it('a declined link is declined', () => {
    expect(linkStatus(link({ declined: true }), 2_000)).toEqual({ kind: 'declined' })
  })
})

describe('newLinkCode', () => {
  it('is 22 url-safe characters carrying 128 bits', () => {
    const code = newLinkCode((b) => b.fill(255))
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(code).not.toMatch(/[+/=]/)
  })

  it('differs every time with the real random source', () => {
    expect(newLinkCode()).not.toBe(newLinkCode())
  })
})

describe('the message that gets sent', () => {
  it('names who, what, how big, which languages, and carries the link', () => {
    const url = joinUrl('https://vocab.example', 'abc')
    expect(url).toBe('https://vocab.example/?join=abc')
    expect(shareMessage(link().preview, url)).toBe(
      'Eti invited you to practice "French verbs" (42 words, French → English) in Vocabulary Trainer: https://vocab.example/?join=abc',
    )
  })

  it('says "1 word", and "Someone" when there is no name', () => {
    expect(shareMessage({ ...link().preview, wordCount: 1, ownerName: null }, 'u')).toMatch(/^Someone .*\(1 word,/)
  })
})

describe('isEmbeddedBrowser (plan R3: Google refuses to sign in there)', () => {
  const cases: Array<[string, boolean]> = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0', true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]', true],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36', true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.0.0', true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', false],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36', false],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', false],
  ]
  it.each(cases)('%s → %s', (ua, expected) => {
    expect(isEmbeddedBrowser(ua)).toBe(expected)
  })
})
