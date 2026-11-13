import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [connection, setConnection] = useState('Checking the database connection…');

  useEffect(() => {
    const request = new AbortController();

    async function checkConnection() {
      try {
        const response = await fetch('/api/health', { signal: request.signal });
        if (!response.ok) {
          throw new Error('Health check failed');
        }
        const health = await response.json();
        setConnection(health.database === 'up' ? 'Database connected' : 'Database unavailable');
      } catch {
        if (!request.signal.aborted) {
          setConnection('Connection check failed');
        }
      }
    }

    void checkConnection();
    return () => request.abort();
  }, []);

  return (
    <main>
      <h1>MedTrace</h1>
      <p>Pharmaceutical batch inventory and recall traceability</p>
      <p role="status">{connection}</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
