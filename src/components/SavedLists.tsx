import { scoreBand, type ScoreBand } from "../state/listProgress";
import type { SessionRecord, WordList } from "../state/types";

interface Props {
  lists: WordList[];
  loading?: boolean;
  /** Where these lists live, which changes what the empty state can promise. */
  scope?: "device" | "account";
  /**
   * The most recent comparable run per list id, if any. Absent for a list that
   * has never been drilled — which is left uncoloured rather than given a
   * neutral band, because "not yet attempted" is not a standing.
   */
  scores?: Map<string, SessionRecord>;
  onPractise: (list: WordList) => void;
  onEdit: (list: WordList) => void;
  onRename: (list: WordList) => void;
  onDelete: (list: WordList) => void;
}

const formatDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB");

/**
 * The border that carries a list's standing.
 *
 * Tokens, so both themes come for free — `--color-correct` is a dark green in
 * light and a light green in dark, and this never has to know which.
 *
 * Colour is never the ONLY carrier: every coloured row also prints its score as
 * `right / total (pct%)`, which is what makes the signal survive a colour-blind
 * reader, a forced-colours palette, and a greyscale screenshot.
 */
const BAND_BORDER: Record<ScoreBand, string> = {
  perfect: "border-correct",
  fair: "border-accent",
  weak: "border-incorrect",
};

export function SavedLists({
  lists,
  loading = false,
  scope = "device",
  scores,
  onPractise,
  onEdit,
  onRename,
  onDelete,
}: Props) {
  // "No saved lists yet" shown to a signed-in user whose lists are still
  // arriving reads as data loss. Say nothing definite until we know.
  if (loading) {
    return (
      <p className="text-ink-muted" role="status">
        Loading your lists…
      </p>
    );
  }

  if (lists.length === 0) {
    return (
      <p className="text-ink-muted">
        No saved lists yet. Make one and it will appear here
        {scope === "account"
          ? ", on any device you sign in on."
          : ", on this device."}
      </p>
    );
  }

  return (
    // Named for the same reason the history log is: a list's name now appears
    // both here and in its history entries, and "which Lesson 3" is a question
    // a screen-reader user has to answer too.
    <ul aria-label="Saved lists" className="flex flex-col gap-2">
      {lists.map((list) => {
        const last = scores?.get(list.id) ?? null;
        const band = last ? scoreBand(last) : null;

        return (
          <li
            key={list.id}
            // `border-2` on every row, coloured or not, so gaining a score cannot
            // nudge a list 1px wider than its neighbours.
            className={`rounded-lg border-2 p-3 ${band ? BAND_BORDER[band] : "border-line-strong"}`}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-semibold">{list.name}</span>
              <span className="text-sm text-ink-muted">
                {list.pairs.length} {list.pairs.length === 1 ? "word" : "words"}{" "}
                · {formatDate(list.updatedAt)}
              </span>
              {last && (
                /*
                `right / total (pct%)`, matching the review screen's rows.
                Spelling out the fraction is what keeps a rounded 100% honest:
                199/200 rounds to 100 but is not perfect, so it reads amber, and
                the numbers beside it explain why.
              */
                <span className="text-sm font-medium">
                  Last score {last.right} / {last.total} ({last.pct}%)
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPractise(list)}
                className="btn btn-primary"
              >
                Practise
              </button>
              <button
                type="button"
                onClick={() => onEdit(list)}
                className="btn btn-quiet"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onRename(list)}
                className="btn btn-quiet"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => onDelete(list)}
                className="btn btn-quiet"
              >
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
