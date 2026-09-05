import type { FirebaseApp } from 'firebase/app'
import type { Auth, GoogleAuthProvider } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import { firebaseConfig } from './config'

/**
 * The ONLY module permitted to import `firebase/*`.
 *
 * Everything is behind a dynamic import() so Rollup emits Firebase as separate
 * chunks that a signed-out user never fetches. `firebase/auth` plus
 * `firebase/firestore` is roughly 150 KB gzipped, against v1's entire 150 KB
 * budget — loading it eagerly would double the download for guests to serve a
 * feature they are not using (NFR4a, plan.md R3).
 *
 * Two guards keep this true: an oxlint `no-restricted-imports` rule that fails
 * the build on a static `firebase/*` import elsewhere, and scripts/check-bundle.mjs,
 * which fails if a firebase chunk ends up in index.html's eager set.
 *
 * The type-only imports above are erased at compile time and cost nothing.
 */

/**
 * The SDK functions the adapters need, handed over rather than imported.
 *
 * This is what lets `firebaseAuth.ts` and `firestoreListStore.ts` obey the
 * one-file import rule: they receive the functions instead of reaching for
 * `firebase/*` themselves. It also makes both adapters trivially fakeable.
 */
export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  /** A ready-made Google provider — the only sign-in provider this app has. */
  provider: GoogleAuthProvider
  sdk: AuthSdk
  fs: FirestoreSdk
}

export interface AuthSdk {
  signInWithPopup: typeof import('firebase/auth').signInWithPopup
  signOut: typeof import('firebase/auth').signOut
  onAuthStateChanged: typeof import('firebase/auth').onAuthStateChanged
  deleteUser: typeof import('firebase/auth').deleteUser
  reauthenticateWithPopup: typeof import('firebase/auth').reauthenticateWithPopup
}

export interface FirestoreSdk {
  collection: typeof import('firebase/firestore').collection
  doc: typeof import('firebase/firestore').doc
  setDoc: typeof import('firebase/firestore').setDoc
  updateDoc: typeof import('firebase/firestore').updateDoc
  deleteDoc: typeof import('firebase/firestore').deleteDoc
  getDocs: typeof import('firebase/firestore').getDocs
  onSnapshot: typeof import('firebase/firestore').onSnapshot
  query: typeof import('firebase/firestore').query
  where: typeof import('firebase/firestore').where
  orderBy: typeof import('firebase/firestore').orderBy
  writeBatch: typeof import('firebase/firestore').writeBatch
  serverTimestamp: typeof import('firebase/firestore').serverTimestamp
  terminate: typeof import('firebase/firestore').terminate
  clearIndexedDbPersistence: typeof import('firebase/firestore').clearIndexedDbPersistence
}

/**
 * Memoised so repeated calls share one app instance. Holding the PROMISE rather
 * than the result means two concurrent callers during startup cannot both run
 * initialisation and produce a duplicate-app error.
 */
let servicesPromise: Promise<FirebaseServices> | null = null

async function initialise(): Promise<FirebaseServices> {
  const [{ initializeApp, getApps, getApp }, authModule, firestoreModule] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])

  // getApps() guards against HMR re-running this module in dev.
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig())

  const auth = authModule.getAuth(app)
  // Survive a refresh and a browser restart. This is the default, but it is the
  // property Story 1 depends on, so it is stated rather than assumed.
  await authModule.setPersistence(auth, authModule.browserLocalPersistence)

  /**
   * initializeFirestore, NOT getFirestore: the cache configuration is only read
   * at initialisation, and any earlier Firestore call silently locks in the
   * default memory cache instead.
   *
   * persistentLocalCache is the current API. enableIndexedDbPersistence is the
   * legacy one — do not reach for it.
   */
  const db = firestoreModule.initializeFirestore(app, {
    localCache: firestoreModule.persistentLocalCache({
      tabManager: firestoreModule.persistentMultipleTabManager(),
    }),
  })

  return {
    app,
    auth,
    db,
    provider: new authModule.GoogleAuthProvider(),
    sdk: {
      signInWithPopup: authModule.signInWithPopup,
      signOut: authModule.signOut,
      onAuthStateChanged: authModule.onAuthStateChanged,
      deleteUser: authModule.deleteUser,
      reauthenticateWithPopup: authModule.reauthenticateWithPopup,
    },
    fs: {
      collection: firestoreModule.collection,
      doc: firestoreModule.doc,
      setDoc: firestoreModule.setDoc,
      updateDoc: firestoreModule.updateDoc,
      deleteDoc: firestoreModule.deleteDoc,
      getDocs: firestoreModule.getDocs,
      onSnapshot: firestoreModule.onSnapshot,
      query: firestoreModule.query,
      where: firestoreModule.where,
      orderBy: firestoreModule.orderBy,
      writeBatch: firestoreModule.writeBatch,
      serverTimestamp: firestoreModule.serverTimestamp,
      terminate: firestoreModule.terminate,
      clearIndexedDbPersistence: firestoreModule.clearIndexedDbPersistence,
    },
  }
}

export function loadFirebase(): Promise<FirebaseServices> {
  servicesPromise ??= initialise().catch((error: unknown) => {
    // Do not cache a failure: a chunk that failed to load because the user was
    // briefly offline must be retryable on the next sign-in tap.
    servicesPromise = null
    throw error
  })
  return servicesPromise
}

/**
 * Wipe the on-device copy of the signed-in user's cloud data.
 *
 * Firestore's persistent cache lives in IndexedDB and survives signOut() on its
 * own, so without this a borrowed or shared computer keeps a readable copy of
 * the previous user's lists (Story 6).
 *
 * clearIndexedDbPersistence only works on a terminated instance, so the app
 * object is dropped afterwards and the next sign-in rebuilds it from scratch.
 * Failure is non-fatal: another open tab holding the same database will block
 * the clear, and being unable to tidy the cache must not prevent signing out.
 */
export async function clearFirestoreCache(): Promise<void> {
  const services = await servicesPromise
  if (!services) return

  servicesPromise = null
  try {
    await services.fs.terminate(services.db)
    await services.fs.clearIndexedDbPersistence(services.db)
  } catch {
    /* Another tab has it open, or the browser refused. Not worth failing over. */
  }
}

/** Test seam. Never call from application code. */
export function resetFirebaseForTests(): void {
  servicesPromise = null
}
