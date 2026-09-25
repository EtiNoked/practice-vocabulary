import { useEffect, useMemo, useRef, useState } from 'react'
import { isShared, roleOf } from '../state/listIds'
import type { ListMember, ListRole, WordList } from '../state/types'
import { joinUrl, languagePair, linkStatus, MAX_MEMBERS, shareMessage } from './links'
import { QrCode } from './QrCode'
import type { LinkPreview, ShareLink, ShareStore } from './types'

/** At most this many open links per list (D-9). */
const MAX_OPEN_LINKS = 10

const ROLE_LABEL: Record<ListRole, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  viewer: 'Can practice',
}

interface Props {
  /** The LIVE list: this dialog re-renders as members join, leave and change role. */
  list: WordList
  uid: string
  store: ShareStore
  online: boolean
  origin: string
  /** One clock for every "2h ago" and every expiry on screen. */
  now: number
  onClose: () => void
  /** For outcomes worth a toast, such as a refused write. */
  onMessage: (text: string) => void
}

function ago(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function initial(member: ListMember): string {
  return (member.displayName ?? member.email ?? '?').trim().charAt(0).toUpperCase() || '?'
}

function Avatar({ member, size = 32 }: { member: ListMember; size?: number }) {
  const style = { width: size, height: size }
  if (member.photoURL) {
    return (
      <img
        src={member.photoURL}
        alt=""
        referrerPolicy="no-referrer"
        style={style}
        className="shrink-0 rounded-full border border-line"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="grid shrink-0 place-items-center rounded-full border border-line bg-primary-soft text-sm font-semibold text-ink"
    >
      {initial(member)}
    </span>
  )
}

/** Owner first, then in the order people joined. */
function sortedMembers(list: WordList): Array<[string, ListMember]> {
  const members = Object.entries(list.sharing?.members ?? {})
  return members.sort(([, a], [, b]) => {
    if (a.role === 'owner' && b.role !== 'owner') return -1
    if (b.role === 'owner' && a.role !== 'owner') return 1
    return a.joinedAt - b.joinedAt
  })
}

function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return [copied, () => setCopied(true)]
}

/** Copies a link and says so for two seconds. The same button wherever a link can be copied. */
function CopyLinkButton({ url }: { url: string }) {
  const [copied, markCopied] = useCopied()
  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(markCopied, () => {})
      }}
    >
      {copied ? 'Copied ✓' : 'Copy link'}
    </button>
  )
}

/**
 * Full screen, for holding a phone up to someone else's camera. Their camera app opens the
 * link; the app has no scanner of its own and needs none.
 */
function QrFullScreen({ url, listName, onClose }: { url: string; listName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [side, setSide] = useState(() =>
    Math.max(240, Math.min(window.innerWidth, window.innerHeight - 160) - 48),
  )

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onResize = () => setSide(Math.max(240, Math.min(window.innerWidth, window.innerHeight - 160) - 48))
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)

    // Keep the screen awake while someone is lining up their camera, where the browser
    // allows it. Not having it is fine; the screen just dims on its usual schedule.
    let lock: { release: () => Promise<void> } | null = null
    const wake = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } }).wakeLock
    wake?.request('screen').then((l) => (lock = l), () => {})

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      void lock?.release().catch(() => {})
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`QR code for ${listName}`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-ground p-4"
    >
      <p className="text-center text-lg font-semibold">Scan to join “{listName}”</p>
      <QrCode value={url} label={`QR code that opens the invitation to ${listName}`} size={side} />
      <button ref={closeRef} type="button" onClick={onClose} className="btn btn-primary btn-lg">
        Done
      </button>
    </div>
  )
}

/** Every way to send one link: share sheet, WhatsApp, email, copy, and the QR code. */
function ShareOptions({
  url,
  preview,
  onShowQr,
}: {
  url: string
  preview: LinkPreview
  onShowQr: () => void
}) {
  const message = shareMessage(preview, url)
  const subject = `Practice "${preview.listName}" with me`

  // Only where the device really has a share sheet. Desktop browsers mostly do not, and a
  // button that does nothing is worse than no button: WhatsApp and Email are always there.
  const canShare =
    typeof navigator.share === 'function' &&
    (typeof navigator.canShare !== 'function' || navigator.canShare({ url }))

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-3">
      <div className="flex flex-wrap items-center gap-3">
        <QrCode value={url} label={`QR code that opens the invitation to ${preview.listName}`} size={128} />
        <p className="min-w-40 flex-1 text-sm text-ink-muted">
          Anyone with this link can join. Send it, or let someone scan the code with their camera.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              navigator.share({ title: subject, text: message, url }).catch(() => {
                /* Closing the share sheet is not an error. */
              })
            }}
          >
            Share…
          </button>
        )}
        <a
          className="btn btn-quiet"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
        <a
          className="btn btn-quiet"
          href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
        >
          Email
        </a>
        <CopyLinkButton url={url} />
        <button type="button" className="btn btn-quiet" onClick={onShowQr}>
          Show QR code
        </button>
      </div>
    </div>
  )
}

