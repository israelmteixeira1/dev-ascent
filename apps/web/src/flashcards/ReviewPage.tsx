import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ReviewResult, StudyCard } from '@devascent/domain';
import { ApiError } from '../api/client';
import { dueCards } from '../api/flashcards';
import { useSession } from '../auth/session';
import { deckTitle, trackOrDefault } from '../content/tracks';
import pages from '../pages/pages.module.css';
import styles from './flashcards.module.css';
import { StudyCardView } from './StudyCardView';

type Tally = Record<ReviewResult, number>;
type Session = { cards: StudyCard[]; dueCount: number; index: number; tally: Tally };
/** The session for one request; anything else on screen is still loading. */
type Loaded = { key: string; session: Session | 'error' };

const RESULT_LABELS: Record<ReviewResult, string> = { missed: 'Missed', hard: 'Hard', 'got-it': 'Got it' };

export function ReviewPage() {
  const [params] = useSearchParams();
  const track = trackOrDefault(params.get('track'));
  const deck = params.get('deck');
  const { expire } = useSession();
  const [rounds, setRounds] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${track.slug}:${deck ?? ''}:${rounds}`;

  useEffect(() => {
    const controller = new AbortController();
    dueCards(track.slug, deck, controller.signal).then(
      ({ cards, dueCount }) =>
        setLoaded({ key, session: { cards, dueCount, index: 0, tally: { missed: 0, hard: 0, 'got-it': 0 } } }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) expire();
        else setLoaded({ key, session: 'error' });
      },
    );
    return () => controller.abort();
  }, [key, track.slug, deck, expire]);

  const session = loaded?.key === key ? loaded.session : null;
  const update = (change: (s: Session) => Session) =>
    setLoaded((prev) => (prev && prev.session !== 'error' ? { ...prev, session: change(prev.session) } : prev));
  const backToDecks = `/flashcards?${new URLSearchParams({ track: track.slug })}`;

  return (
    <main className={pages.page}>
      <nav className={pages.breadcrumb} aria-label="Breadcrumb">
        <Link to={backToDecks}>Flashcards</Link>
      </nav>
      <header className={pages.header}>
        <h1>{deck ? deckTitle(deck) : 'Due today'}</h1>
        <p className={pages.lead}>{track.name}</p>
      </header>

      {session === null && (
        <p className={pages.notice} role="status">
          Loading cards…
        </p>
      )}
      {session === 'error' && (
        <div className={pages.alert} role="alert">
          The cards could not be loaded.{' '}
          <button type="button" className={pages.secondary} onClick={() => setRounds((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {session !== null && session !== 'error' && session.index < session.cards.length && (
        <>
          <p className={styles.progress}>
            Card {session.index + 1} of {session.cards.length}
          </p>
          <StudyCardView
            key={session.cards[session.index]!.id}
            card={session.cards[session.index]!}
            onChange={(card) => update((s) => ({ ...s, cards: s.cards.map((c) => (c.id === card.id ? card : c)) }))}
            onRated={(result) =>
              update((s) => ({ ...s, index: s.index + 1, tally: { ...s.tally, [result]: s.tally[result] + 1 } }))
            }
          />
        </>
      )}
      {session !== null && session !== 'error' && session.index >= session.cards.length && (
        <section className={styles.done} aria-labelledby="session-done">
          <h2 id="session-done">{session.cards.length === 0 ? 'Nothing due here today' : 'Session complete'}</h2>
          {session.cards.length > 0 && (
            <ul className={styles.tally}>
              {(Object.keys(RESULT_LABELS) as ReviewResult[]).map((r) => (
                <li key={r}>
                  {RESULT_LABELS[r]}: {session.tally[r]}
                </li>
              ))}
            </ul>
          )}
          <div className={pages.buttons}>
            {session.dueCount > session.cards.length && (
              <button type="button" className={pages.primary} onClick={() => setRounds((n) => n + 1)}>
                Review the next cards
              </button>
            )}
            <Link className={pages.secondary} to={backToDecks}>
              Back to decks
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
