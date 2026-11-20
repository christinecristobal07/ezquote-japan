import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library's automatic cleanup never
// registers itself. Without this the DOM piles up across tests in a file and
// queries start matching elements from earlier renders.
afterEach(() => {
  cleanup();
});
