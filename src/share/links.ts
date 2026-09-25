import { LANG_NAMES } from '../lang/languages'
import type { LinkPreview, LinkStatus, ShareLink } from './types'

/** Links expire after 14 days unused (D-7). The rules enforce the same number. */
export const LINK_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000

/** At most 20 people per list, owner included (D-9). The rules enforce the same number. */
export const MAX_MEMBERS = 20

/** The query parameter a share link carries. */
export const JOIN_PARAM = 'join'

/**
 * Derived, never stored, which is why expiry needs no cleanup job (D-7). `now` is a
 * parameter, as everywhere in the pure layer.
 */
export function linkStatus(link: ShareLink, now: number): LinkStatus {
  if (link.uses >= link.maxUses) return { kind: 'used' }
  if (link.declined) return { kind: 'declined' }
  if (now >= link.createdAt + LINK_LIFETIME_MS) return { kind: 'expired' }
  return { kind: 'waiting', joined: link.uses }
}

/** 128 random bits as 22 base64url characters. */
export function newLinkCode(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(16))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function joinUrl(origin: string, code: string): string {
  return `${origin}/?${JOIN_PARAM}=${encodeURIComponent(code)}`
}

export function languagePair(preview: Pick<LinkPreview, 'col1Lang' | 'col2Lang'>): string {
  return `${LANG_NAMES[preview.col2Lang]} → ${LANG_NAMES[preview.col1Lang]}`
}

/** The text that goes into WhatsApp, email, or the share sheet. */
export function shareMessage(preview: LinkPreview, url: string): string {
  const who = preview.ownerName ?? 'Someone'
  const words = `${preview.wordCount} word${preview.wordCount === 1 ? '' : 's'}`
  return `${who} invited you to practise "${preview.listName}" (${words}, ${languagePair(preview)}) in Vocabulary Trainer: ${url}`
}

/**
 * Whether this page is inside an app's embedded browser, where Google refuses to sign
 * anyone in (`disallowed_useragent`). A link opened from Instagram or Facebook lands there,
 * and without this check the join screen would dead-end at sign-in (plan R3).
 *
 * Deliberately a short list of known offenders rather than a guess at "not a real browser":
 * a false positive costs someone a needless "open in your browser" step, a false negative
 * leaves them stuck.
 */
export function isEmbeddedBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|; wv\)/i.test(userAgent)
}
