/**
 * Firebase web configuration, read from Vite env vars.
 *
 * These values are PUBLIC by design. The Firebase `apiKey` identifies the project;
 * it does not authorise anything, and it ships in the built bundle no matter what.
 * They live in `.env` for environment separation (a dev project vs a prod project),
 * NOT for secrecy. Do not add a proxy to "hide" them — see plan.md § Security.
 *
 * What actually protects the project: the Firestore security rules, the Firebase
 * authorised-domains list, and an HTTP-referrer restriction on the browser key.
 */

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

type Env = Record<string, string | undefined>

/** env var → SDK config field. The single source of truth for both readers below. */
const FIELDS = {
  VITE_FIREBASE_API_KEY: 'apiKey',
  VITE_FIREBASE_AUTH_DOMAIN: 'authDomain',
  VITE_FIREBASE_PROJECT_ID: 'projectId',
  VITE_FIREBASE_STORAGE_BUCKET: 'storageBucket',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'messagingSenderId',
  VITE_FIREBASE_APP_ID: 'appId',
} as const satisfies Record<string, keyof FirebaseConfig>

type EnvKey = keyof typeof FIELDS

const ENV_KEYS = Object.keys(FIELDS) as EnvKey[]

export class MissingFirebaseConfigError extends Error {
  readonly missing: readonly string[]

  constructor(missing: readonly string[]) {
    super(
      `Firebase config is incomplete. Missing: ${missing.join(', ')}. ` +
        `Copy .env.example to .env.local and fill in the values from your Firebase project ` +
        `(Project settings → Your apps → Web app → SDK setup and configuration).`,
    )
    this.name = 'MissingFirebaseConfigError'
    this.missing = missing
  }
}

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === ''

/** Non-throwing probe. The UI uses it to decide whether to offer sign-in at all. */
export function hasFirebaseConfig(env: Env): boolean {
  return ENV_KEYS.every((key) => !blank(env[key]))
}

export function readFirebaseConfig(env: Env): FirebaseConfig {
  const missing = ENV_KEYS.filter((key) => blank(env[key]))
  if (missing.length > 0) throw new MissingFirebaseConfigError(missing)

  // Every key is non-blank, so the assertions below are already established.
  return Object.fromEntries(
    ENV_KEYS.map((key) => [FIELDS[key], env[key]!.trim()]),
  ) as unknown as FirebaseConfig
}

export const firebaseConfigured = (): boolean =>
  hasFirebaseConfig(import.meta.env as unknown as Env)

export const firebaseConfig = (): FirebaseConfig =>
  readFirebaseConfig(import.meta.env as unknown as Env)
