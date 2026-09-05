import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useListStore } from './useListStore'
import { AuthProvider } from '../auth/AuthContext'
import { createAuthStore, type AuthStore } from '../auth/authStore'
import type { AuthPort, AuthUser } from '../auth/types'
import { listRepo } from './listRepo'
import type { WordList } from '../state/types'

const loadFirebase = vi.fn()
vi.mock('../auth/firebase', () => ({
  loadFirebase: () => loadFirebase(),
  resetFirebaseForTests: () => {},
}))

const disposeSpy = vi.fn()
vi.mock('./firestoreListStore', () => ({
  createFirestoreListStore: (_s: unknown, uid: string) => ({
    __kind: 'firestore',
    uid,
    subscribeLists: (cb: (l: WordList[]) => void) => {
      cb([])
      return () => {}
    },
    subscribeSessions: () => () => {},
    saveList: async () => ({ ok: true }),
    renameList: async () => ({ ok: true }),
    removeList: async () => ({ ok: true }),
    recordSession: async () => ({ ok: true }),
    dispose: async () => disposeSpy(uid),
  }),
  stripUndefined: <T,>(v: T) => v,
}))

const user: AuthUser = { uid: 'u1', displayName: 'Eti', email: 'e@x.com', photoURL: null }

const seeded: WordList = {
  id: 'seed',
  name: 'Lesson 3',
  col1Lang: 'en',
  col2Lang: 'nl',
  langSource: 'header',
  pairs: [{ id: 'p1', col1: 'daughter', col2: 'dochter' }],
  createdAt: 1,
  updatedAt: 1,
  origin: 'manual',
}

function portFor(u: AuthUser | null): AuthPort {
  return {
    subscribe: (cb) => {
      cb(u)
      return () => {}
    },
    signIn: async () => ({ ok: true, user: u ?? user }),
    signOut: async () => {},
    deleteAccount: async () => ({ ok: true }),
  }
}

const wrapperFor = (store: AuthStore) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <AuthProvider store={store}>{children}</AuthProvider>
  }

/**
 * An auth store parked permanently in `resolving`.
 *
 * The snapshot is hoisted rather than built inline: useSyncExternalStore loops
 * forever if getSnapshot returns a fresh object each call.
 */
const RESOLVING = { status: 'resolving', user: null, available: true } as const
const resolvingStore = (): AuthStore => ({
  subscribe: () => () => {},
  getSnapshot: () => RESOLVING,
  signIn: async () => ({ ok: false, reason: 'cancelled' }),
  signOut: async () => {},
  deleteAccount: async () => ({ ok: true }),
})

beforeEach(() => {
  localStorage.clear()
  loadFirebase.mockReset()
  disposeSpy.mockReset()
  loadFirebase.mockResolvedValue({ db: {}, fs: {} })
})

describe('while auth is resolving', () => {
  it('hands back no store at all', () => {
    const { result } = renderHook(() => useListStore(), { wrapper: wrapperFor(resolvingStore()) })
    // Attributing the previous store's data to an unknown identity is worse
    // than showing nothing for a moment.
    expect(result.current.store).toBeNull()
  })

  it('does not load Firebase', () => {
    renderHook(() => useListStore(), { wrapper: wrapperFor(resolvingStore()) })
    expect(loadFirebase).not.toHaveBeenCalled()
  })
})

describe('signed out', () => {
  const guestStore = () =>
    createAuthStore({ port: portFor(null), configured: true, hasHint: false })

  it('uses localStorage', async () => {
    listRepo.save(seeded)
    const { result } = renderHook(() => useListStore(), { wrapper: wrapperFor(guestStore()) })

    await waitFor(() => expect(result.current.store).not.toBeNull())
    const seen: WordList[][] = []
    result.current.store!.subscribeLists((l) => seen.push(l), () => {})
    expect(seen[0]![0]!.name).toBe('Lesson 3')
  })

  it('NEVER loads Firebase', async () => {
    // This is the property the whole bundle budget rests on (NFR4a). If it ever
    // regresses, a guest starts paying ~200 KB gzipped for a feature they are
    // not using.
    const { result } = renderHook(() => useListStore(), { wrapper: wrapperFor(guestStore()) })
    await waitFor(() => expect(result.current.store).not.toBeNull())
    expect(loadFirebase).not.toHaveBeenCalled()
  })
})

describe('signed in', () => {
  const signedIn = () =>
    createAuthStore({ port: portFor(user), configured: true, hasHint: true })

  it('builds a Firestore store scoped to the uid', async () => {
    const { result } = renderHook(() => useListStore(), { wrapper: wrapperFor(signedIn()) })

    await waitFor(() => expect(result.current.store).not.toBeNull())
    expect(loadFirebase).toHaveBeenCalled()
    expect(result.current.store as unknown as { __kind: string; uid: string }).toMatchObject({
      __kind: 'firestore',
      uid: 'u1',
    })
  })

  it('falls back to local storage when the Firebase chunk will not load', async () => {
    loadFirebase.mockRejectedValue(new Error('offline'))
    listRepo.save(seeded)

    const { result } = renderHook(() => useListStore(), { wrapper: wrapperFor(signedIn()) })
    await waitFor(() => expect(result.current.store).not.toBeNull())

    // A cloud store we cannot build must not take the app down with it.
    expect(result.current.error).toMatch(/couldn't reach your account/i)
    const seen: WordList[][] = []
    result.current.store!.subscribeLists((l) => seen.push(l), () => {})
    expect(seen[0]![0]!.name).toBe('Lesson 3')
  })

  it('disposes the store on unmount, so no listener outlives the session', async () => {
    const { result, unmount } = renderHook(() => useListStore(), {
      wrapper: wrapperFor(signedIn()),
    })
    await waitFor(() => expect(result.current.store).not.toBeNull())
    unmount()
    await waitFor(() => expect(disposeSpy).toHaveBeenCalledWith('u1'))
  })
})
