import { beforeEach, describe, expect, it } from 'vitest';
import { UniversalAdapter } from '@/adapters/universal.adapter';
import { createContextMenuSelection } from '@/utils/context-menu-selection';

beforeEach(() => {
  document.body.innerHTML = '<article><p id="quote">Selected passage</p></article>';
  window.getSelection()?.removeAllRanges();
});

function selectPassage() {
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('#quote')!);
  const selection = window.getSelection()!;
  selection.addRange(range);
  return selection;
}

describe('context menu selection', () => {
  it('uses the saved range after the host page clears its live selection', () => {
    const cache = createContextMenuSelection(new UniversalAdapter());
    const selection = selectPassage();
    cache.capture(selection);
    selection.removeAllRanges();

    expect(cache.take(selection, 'Selected passage')?.toString()).toBe('Selected passage');
    expect(cache.take(selection, 'Selected passage')).toBeNull();
  });

  it('does not share stale text from a different selection', () => {
    const cache = createContextMenuSelection(new UniversalAdapter());
    const selection = selectPassage();
    cache.capture(selection);
    selection.removeAllRanges();

    expect(cache.take(selection, 'Different passage')).toBeNull();
  });
});
