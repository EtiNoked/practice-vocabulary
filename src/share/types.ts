import type { LangCode } from '../lang/languages'
import type { ListRole, WordList } from '../state/types'
import type { StoreError, Unsubscribe, WriteFailureReason, WriteResult } from '../storage/types'

/** What someone opening a link sees before they can read the list itself. */
export interface LinkPreview {
  listName: string
  ownerName: string | null
  wordCount: number
  col1Lang: LangCode
  col2Lang: LangCode
}

/**
 * A share link (016 D-1). The `code` is the document id and the secret in the URL: 128
 * random bits, so it can be passed on but never found by trying.
 */
export interface ShareLink {
  code: string
  listId: string
  role: Exclude<ListRole, 'owner'>
  /** "For Dana". Optional; shown to the owner, and under Members as "joined via". */
  label: string | null
  /** 1 for a one-person link (the default, D-4); up to 20 for a group link. */
  maxUses: number
  uses: number
  declined: boolean
  createdByUid: string
  /** Epoch ms. A server timestamp in Firestore, so expiry never trusts a client clock. */
  createdAt: number
  preview: LinkPreview
}

/** A "keep a copy?" offer to someone who lost access to a shared list (D-11). */
export interface Farewell {
  id: string
  uid: string
  listId: string
  reason: 'removed' | 'stopped' | 'deleted'
  byName: string | null
  at: number
  /** The list as they last saw it. */
  list: WordList
}

export type LinkStatus =
  | { kind: 'waiting'; joined: number }
  | { kind: 'declined' }
  | { kind: 'expired' }
  | { kind: 'used' }

export type JoinFailure =
  /** Cancelled by the owner, or never existed. */
  | 'unavailable'
  | 'expired'
  | 'used'
  | 'declined'
  /** The caller made this link. */
  | 'own'
  | 'full'
  | 'offline'
  | 'network'

export type JoinOutcome = { ok: true; listId: string; already: boolean } | { ok: false; reason: JoinFailure }

export interface NewLink {
  role: ShareLink['role']
  label: string | null
  maxUses: number
}

/**
 * Everything sharing does. Firestore only: a guest's local lists have no members and cannot
 * be shared, so there is no local implementation and `useShareStore` is null for guests.
 */
export interface ShareStore {
  createLink(
    list: WordList,
    options: NewLink,
  ): Promise<{ ok: true; link: ShareLink } | { ok: false; reason: WriteFailureReason }>
  subscribeLinks(listId: string, onChange: (links: ShareLink[]) => void, onError: (e: StoreError) => void): Unsubscribe
  cancelLink(code: string): Promise<WriteResult>
  join(code: string): Promise<JoinOutcome>
  decline(code: string): Promise<WriteResult>
  setRole(list: WordList, uid: string, role: ShareLink['role']): Promise<WriteResult>
  removeMember(list: WordList, uid: string): Promise<WriteResult>
  leave(list: WordList, options: { keepCopy: boolean }): Promise<WriteResult>
  stopSharing(list: WordList): Promise<WriteResult>
  subscribeFarewells(onChange: (farewells: Farewell[]) => void, onError: (e: StoreError) => void): Unsubscribe
  keepCopy(farewell: Farewell): Promise<WriteResult>
  dismiss(farewell: Farewell): Promise<WriteResult>
  dispose(): Promise<void>
}
