import { Clock } from 'lucide-react';
import styles from './workspace.module.css';

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function Timer({ elapsedSeconds, suggestedMinutes }: { elapsedSeconds: number; suggestedMinutes: number }) {
  const over = elapsedSeconds > suggestedMinutes * 60;
  return (
    <span className={`${styles.timer} ${over ? styles.timerOver : ''}`} title="Active time on this practice">
      <Clock size={14} aria-hidden />
      <span>{`${formatClock(elapsedSeconds)} / ${formatClock(suggestedMinutes * 60)}`}</span>
    </span>
  );
}
