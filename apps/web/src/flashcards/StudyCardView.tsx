import { useEffect, useState } from 'react';
import { FLASHCARD_LIMITS, type ReviewResult, type StudyCard } from '@devascent/domain';
import { ApiError } from '../api/client';
import { markCardReviewed, reportCardIssue, reviewCard, saveCardNotes } from '../api/flashcards';
import { useSession } from '../auth/session';
import { deckTitle } from '../content/tracks';
import { Timer } from '../workspace/Timer';
import { useActiveTimer } from '../workspace/useActiveTimer';
import pages from '../pages/pages.module.css';
import styles from './flashcards.module.css';

/** How long an explain-out-loud card waits before showing the answer. */
export const EXPLAIN_SECONDS = 60;

const RATINGS: { result: ReviewResult; label: string }[] = [
  { result: 'missed', label: 'Missed' },
  { result: 'hard', label: 'Hard' },
  { result: 'got-it', label: 'Got it' },
];

const TYPE_LABELS: Record<StudyCard['type'], string> = {
  concept: 'Concept',
  'explain-out-loud': 'Explain out loud',
  behavioral: 'Behavioral',
};

/** Runs an API call; a 401 ends the session, any other failure answers false. */
function useApiCall() {
  const { expire } = useSession();
  return async <T,>(run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      return null;
    }
  };
}

type Props = {
  card: StudyCard;
  /** The card came back changed from the API: notes, report or content review. */
  onChange: (card: StudyCard) => void;
  /** The review was saved. */
  onRated: (result: ReviewResult) => void;
};

