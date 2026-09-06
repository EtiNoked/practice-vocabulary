import { describe, expect, it, vi } from 'vitest'
import { deleteAccount, purgeUserData, reauthenticateAndDelete } from './deleteAccount'
import type { FirebaseServices } from './firebase'

const authError = (code: string) => Object.assign(new Error(code), { code })

/**
 * A fake Firestore that records the order operations happen in. The ordering is
 * the property under test, so it has to be observable.
 */
function fakeServices(options: {
  listDocs?: number
  sessionDocs?: number
  currentUser?: { uid: string } | null
  deleteUser?: () => Promise<void>
  reauthenticate?: () => Promise<void>
  getDocsFails?: boolean
} = {}) {
  const log: string[] = []
  const {
    listDocs = 0,
    sessionDocs = 0,
    currentUser = { uid: 'u1' },
    deleteUser = async () => {},
    reauthenticate = async () => {},
    getDocsFails = false,
  } = options

  const commits: number[] = []

  const services = {
    db: {},
    auth: { currentUser },
    provider: {},
    sdk: {
      deleteUser: vi.fn(async () => {
        log.push('deleteUser')
        await deleteUser()
      }),
      reauthenticateWithPopup: vi.fn(async () => {
        log.push('reauthenticate')
        await reauthenticate()
      }),
    },
    fs: {
      collection: (_db: unknown, path: string) => ({ path }),
      doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
      getDocs: vi.fn(async (ref: { path: string }) => {
        if (getDocsFails) throw authError('unavailable')
        log.push(`read:${ref.path}`)
        const count = ref.path.endsWith('/lists') ? listDocs : sessionDocs
        return { docs: Array.from({ length: count }, (_, i) => ({ ref: { id: `${i}` } })) }
      }),
      writeBatch: () => {
        let size = 0
        return {
          delete: () => {
            size += 1
          },
          commit: async () => {
            commits.push(size)
            log.push('commit')
          },
        }
      },
      deleteDoc: vi.fn(async (ref: { path: string }) => {
        log.push(`delete:${ref.path}`)
      }),
    },
  } as unknown as FirebaseServices

  return { services, log, commits }
}

describe('purgeUserData', () => {
  /*
   * EVERY collection, then the user document.
   *
   * This assertion used to name lists and sessions only, and it was true and incomplete:
   * 008 added `games` and did not add it here, so a deleted account left every game
   * record behind under a uid that could never authenticate again — unreachable, and
   * therefore undeletable by anyone. 011 adds `tests` and closes both.
   *
   * The ORDER is not negotiable either: the rules only permit `isOwner(uid)`, so deleting
   * the user document first would strand whatever is left permanently.
   */
  it('deletes every collection, then the user document', async () => {
    const { services, log } = fakeServices({ listDocs: 2, sessionDocs: 3 })
    await purgeUserData(services, 'u1')

    expect(log.filter((l) => l.startsWith('read:') || l.startsWith('delete:'))).toEqual([
      'read:users/u1/lists',
      'read:users/u1/sessions',
      'read:users/u1/games',
      'read:users/u1/tests',
      'delete:users/u1',
    ])
  })

  it('batches in chunks of at most 500, Firestore\'s hard limit', async () => {
    const { services, commits } = fakeServices({ listDocs: 1201 })
    await purgeUserData(services, 'u1')
    expect(commits.slice(0, 3)).toEqual([500, 500, 201])
    expect(Math.max(...commits)).toBeLessThanOrEqual(500)
  })

  it('still removes the user document when there is nothing else stored', async () => {
    const { services, log } = fakeServices()
    await purgeUserData(services, 'u1')
    expect(log).toContain('delete:users/u1')
  })
})

describe('deleteAccount ordering', () => {
  it('destroys the data BEFORE the account', async () => {
    const { services, log } = fakeServices({ listDocs: 1 })
    expect(await deleteAccount(services)).toEqual({ ok: true })

    // Deleting the account first would strand every document forever: the rules
    // only let that uid touch them, and that uid would no longer exist.
    expect(log.indexOf('delete:users/u1')).toBeLessThan(log.indexOf('deleteUser'))
  })

  it('does not delete the account if the data purge failed', async () => {
    const { services } = fakeServices({ getDocsFails: true })
    const result = await deleteAccount(services)
    expect(result).toMatchObject({ ok: false, reason: 'partial' })
    expect(services.sdk.deleteUser).not.toHaveBeenCalled()
  })

  it('reports an offline purge in terms the user can act on', async () => {
    const { services } = fakeServices({ getDocsFails: true })
    const result = await deleteAccount(services)
    expect(result).toMatchObject({ reason: 'partial' })
    if (!result.ok && result.reason === 'partial') {
      expect(result.message).toMatch(/connection/i)
    }
  })

  it('refuses when nobody is signed in', async () => {
    const { services } = fakeServices({ currentUser: null })
    expect(await deleteAccount(services)).toMatchObject({ ok: false, reason: 'unknown' })
  })
})

describe('requires-recent-login', () => {
  it('is surfaced as its own outcome, not an opaque failure', async () => {
    const { services } = fakeServices({
      deleteUser: async () => {
        throw authError('auth/requires-recent-login')
      },
    })
    expect(await deleteAccount(services)).toEqual({ ok: false, reason: 'requires-recent-login' })
  })

  it('completes after re-authenticating', async () => {
    let attempts = 0
    const { services, log } = fakeServices({
      deleteUser: async () => {
        attempts += 1
        if (attempts === 1) throw authError('auth/requires-recent-login')
      },
    })

    expect(await deleteAccount(services)).toEqual({ ok: false, reason: 'requires-recent-login' })
    expect(await reauthenticateAndDelete(services)).toEqual({ ok: true })
    expect(log).toContain('reauthenticate')
  })

  it('deletes nothing more when the re-auth popup is cancelled', async () => {
    const { services } = fakeServices({
      reauthenticate: async () => {
        throw authError('auth/popup-closed-by-user')
      },
    })
    const result = await reauthenticateAndDelete(services)
    expect(result.ok).toBe(false)
    if (!result.ok && result.reason === 'unknown') {
      expect(result.message).toMatch(/cancelled/i)
    }
    expect(services.sdk.deleteUser).not.toHaveBeenCalled()
  })
})

describe('re-running after a partial failure', () => {
  it('picks up where it left off rather than erroring', async () => {
    // First run: purge succeeds, account deletion fails.
    let failAccount = true
    const { services } = fakeServices({
      listDocs: 2,
      deleteUser: async () => {
        if (failAccount) throw authError('auth/network-request-failed')
      },
    })

    expect(await deleteAccount(services)).toMatchObject({ reason: 'partial' })
    failAccount = false
    expect(await deleteAccount(services)).toEqual({ ok: true })
  })
})
