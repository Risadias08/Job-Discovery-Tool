import { NavLink, Route, Routes } from 'react-router-dom';
import SearchPage from './pages/SearchPage.jsx';
import TrackerPage from './pages/TrackerPage.jsx';
import JobDetailPage from './pages/JobDetailPage.jsx';
import PreferencesPage from './pages/PreferencesPage.jsx';
import StatusBadge from './components/StatusBadge.jsx';

const link = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`;

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold text-indigo-700">GradGuide</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={link}>Jobs</NavLink>
            <NavLink to="/tracker" className={link}>Tracker</NavLink>
            <NavLink to="/preferences" className={link}>Preferences</NavLink>
          </nav>
          <StatusBadge />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/tracker" element={<TrackerPage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
        </Routes>
      </main>
    </div>
  );
}
