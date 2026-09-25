import { isShared, roleOf } from '../state/listIds'
import type { ListMember, WordList } from '../state/types'

interface Props {
  lists: WordList[]
  loading?: boolean
  /** Where these lists live, which changes what the empty state can promise. */
  scope?: 'device' | 'account'
  /**
   * How this list has been going, or null when it has never been drilled.
   *
   * Supplied by `App` from ONE computation over every list, so eight rows cannot disagree
   * about which millisecond they were counted at (012 NFR-4) — the same rule `SavedTests`
   * follows for its live pool counts.
   *
   * Derived rather than stored, and it has to be: a count kept beside the list would be
   * wrong by the next drill. `App` computes it by filtering the records to this list and
   * THEN grouping them, which is the only rule that gives a multi-list test one entry per
   * list rather than one per record (012 D-5).
   *
   * Optional, and the line renders only when this AND `onOpenPractices` are supplied —
   * several tests render this component directly with no router, the same reason
   * `onSeeAllHistory` is optional on `Home`.
   */
  practices?: (listId: string) => { count: number; lastPct: number } | null
  onOpenPractices?: (list: WordList) => void
  onPractise: (list: WordList) => void
  onEdit: (list: WordList) => void
  onRename: (list: WordList) => void
  onDelete: (list: WordList) => void
  /**
   * The signed-in user, to read each list's role from (016). Absent for a guest, whose
   * lists are all their own.
   */
  uid?: string | null
  /**
   * Open the sharing dialog: Share for an owner, Members for everyone else. Absent where
   * sharing does not exist at all (no Firebase project).
   */
  onShare?: (list: WordList) => void
  /** Shown instead of Share to a guest (D-10). */
  onSignInToShare?: () => void
}

const ROLE_CHIP: Record<string, string> = { editor: 'Can edit', viewer: 'Can practise' }

/** Up to three faces and "+N", owner first. */
function Faces({ list }: { list: WordList }) {
  const members = Object.values(list.sharing?.members ?? {}).sort(
    (a: ListMember, b: ListMember) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.joinedAt - b.joinedAt),
  )
  const shown = members.slice(0, 3)
  const more = members.length - shown.length
  return (
    <span className="flex items-center" aria-label={`Shared with ${members.length} people`}>
      {shown.map((m, i) =>
        m.photoURL ? (
          <img
            key={i}
            src={m.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="-ml-1 h-6 w-6 rounded-full border border-surface first:ml-0"
          />
        ) : (
          <span
            key={i}
            aria-hidden="true"
            className="-ml-1 grid h-6 w-6 place-items-center rounded-full border border-surface bg-primary-soft text-xs font-semibold first:ml-0"
          >
            {(m.displayName ?? m.email ?? '?').charAt(0).toUpperCase()}
          </span>
        ),
      )}
      {more > 0 && <span className="ml-1 text-xs text-ink-muted">+{more}</span>}
    </span>
  )
}

const formatDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB')

export function SavedLists({
  lists,
  loading = false,
  scope = 'device',
  practices,
  onOpenPractices,
  onPractise,
  onEdit,
  onRename,
  onDelete,
  uid = null,
  onShare,
  onSignInToShare,
}: Props) {
  // "No saved lists yet" shown to a signed-in user whose lists are still
  // arriving reads as data loss. Say nothing definite until we know.
  if (loading) {
    return (
      <p className="text-ink-muted" role="status">
        Loading your lists…
      </p>
    )
  }

  if (lists.length === 0) {
    return (
      <p className="text-ink-muted">
        No saved lists yet. Make one and it will appear here
        {scope === 'account' ? ', on any device you sign in on.' : ', on this device.'}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {lists.map((list) => {
        const summary = practices?.(list.id) ?? null
        const shared = isShared(list)
        const role = roleOf(list, uid)
        // "Can practise" members do not edit or rename; the rules would refuse it anyway.
        const canEdit = role === 'owner' || role === 'editor'
        const owner = role === 'owner'
        return (
        <li
          key={list.id}
          className="rounded-lg border border-line-strong p-3"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold">{list.name}</span>
            <span className="text-sm text-ink-muted">
              {list.pairs.length} {list.pairs.length === 1 ? 'word' : 'words'} ·{' '}
              {formatDate(list.updatedAt)}
            </span>
          </div>
          {shared && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-ink">Shared</span>
              <Faces list={list} />
              {role && role !== 'owner' && (
                <span className="text-xs text-ink-muted">{ROLE_CHIP[role]}</span>
              )}
            </div>
          )}
          {/*
            A list with no history says nothing rather than "0 practices" — a line of
            noise on every row of a new account, carrying no information.
          */}
          {summary && onOpenPractices && (
            <button
              type="button"
              onClick={() => onOpenPractices(list)}
              className="mt-1 block text-sm text-primary underline"
            >
              {summary.count} {summary.count === 1 ? 'practice' : 'practices'} · last{' '}
              {summary.lastPct}%
            </button>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPractise(list)}
              className="btn btn-primary"
            >
              Practise
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(list)}
                className="btn btn-quiet"
              >
                Edit
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => onRename(list)}
                className="btn btn-quiet"
              >
                Rename
              </button>
            )}
            {onShare && (owner || shared) && (
              <button type="button" onClick={() => onShare(list)} className="btn btn-quiet">
                {owner ? 'Share' : 'Members'}
              </button>
            )}
            {!onShare && onSignInToShare && (
              <button type="button" onClick={onSignInToShare} className="btn btn-quiet">
                Sign in to share
              </button>
            )}
            {/*
              A member does not delete a shared list, they leave it — through the Members
              dialog, which offers to keep a copy on the way out (016 D-11).
            */}
            {owner || !onShare ? (
              <button
                type="button"
                onClick={() => onDelete(list)}
                className="btn btn-quiet"
              >
                Delete
              </button>
            ) : (
              <button type="button" onClick={() => onShare(list)} className="btn btn-quiet">
                Leave…
              </button>
            )}
          </div>
        </li>
        )
      })}
    </ul>
  )
}