export function StudyCardView({ card, onChange, onRated }: Props) {
  const call = useApiCall();
  const [revealed, setRevealed] = useState(false);
  const [rating, setRating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = async (result: ReviewResult) => {
    setRating(true);
    setError(null);
    const saved = await call(() => reviewCard(card, result));
    if (saved) return onRated(result);
    setRating(false);
    setError('Your answer could not be saved. Try again.');
  };

  return (
    <article className={styles.card} aria-label="Flashcard">
      <p className={pages.meta}>
        <span className={pages.badge}>{TYPE_LABELS[card.type]}</span>
        <span>{deckTitle(card.deck)}</span>
        {card.effectiveStatus === 'draft' && <span className={styles.draft}>Draft</span>}
      </p>
      <h2 className={styles.question}>{card.question}</h2>

      {!revealed && card.type === 'explain-out-loud' && <ExplainOutLoud onDone={() => setRevealed(true)} />}
      {!revealed && card.type !== 'explain-out-loud' && (
        <button type="button" className={pages.primary} onClick={() => setRevealed(true)}>
          Show answer
        </button>
      )}

      {revealed && (
        <>
          {card.type === 'behavioral' ? (
            <>
              <p className={pages.notice}>No model answer: build your own story with STAR.</p>
              <KeyPoints title="Hints" points={card.keyPoints} />
              <StarNotes card={card} onChange={onChange} />
            </>
          ) : (
            <>
              <p className={styles.answer}>{card.answer}</p>
              <KeyPoints title="Key points" points={card.keyPoints} />
            </>
          )}
          {card.source && <p className={styles.source}>Source: {card.source}</p>}

          <div className={styles.ratings} role="group" aria-label="How did it go?">
            {RATINGS.map(({ result, label }) => (
              <button
                key={result}
                type="button"
                className={`${pages.secondary} ${styles[result]}`}
                disabled={rating}
                onClick={() => void rate(result)}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <p className={pages.alert} role="alert">
              {error}
            </p>
          )}
          <ContentCheck card={card} onChange={onChange} />
        </>
      )}
    </article>
  );
}

function KeyPoints({ title, points }: { title: string; points: string[] }) {
  if (points.length === 0) return null;
  return (
    <section className={styles.keyPoints} aria-label={title}>
      <h3>{title}</h3>
      <ul>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </section>
  );
}

/** Counts the active time and shows the answer after EXPLAIN_SECONDS, or sooner on request. */
function ExplainOutLoud({ onDone }: { onDone: () => void }) {
  const { elapsedSeconds } = useActiveTimer();
  const finished = elapsedSeconds >= EXPLAIN_SECONDS;
  useEffect(() => {
    if (finished) onDone();
  }, [finished, onDone]);
  return (
    <div className={styles.explain}>
      <p className={pages.notice}>Explain your answer out loud. The answer shows after one minute.</p>
      <Timer elapsedSeconds={elapsedSeconds} suggestedMinutes={EXPLAIN_SECONDS / 60} />
      <button type="button" className={pages.secondary} onClick={onDone}>
        Show answer now
      </button>
    </div>
  );
}

function StarNotes({ card, onChange }: { card: StudyCard; onChange: (card: StudyCard) => void }) {
  const call = useApiCall();
  const saved = card.progress?.notes ?? '';
  const [notes, setNotes] = useState(saved);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const save = async () => {
    setStatus('saving');
    const updated = await call(() => saveCardNotes(card, notes));
    if (!updated) return setStatus('error');
    setStatus('idle');
    onChange(updated);
  };

  return (
    <section className={styles.notes}>
      <h3 id={`notes-${card.id}`}>Your story</h3>
      <textarea
        aria-labelledby={`notes-${card.id}`}
        rows={8}
        maxLength={FLASHCARD_LIMITS.maxNotesLength}
        placeholder={'Situation:\nTask:\nAction:\nResult:'}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className={pages.buttons}>
        <button
          type="button"
          className={pages.secondary}
          disabled={status === 'saving' || notes === saved}
          onClick={() => void save()}
        >
          Save notes
        </button>
        {status === 'idle' && notes === saved && saved !== '' && <span className={pages.notice}>Saved</span>}
        {status === 'error' && (
          <span className={styles.error} role="alert">
            The notes could not be saved. Try again.
          </span>
        )}
      </div>
    </section>
  );
}

/** "Mark as reviewed" for drafts and "Report an error" for any card. Both only touch the database. */
function ContentCheck({ card, onChange }: { card: StudyCard; onChange: (card: StudyCard) => void }) {
  const call = useApiCall();
  const reported = card.progress?.issueNote ?? '';
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState(reported);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (request: () => Promise<StudyCard>, failure: string) => {
    setBusy(true);
    setError(null);
    const updated = await call(request);
    setBusy(false);
    if (!updated) return setError(failure);
    setReporting(false);
    onChange(updated);
  };

  return (
    <section className={styles.contentCheck} aria-label="Card content">
      {card.effectiveStatus === 'draft' && (
        <p className={pages.notice}>This card is a draft: check the answer before you trust it.</p>
      )}
      {reported && !reporting && <p className={styles.reported}>You reported: {reported}</p>}
      {reporting ? (
        <div className={styles.report}>
          <label htmlFor={`issue-${card.id}`}>What is wrong with this card?</label>
          <textarea
            id={`issue-${card.id}`}
            rows={3}
            maxLength={FLASHCARD_LIMITS.maxIssueNoteLength}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className={pages.buttons}>
            <button
              type="button"
              className={pages.secondary}
              disabled={busy || note.trim() === ''}
              onClick={() => void run(() => reportCardIssue(card, note.trim()), 'The report could not be saved.')}
            >
              Send report
            </button>
            <button type="button" className={pages.secondary} onClick={() => setReporting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={pages.buttons}>
          {card.effectiveStatus === 'draft' && (
            <button
              type="button"
              className={pages.secondary}
              disabled={busy}
              onClick={() => void run(() => markCardReviewed(card), 'The card could not be marked as reviewed.')}
            >
              Mark as reviewed
            </button>
          )}
          <button
            type="button"
            className={pages.secondary}
            onClick={() => {
              setNote(reported);
              setReporting(true);
            }}
          >
            {reported ? 'Edit report' : 'Report an error'}
          </button>
          {reported && (
            <button
              type="button"
              className={pages.secondary}
              disabled={busy}
              onClick={() => void run(() => reportCardIssue(card, ''), 'The report could not be withdrawn.')}
            >
              Withdraw report
            </button>
          )}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
