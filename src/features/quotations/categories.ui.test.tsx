import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutputCategoriesField } from './OutputCategoriesField';

const ALL = ['quad', 'triple', 'twin', 'solo', 'child', 'sneak_in'];

function renderField(overrides: Partial<React.ComponentProps<typeof OutputCategoriesField>> = {}) {
  const onChange = vi.fn();
  render(
    <OutputCategoriesField
      categories={ALL}
      selected={['twin']}
      adults={2}
      children={0}
      disabled={false}
      onChange={onChange}
      {...overrides}
    />,
  );
  return onChange;
}

describe('OutputCategoriesField', () => {
  it('disables quad and triple for two travellers', () => {
    // Two selected, so neither is the untickable last one.
    renderField({ adults: 2, selected: ['twin', 'sneak_in'] });
    expect(screen.getByLabelText('quad')).toBeDisabled();
    expect(screen.getByLabelText('triple')).toBeDisabled();
    expect(screen.getByLabelText('twin')).toBeEnabled();
  });

  it('says why a category is unavailable rather than just greying it out', () => {
    renderField({ adults: 2 });
    expect(screen.getByText('Needs at least 4 travellers; this quotation has 2.')).toBeVisible();
  });

  it('shows the room count for four travellers in twins', () => {
    renderField({ adults: 4, selected: ['quad'] });
    expect(screen.getByLabelText('twin')).toBeEnabled();
    expect(screen.getByText('2 rooms')).toBeVisible();
    expect(screen.getByText('1 room')).toBeVisible();
  });

  it('closes solo for an even party and opens it for an odd one', () => {
    const { unmount } = render(
      <OutputCategoriesField
        categories={ALL}
        selected={['twin']}
        adults={4}
        children={0}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('solo')).toBeDisabled();
    unmount();

    renderField({ adults: 5 });
    expect(screen.getByLabelText('solo')).toBeEnabled();
  });

  it('closes child until a child is actually travelling', () => {
    renderField({ adults: 2, children: 0 });
    expect(screen.getByLabelText('child')).toBeDisabled();
    expect(screen.getByText('No children on this quotation.')).toBeVisible();
  });

  it('opens child once there is one', () => {
    renderField({ adults: 2, children: 1 });
    expect(screen.getByLabelText('child')).toBeEnabled();
  });

  it('reports a tick', async () => {
    const user = userEvent.setup();
    const onChange = renderField({ adults: 4, selected: ['quad'] });
    await user.click(screen.getByLabelText('twin'));
    expect(onChange).toHaveBeenCalledWith(['quad', 'twin']);
  });

  it('reports an untick', async () => {
    const user = userEvent.setup();
    const onChange = renderField({ adults: 4, selected: ['quad', 'twin'] });
    await user.click(screen.getByLabelText('twin'));
    expect(onChange).toHaveBeenCalledWith(['quad']);
  });

  it('will not let the last category be unticked', () => {
    renderField({ selected: ['twin'], adults: 2 });
    expect(screen.getByLabelText('twin')).toBeDisabled();
  });

  it('leaves an already-ticked category tickable so it can be cleared', () => {
    // Quoted for four as quad, then cut to two travellers.
    renderField({ selected: ['quad', 'twin'], adults: 2 });
    expect(screen.getByLabelText('quad')).toBeEnabled();
  });

  it('flags a selection that no longer fits, without removing it', () => {
    const onChange = renderField({ selected: ['quad', 'twin'], adults: 2 });
    expect(screen.getByText('Some categories no longer fit')).toBeVisible();
    expect(screen.getByText(/quad — Needs at least 4 travellers/)).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says nothing when every selection still fits', () => {
    renderField({ selected: ['twin'], adults: 2 });
    expect(screen.queryByText('Some categories no longer fit')).not.toBeInTheDocument();
  });

  it('is read-only for someone who cannot edit the quotation', () => {
    renderField({ adults: 4, selected: ['quad'], disabled: true });
    expect(screen.getByLabelText('quad')).toBeDisabled();
    expect(screen.getByLabelText('twin')).toBeDisabled();
  });
});
