import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFirebaseAuth } from './firebaseAuth'
import { AUTH_HINT_KEY, readAuthHint } from './types'

const googleUser = {
  uid: 'u1',
  displayName: 'Eti',
  email: 'eti@example.com',
  photoURL: 'https://example.com/a.png',
}

const signInWithPopup = vi.fn()
const signOutFn = vi.fn()
const onAuthStateChanged = vi.fn()

vi.mock('./firebase', () => ({
  loadFirebase: () => loadFirebaseMock(),
  clearFirestoreCache: async () => {},
  resetFirebaseForTests: () => {},
}))

let loadFirebaseMock: () => Promise<unknown>

/** A Firebase error carries a `code`; the adapter branches entirely on that. */
const authError = (code: string): Error & { code: string } =>
  Object.assign(new Error(code), { code })

beforeEach(() => {
  localStorage.clear()
  signInWithPopup.mockReset()
  signOutFn.mockReset()
  onAuthStateChanged.mockReset()
  onAuthStateChanged.mockImplementation(() => () => {})
  loadFirebaseMock = () =>
    Promise.resolve({
      auth: { currentUser: null },
      sdk: { signInWithPopup, signOut: signOutFn, onAuthStateChanged },
    })
})

describe('signIn', () => {
  it('returns the mapped user and sets the device hint on success', async () => {
    signInWithPopup.mockResolvedValue({ user: googleUser })
    const result = await createFirebaseAuth().signIn()

    expect(result).toEqual({ ok: true, user: googleUser })
    expect(readAuthHint()).toBe(true)
  })

  it('maps a closed popup to a neutral cancelled outcome', async () => {
    signInWithPopup.mockRejectedValue(authError('auth/popup-closed-by-user'))
    const result = await createFirebaseAuth().signIn()

    // Closing the popup is a normal thing to do. It must not read as an error,
    // and it must not leave a hint that makes the next boot load Firebase.
    expect(result).toEqual({ ok: false, reason: 'cancelled' })
    expect(readAuthHint()).toBe(false)
  })

  it('maps a superseded popup request to cancelled', async () => {
    signInWithPopup.mockRejectedValue(authError('auth/cancelled-popup-request'))
    expect(await createFirebaseAuth().signIn()).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('maps a blocked popup to its own actionable outcome', async () => {
    signInWithPopup.mockRejectedValue(authError('auth/popup-blocked'))
    expect(await createFirebaseAuth().signIn()).toEqual({ ok: false, reason: 'blocked' })
  })

  it('maps a network failure', async () => {
    signInWithPopup.mockRejectedValue(authError('auth/network-request-failed'))
    expect(await createFirebaseAuth().signIn()).toEqual({ ok: false, reason: 'network' })
  })

  it('reports a failed chunk load without throwing', async () => {
    loadFirebaseMock = () => Promise.reject(new Error('chunk load failed'))
    expect(await createFirebaseAuth().signIn()).toEqual({ ok: false, reason: 'load-failed' })
  })

  it('ignores a second concurrent call rather than opening two popups', async () => {
    let release: (v: unknown) => void = () => {}
    signInWithPopup.mockReturnValue(new Promise((r) => (release = r)))

    const auth = createFirebaseAuth()
    const first = auth.signIn()
    const second = auth.signIn()

    release({ user: googleUser })
    await first
    expect(await second).toEqual({ ok: false, reason: 'cancelled' })
    expect(signInWithPopup).toHaveBeenCalledTimes(1)
  })
})

describe('signOut', () => {
  it('clears the device hint', async () => {
    localStorage.setItem(AUTH_HINT_KEY, '1')
    signOutFn.mockResolvedValue(undefined)
    await createFirebaseAuth().signOut()
    expect(readAuthHint()).toBe(false)
  })

  it('clears the hint even when the SDK call fails', async () => {
    // Otherwise a user who signed out on a flaky connection boots into a
    // "restoring" state forever.
    localStorage.setItem(AUTH_HINT_KEY, '1')
    signOutFn.mockRejectedValue(new Error('offline'))
    await createFirebaseAuth().signOut()
    expect(readAuthHint()).toBe(false)
  })
})

describe('subscribe', () => {
  it('maps the Firebase user onto AuthUser and sets the hint', async () => {
    let emit: (u: unknown) => void = () => {}
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      emit = cb
      return () => {}
    })

    const seen: Array<unknown> = []
    createFirebaseAuth().subscribe((u) => seen.push(u))
    await vi.waitFor(() => expect(onAuthStateChanged).toHaveBeenCalled())

    emit({ ...googleUser, extraSdkField: 'ignored' })
    expect(seen).toEqual([googleUser])
    expect(readAuthHint()).toBe(true)
  })

  it('emits null and clears the hint when the session ends', async () => {
    localStorage.setItem(AUTH_HINT_KEY, '1')
    let emit: (u: unknown) => void = () => {}
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      emit = cb
      return () => {}
    })

    const seen: Array<unknown> = []
    createFirebaseAuth().subscribe((u) => seen.push(u))
    await vi.waitFor(() => expect(onAuthStateChanged).toHaveBeenCalled())

    emit(null)
    expect(seen).toEqual([null])
    expect(readAuthHint()).toBe(false)
  })

  it('stops delivering after unsubscribe, even if the SDK emits late', async () => {
    let emit: (u: unknown) => void = () => {}
    onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      emit = cb
      return () => {}
    })

    const seen: Array<unknown> = []
    const unsubscribe = createFirebaseAuth().subscribe((u) => seen.push(u))
    await vi.waitFor(() => expect(onAuthStateChanged).toHaveBeenCalled())
    unsubscribe()
    emit(googleUser)

    expect(seen).toEqual([])
  })

  it('treats a failed chunk load as signed out rather than hanging', async () => {
    loadFirebaseMock = () => Promise.reject(new Error('chunk load failed'))
    const seen: Array<unknown> = []
    createFirebaseAuth().subscribe((u) => seen.push(u))
    await vi.waitFor(() => expect(seen).toEqual([null]))
  })
})
