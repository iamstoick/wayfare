import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';

export const GoogleSignIn: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { login } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID || !buttonRef.current || !window.google) return;
    buttonRef.current.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: async (response) => {
        try {
          setError(null);
          await login(response.credential);
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: compact ? 'medium' : 'large',
    });
  }, [login, compact]);

  if (!CLIENT_ID) {
    return <span className="empty-note">Set VITE_GOOGLE_CLIENT_ID to enable sign-in.</span>;
  }

  return (
    <span className="gis-wrap">
      <div ref={buttonRef} />
      {error && <span className="error-note">{error}</span>}
    </span>
  );
};
