import { Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { GoogleSignIn } from './components/GoogleSignIn';
import { HomePage } from './pages/HomePage';
import { TripsPage } from './pages/TripsPage';

function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <Link to="/" className="brand">
        <span className="brand-pin" aria-hidden="true" />
        SpotHop
      </Link>
      <nav className="header-nav">
        <Link to="/">Plan</Link>
        <Link to="/trips">My Trips</Link>
      </nav>
      <div className="header-auth">
        {user ? (
          <>
            <span className="user-name">{user.name}</span>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <GoogleSignIn compact />
        )}
      </div>
    </header>
  );
}

export function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/trips" element={<TripsPage />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