function MembersSection({
  list,
  uid,
  isOwner,
  store,
  onMessage,
}: {
  list: WordList
  uid: string
  isOwner: boolean
  store: ShareStore
  onMessage: (text: string) => void
}) {
  const members = sortedMembers(list)
  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-2">
      <h3 id="members-heading" className="font-semibold">
        Members ({members.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {members.map(([memberUid, member]) => {
          const you = memberUid === uid
          return (
            <li key={memberUid} className="flex flex-wrap items-center gap-2">
              <Avatar member={member} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {member.displayName ?? member.email ?? 'Someone'}
                  {you && <span className="text-ink-muted"> (you)</span>}
                </p>
                <p className="truncate text-sm text-ink-muted">
                  {member.email && member.displayName ? `${member.email} · ` : ''}
                  {member.viaLabel ? `joined via ${member.viaLabel}` : member.role === 'owner' ? 'shared this list' : 'joined with a link'}
                </p>
              </div>
              {isOwner && member.role !== 'owner' ? (
                <div className="flex w-full items-center gap-2 pl-10">
                  <label className="sr-only" htmlFor={`role-${memberUid}`}>
                    What {member.displayName ?? 'this member'} can do
                  </label>
                  <select
                    id={`role-${memberUid}`}
                    className="field flex-1"
                    value={member.role}
                    onChange={async (e) => {
                      const result = await store.setRole(list, memberUid, e.target.value as 'editor' | 'viewer')
                      if (!result.ok) onMessage("Couldn't change that. Check your connection and try again.")
                    }}
                  >
                    <option value="editor">{ROLE_LABEL.editor}</option>
                    <option value="viewer">{ROLE_LABEL.viewer}</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={async () => {
                      const name = member.displayName ?? member.email ?? 'this person'
                      if (!window.confirm(`Remove ${name} from “${list.name}”? They'll be offered a copy of it.`)) return
                      const result = await store.removeMember(list, memberUid)
                      if (!result.ok) onMessage(`Couldn't remove ${name}. Try again.`)
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-sm text-ink">
                  {ROLE_LABEL[member.role]}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function OwnerView({ list, uid, store, online, origin, now, onMessage }: Omit<Props, 'onClose'>) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [active, setActive] = useState<ShareLink | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [label, setLabel] = useState('')
  const [group, setGroup] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => store.subscribeLinks(list.id, setLinks, () => {}), [store, list.id])

  // A used-up link is not shown: its person is under Members now.
  const visible = useMemo(() => links.filter((l) => linkStatus(l, now).kind !== 'used'), [links, now])
  const open = visible.filter((l) => linkStatus(l, now).kind === 'waiting')
  const memberCount = list.sharing?.memberUids.length ?? 1
  const room = MAX_MEMBERS - memberCount

  const blocked = !online
    ? "You're offline. A link has to be saved before it can be sent."
    : room <= 0
      ? `This list has ${MAX_MEMBERS} people, which is the most it can have.`
      : open.length >= MAX_OPEN_LINKS
        ? `There are already ${MAX_OPEN_LINKS} open links. Cancel one to make another.`
        : null

  async function create(options: { role: 'editor' | 'viewer'; label: string | null; maxUses: number }) {
    setBusy(true)
    const result = await store.createLink(list, options)
    setBusy(false)
    if (!result.ok) {
      onMessage(result.reason === 'offline' ? "You're offline. Try again when you're connected." : "Couldn't make a link. Try again.")
      return
    }
    setActive(result.link)
    setLabel('')
  }

  const activeUrl = active ? joinUrl(origin, active.code) : null

  return (
    <div className="flex flex-col gap-5">
      <MembersSection list={list} uid={uid} isOwner store={store} onMessage={onMessage} />

      <section aria-labelledby="new-link-heading" className="flex flex-col gap-3">
        <h3 id="new-link-heading" className="font-semibold">
          Invite someone
        </h3>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 text-sm text-ink-muted">They will be able to</legend>
          {(['editor', 'viewer'] as const).map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" name="link-role" checked={role === r} onChange={() => setRole(r)} />
              {r === 'editor' ? 'Edit and practice' : 'Practice only'}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-muted">Label, just for you (optional)</span>
          <input
            className="field"
            value={label}
            maxLength={60}
            placeholder={group ? 'Class 4B' : 'For Dana'}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
          One link for a group (up to {Math.max(1, room)} people)
        </label>
        {blocked && <p className="text-sm text-ink-muted">{blocked}</p>}
        <button
          type="button"
          className="btn btn-primary self-start"
          disabled={busy || blocked !== null}
          onClick={() => void create({ role, label: label.trim() || null, maxUses: group ? Math.max(1, room) : 1 })}
        >
          {busy ? 'Making a link…' : 'Create link'}
        </button>
        {active && activeUrl && (
          <ShareOptions url={activeUrl} preview={active.preview} onShowQr={() => setShowQr(true)} />
        )}
      </section>

      {visible.length > 0 && (
        <section aria-labelledby="links-heading" className="flex flex-col gap-2">
          <h3 id="links-heading" className="font-semibold">
            Links
          </h3>
          <ul className="flex flex-col gap-2">
            {visible.map((link, index) => {
              const status = linkStatus(link, now)
              const name = link.label ?? `Link ${visible.length - index}`
              return (
                <li key={link.code} className="rounded-lg border border-line p-2">
                  <p className="font-medium">
                    {name} <span className="text-sm font-normal text-ink-muted">· {ROLE_LABEL[link.role]}</span>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {status.kind === 'waiting' &&
                      `Waiting · created ${ago(link.createdAt, now)}${link.maxUses > 1 ? ` · ${status.joined} of ${link.maxUses} joined` : ''}`}
                    {status.kind === 'declined' && 'Declined'}
                    {status.kind === 'expired' && 'Expired'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {status.kind === 'waiting' ? (
                      <>
                        <button type="button" className="btn btn-quiet" onClick={() => setActive(link)}>
                          Share again
                        </button>
                        <CopyLinkButton url={joinUrl(origin, link.code)} />
                        <button
                          type="button"
                          className="btn btn-quiet"
                          onClick={async () => {
                            if (!window.confirm(`Cancel ${name}? It will stop working straight away.`)) return
                            if (active?.code === link.code) setActive(null)
                            const result = await store.cancelLink(link.code)
                            if (!result.ok) onMessage("Couldn't cancel that link. Try again.")
                          }}
                        >
                          Cancel link
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-quiet"
                          disabled={busy || blocked !== null}
                          onClick={async () => {
                            await create({ role: link.role, label: link.label, maxUses: link.maxUses })
                            await store.cancelLink(link.code)
                          }}
                        >
                          New link
                        </button>
                        <button type="button" className="btn btn-quiet" onClick={() => void store.cancelLink(link.code)}>
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {isShared(list) && (
        <section className="border-t border-line pt-3">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={async () => {
              const others = memberCount - 1
              if (
                !window.confirm(
                  `Stop sharing “${list.name}”? ${others} ${others === 1 ? 'person' : 'people'} will lose it and be offered a copy. Every link stops working.`,
                )
              )
                return
              const result = await store.stopSharing(list)
              if (!result.ok) onMessage("Couldn't stop sharing. Try again.")
            }}
          >
            Stop sharing
          </button>
        </section>
      )}

      {showQr && activeUrl && (
        <QrFullScreen url={activeUrl} listName={list.name} onClose={() => setShowQr(false)} />
      )}
    </div>
  )
}

function MemberView({ list, uid, store, onClose, onMessage }: Props) {
  const role = roleOf(list, uid)
  const owner = list.sharing ? list.sharing.members[list.sharing.ownerUid] : undefined
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        {owner?.displayName ?? 'The owner'} shared this list with you.{' '}
        {role === 'viewer'
          ? 'You can practice it. To change the words, leave and keep a copy of your own.'
          : 'You can edit and practice it.'}
      </p>
      <MembersSection list={list} uid={uid} isOwner={false} store={store} onMessage={onMessage} />
      <section className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="font-semibold">Leave this list</h3>
        <p className="text-sm text-ink-muted">
          It disappears from your lists. Your practice history stays with you, and a copy keeps it attached.
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              [true, 'Leave and keep a copy'],
              [false, 'Leave'],
            ] as const
          ).map(([keepCopy, text]) => (
            <button
              key={text}
              type="button"
              className={keepCopy ? 'btn btn-primary' : 'btn btn-quiet'}
              onClick={async () => {
                if (!keepCopy && !window.confirm(`Leave “${list.name}” without keeping a copy?`)) return
                const result = await store.leave(list, { keepCopy })
                if (!result.ok) {
                  onMessage("Couldn't leave the list. Check your connection and try again.")
                  return
                }
                onClose()
              }}
            >
              {text}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * Share a list, or see who shares it (016 Stories 1, 2, 5, 6).
 *
 * The owner gets links, statuses and member controls; everyone else gets the member list
 * and a way out. Lazy-loaded from App, so a guest never downloads this or the QR encoder.
 */
export default function SharingDialog(props: Props) {
  const { list, uid, onClose } = props
  const isOwner = roleOf(list, uid) === 'owner'
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      // The full-screen QR handles its own Escape and sits on top.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-label^="QR code"]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // Scrolls as a whole rather than centring: a tall dialog centred in a scrolling overlay
    // loses its top, Close button included, above the viewport on a short phone screen.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sharing-heading"
        className="card mx-auto my-4 w-full max-w-lg p-4"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 id="sharing-heading" className="text-xl font-semibold">
              {isOwner ? `Share “${list.name}”` : `“${list.name}”`}
            </h2>
            <p className="text-sm text-ink-muted">
              {list.pairs.length} {list.pairs.length === 1 ? 'word' : 'words'} · {languagePair(list)}
            </p>
          </div>
          <button ref={closeRef} type="button" className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
        {isOwner ? <OwnerView {...props} /> : <MemberView {...props} />}
      </section>
    </div>
  )
}
