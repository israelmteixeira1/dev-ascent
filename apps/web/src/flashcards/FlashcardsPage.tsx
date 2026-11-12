import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { DeckSummary } from '@devascent/domain';
import { ApiError } from '../api/client';
import { listDecks } from '../api/flashcards';
import { useSession } from '../auth/session';
import { deckTitle, listTracks, trackOrDefault } from '../content/tracks';
import pages from '../pages/pages.module.css';
import styles from './flashcards.module.css';

export const reviewPath = (track: string, deck?: string) =>
  `/flashcards/review?${new URLSearchParams(deck ? { track, deck } : { track })}`;

/** The answer for one request; anything else on screen is still loading. */
type Loaded = { key: string; decks: DeckSummary[] | 'error' };

export function FlashcardsPage() {
  const [params, setParams] = useSearchParams();
  const track = trackOrDefault(params.get('track'));
  const { expire } = useSession();
  const [retries, setRetries] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${track.slug}:${retries}`;

  useEffect(() => {
    const controller = new AbortController();
    listDecks(track.slug, controller.signal).then(
      (decks) => setLoaded({ key, decks }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) expire();
        else setLoaded({ key, decks: 'error' });
      },
    );
    return () => controller.abort();
  }, [key, track.slug, expire]);

  const decks = loaded?.key === key ? loaded.decks : null;
  const totalDue = Array.isArray(decks) ? decks.reduce((sum, d) => sum + d.due, 0) : 0;

  return (
    <main className={pages.page}>
      <nav className={pages.breadcrumb} aria-label="Breadcrumb">
        <Link to="/">DevAscent</Link>
      </nav>
      <header className={pages.header}>
        <h1>Flashcards</h1>
        <p className={pages.lead}>Short daily reviews. Cards you miss come back sooner.</p>
      </header>

      <label className={styles.trackPicker}>
        <span>Track</span>
        <select value={track.slug} onChange={(e) => setParams({ track: e.target.value })}>
          {listTracks().map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {decks === null && (
        <p className={pages.notice} role="status">
          Loading decks…
        </p>
      )}
      {decks === 'error' && (
        <div className={pages.alert} role="alert">
          The decks could not be loaded.{' '}
          <button type="button" className={pages.secondary} onClick={() => setRetries((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {Array.isArray(decks) && (
        <>
          <div className={styles.summary}>
            <p className={pages.notice}>
              {totalDue === 0 ? 'Nothing due today.' : `${totalDue} ${totalDue === 1 ? 'card' : 'cards'} due today.`}
            </p>
            {totalDue > 0 && (
              <Link className={pages.primary} to={reviewPath(track.slug)}>
                Review all due
              </Link>
            )}
          </div>
          <ul className={pages.cards}>
            {decks.map((d) => (
              <li key={d.deck}>
                <Link className={pages.card} to={reviewPath(track.slug, d.deck)}>
                  <span className={pages.cardTitle}>{deckTitle(d.deck)}</span>
                  <span className={pages.meta}>
                    <span>{d.total} cards</span>
                    <span>{d.due} due</span>
                    <span>{d.new} new</span>
                    {d.draft > 0 && <span className={styles.draft}>{d.draft} draft</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
