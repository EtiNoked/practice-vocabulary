import { useId, useState } from 'react'
import { applyTheme, readTheme, writeTheme, type ThemeChoice } from '../theme/theme'

/** `null` first: "follow the system" is the default, and reads as such. */
const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: null, label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/**
 * The theme control: three states, in the corner menu.
 *
 * A RADIO GROUP rather than a switch, and that is the whole design. A switch —
 * or the "dark mode" toggle every app ships — models two states, so the moment a
 * user touches it they lose "follow my system" permanently, and with it the
 * automatic change at sunset. The third option is the feature; a binary control
 * cannot express it, and a tri-state switch is not a control anyone recognises.
 *
 * Native `<input type="radio">` under the styling, so grouping, arrow-key
 * navigation and the announced "2 of 3" come from the browser rather than from
 * `role`/`aria-*` re-implemented here.
 *
 * Local state, not a store or a context: exactly ONE of these is mounted at a
 * time — inside AccountMenu's popover when there is an account system, standalone
 * in the same corner slot when there is not — so there is no second copy to keep
 * in step. If that ever changes, `authStore`'s subscribe/getSnapshot shape is the
 * thing to reach for; not before.
 */
export function ThemeToggle() {
  // The FUNCTION, not its result — the latter re-reads storage on every render.
  const [choice, setChoice] = useState<ThemeChoice>(readTheme)
  const name = useId()

  const pick = (next: ThemeChoice) => {
    writeTheme(next)
    // Applied even if the write above was swallowed: a private-browsing window
    // loses the preference on reload, which is a shame, but refusing to switch
    // at all would look like a broken control.
    applyTheme(next)
    setChoice(next)
  }

  return (
    <fieldset className="flex items-center justify-between gap-2">
      <legend className="sr-only">Theme</legend>
      <span aria-hidden="true" className="text-sm text-ink-muted">
        Theme
      </span>

      <div className="flex rounded-md border border-line-strong p-0.5">
        {OPTIONS.map((option) => {
          const active = choice === option.value
          return (
            <label
              key={option.label}
              className={`cursor-pointer rounded px-2 py-1 text-xs ${
                active ? 'bg-primary text-primary-ink' : 'text-ink-muted'
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={active}
                onChange={() => pick(option.value)}
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
