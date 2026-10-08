import type { BaseAdapter } from '@/adapters/base';
import { getSelectionEntity } from './selection';

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Preserve a valid page selection while a site opens its native context menu. */
export function createContextMenuSelection(adapter: BaseAdapter) {
  let savedRange: Range | null = null;
  let savedText = '';

  return {
    capture(selection: Selection | null) {
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || !getSelectionEntity(adapter, range)) return;
      savedRange = range.cloneRange();
      savedText = normalizeText(range.toString());
    },
    take(selection: Selection | null, selectionText: string): Range | null {
      const text = normalizeText(selectionText);
      const liveRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const range = liveRange && getSelectionEntity(adapter, liveRange)
        && (!text || normalizeText(liveRange.toString()) === text)
        ? liveRange.cloneRange()
        : savedRange && (!text || savedText === text)
          ? savedRange.cloneRange()
          : null;
      savedRange = null;
      savedText = '';
      return range && getSelectionEntity(adapter, range) ? range : null;
    },
  };
}
