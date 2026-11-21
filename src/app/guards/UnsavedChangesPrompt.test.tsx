import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { UnsavedChangesPrompt } from './UnsavedChangesPrompt';

/** useBlocker needs a data router, so these tests use createMemoryRouter. */
function EditScreen() {
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <UnsavedChangesPrompt when={dirty} />
      <button
        type="button"
        onClick={() => {
          setDirty(true);
        }}
      >
        Make a change
      </button>
      <button
        type="button"
        onClick={() => {
          setDirty(false);
        }}
      >
        Save
      </button>
      <Link to="/elsewhere">Go elsewhere</Link>
      <p>Edit screen</p>
    </>
  );
}

function renderApp() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <EditScreen /> },
      { path: '/elsewhere', element: <p>Elsewhere</p> },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('UnsavedChangesPrompt', () => {
  it('lets navigation through when nothing has changed', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });

  it('asks before leaving a dirty form', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Make a change' }));
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));

    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument();
    expect(screen.getByText('Edit screen')).toBeInTheDocument();
  });

  it('stays put when the person keeps editing', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Make a change' }));
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));

    await waitFor(() => {
      expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Edit screen')).toBeInTheDocument();
  });

  it('navigates once the changes are discarded', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Make a change' }));
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });

  it('stops asking after a save clears the flag', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Make a change' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }));

    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });
});
