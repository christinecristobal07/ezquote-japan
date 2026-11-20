import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Field } from './Field';
import { Input } from './Input';
import { ConfirmDialog } from './Dialog';
import { PageHeader } from './PageHeader';
import { ToastProvider } from './toast';
import { useToast } from './useToast';

describe('Button', () => {
  it('disables itself and marks busy while loading', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('does not fire onClick while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: /save/i }), { pointerEventsCheck: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('honours disabled on its own', () => {
    render(<Button disabled>Save</Button>);
    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });
});

describe('Field', () => {
  it('links the label to the control', () => {
    render(
      <Field label="Client name">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Client name')).toBeInTheDocument();
  });

  it('describes the control with the hint', () => {
    render(
      <Field label="Email" hint="We never share it.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy).not.toBe('');
    expect(document.getElementById(describedBy)).toHaveTextContent('We never share it.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('describes the control with hint and error together, and marks it invalid', () => {
    render(
      <Field label="Email" hint="We never share it." error="That address is not valid.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(ids).toHaveLength(2);
    const text = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(text).toContain('We never share it.');
    expect(text).toContain('That address is not valid.');
  });
});

describe('ConfirmDialog', () => {
  it('does not call onConfirm when cancelled', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Archive this quotation?"
        message="It stays in the audit log."
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a loading state and closes once the work finishes', async () => {
    let release: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Archive this quotation?"
        message="It stays in the audit log."
        confirmLabel="Archive"
        danger
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /archive/i })).toHaveAttribute('aria-busy', 'true');
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    release();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

describe('PageHeader', () => {
  it('sets the document title', () => {
    render(<PageHeader title="Quotations" />);
    expect(document.title).toBe('Quotations · EZQUOTE Japan');
  });

  it('restores the previous title on unmount', () => {
    document.title = 'Before';
    const view = render(<PageHeader title="Rates & FX" />);
    expect(document.title).toBe('Rates & FX · EZQUOTE Japan');
    view.unmount();
    expect(document.title).toBe('Before');
  });
});

function ToastProbe() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.success('Quotation saved.');
      }}
    >
      Save
    </button>
  );
}

describe('useToast', () => {
  it('shows a toast and dismisses it on request', async () => {
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Quotation saved.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => {
      expect(screen.queryByText('Quotation saved.')).not.toBeInTheDocument();
    });
  });

  it('auto-dismisses after the timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <ToastProvider>
          <ToastProbe />
        </ToastProvider>,
      );
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByText('Quotation saved.')).toBeInTheDocument();

      vi.advanceTimersByTime(5100);
      await waitFor(() => {
        expect(screen.queryByText('Quotation saved.')).not.toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
