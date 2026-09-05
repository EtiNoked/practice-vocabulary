import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { initTheme } from './theme/theme.ts'

/*
 * Before `render`, deliberately, and this is the whole reason it is a call here
 * rather than an effect in App: an effect runs after the first paint, so a user
 * who chose dark would watch the app flash light and then snap to it.
 *
 * Only an explicit OVERRIDE needs this. Someone following their OS is already
 * correct on the first frame, because index.css answers that in a media query
 * with no JavaScript involved — which is just as well, since the usual trick of
 * a blocking inline <script> in <head> is barred by our own CSP (`script-src`
 * has no 'unsafe-inline', and csp.test.ts pins that).
 */
initTheme()

// The boundary sits OUTSIDE AuthProvider, so a throw while resolving auth is
// caught too — that provider talks to Firebase, which is the least predictable
// thing in the tree.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
