import { useState } from 'react'
import { LANG_NAMES, type LangCode } from '../lang/languages'

interface Props {
  lang: LangCode
}

/**
 * Shown when the device has no voice for the prompt language.
 *
 * Voice availability is a property of the operating system, not the browser, so
 * there is nothing the app can do to fix it — but a silent drill with no
 * explanation is the worst possible outcome. The caller also switches the card
 * into a text-visible mode so practice remains possible.
 */
export function VoiceWarning({ lang }: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      role="status"
      className="mx-auto max-w-xl rounded-lg bg-accent-soft p-3 text-sm text-ink"
    >
      <p>
        <strong>No {LANG_NAMES[lang]} voice on this device.</strong> The words are shown as text
        instead so you can still practise.
      </p>
      <p className="mt-1">
        To add one: <em>iPhone/iPad</em> — Settings → Accessibility → Spoken Content → Voices.{' '}
        <em>Mac</em> — System Settings → Accessibility → Spoken Content → System Voice → Manage.{' '}
        <em>Windows</em> — Settings → Time &amp; Language → Language → Add a language.
      </p>
      <button type="button" onClick={() => setDismissed(true)} className="mt-2 min-h-11 underline">
        Dismiss
      </button>
    </div>
  )
}
