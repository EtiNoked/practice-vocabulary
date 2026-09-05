import { describe, expect, it } from 'vitest'
import { MissingFirebaseConfigError, hasFirebaseConfig, readFirebaseConfig } from './config'

const complete = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'p.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'p',
  VITE_FIREBASE_STORAGE_BUCKET: 'p.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1',
  VITE_FIREBASE_APP_ID: '1:1:web:1',
}

describe('readFirebaseConfig', () => {
  it('maps the env vars onto the SDK config shape', () => {
    expect(readFirebaseConfig(complete)).toEqual({
      apiKey: 'key',
      authDomain: 'p.firebaseapp.com',
      projectId: 'p',
      storageBucket: 'p.appspot.com',
      messagingSenderId: '1',
      appId: '1:1:web:1',
    })
  })

  it('throws a named error listing every missing key', () => {
    const { VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID, ...rest } = complete
    void VITE_FIREBASE_API_KEY
    void VITE_FIREBASE_APP_ID

    try {
      readFirebaseConfig(rest)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(MissingFirebaseConfigError)
      // Naming every missing key at once beats one-at-a-time discovery.
      expect((error as Error).message).toContain('VITE_FIREBASE_API_KEY')
      expect((error as Error).message).toContain('VITE_FIREBASE_APP_ID')
    }
  })

  it('treats an empty string as missing', () => {
    expect(() => readFirebaseConfig({ ...complete, VITE_FIREBASE_PROJECT_ID: '   ' })).toThrow(
      MissingFirebaseConfigError,
    )
  })
})

describe('hasFirebaseConfig', () => {
  it('is true only when every key is present', () => {
    expect(hasFirebaseConfig(complete)).toBe(true)
    expect(hasFirebaseConfig({ ...complete, VITE_FIREBASE_APP_ID: '' })).toBe(false)
    expect(hasFirebaseConfig({})).toBe(false)
  })

  it('never throws — the app uses it to decide whether to offer sign-in at all', () => {
    expect(() => hasFirebaseConfig({})).not.toThrow()
  })
})
