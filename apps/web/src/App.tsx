import { Route, Routes } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';
import { CatalogPage } from './pages/CatalogPage';
import { ChallengeIntroPage } from './pages/ChallengeIntroPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WorkspacePage } from './pages/WorkspacePage';

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/system-design" element={<CatalogPage />} />
        <Route path="/system-design/:slug" element={<ChallengeIntroPage />} />
        <Route path="/system-design/:slug/practice" element={<WorkspacePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
