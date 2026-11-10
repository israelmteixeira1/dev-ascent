import { Route, Routes } from 'react-router';
import { RequireAuth, SessionProvider } from './auth/session';
import { RouteErrorBoundary } from './ErrorBoundary';
import { CatalogPage } from './pages/CatalogPage';
import { ChallengeIntroPage } from './pages/ChallengeIntroPage';
import { HomePage } from './pages/HomePage';
import { HowSimulationWorksPage } from './pages/HowSimulationWorksPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { WorkspacePage } from './pages/WorkspacePage';

export function App() {
  return (
    <RouteErrorBoundary>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Everything else needs a session. */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/system-design" element={<CatalogPage />} />
            <Route path="/system-design/how-simulation-works" element={<HowSimulationWorksPage />} />
            <Route path="/system-design/:slug" element={<ChallengeIntroPage />} />
            <Route path="/system-design/:slug/attempts/:attemptId" element={<WorkspacePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </SessionProvider>
    </RouteErrorBoundary>
  );
}
