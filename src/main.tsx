import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}
const root = createRoot(rootElement);

// Loaded dynamically so a missing/invalid .env shows a readable message instead of a blank page.
import('@/app/App')
  .then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    root.render(
      <pre className="m-6 rounded-md bg-red-50 p-4 text-sm whitespace-pre-wrap text-red-700">
        Configuration error: {message}
      </pre>,
    );
  });
