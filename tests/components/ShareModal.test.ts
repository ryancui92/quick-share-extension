import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import ShareModal from '@/components/modal/ShareModal.vue';
import {
  copyCardToClipboard,
  downloadCardAsPng,
  renderCardToCanvas,
} from '@/utils/exporter';
import type { PostData } from '@/types/post';

vi.mock('@/utils/exporter', () => ({
  renderCardToCanvas: vi.fn(async () => ({
    width: 1600,
    height: 1000,
    toBlob: (cb: (blob: Blob) => void) =>
      cb(new Blob(['png'], { type: 'image/png' })),
  })),
  copyCardToClipboard: vi.fn(async () => true),
  downloadCardAsPng: vi.fn(async () => {}),
}));
const samplePost: PostData = {
  id: '1',
  platform: 'zhihu',
  url: 'https://www.zhihu.com/question/123/answer/456',
  author: { name: 'Ryan' },
  content: '核心金句',
  contentHtml: '<p>核心金句</p>',
  isExcerpt: true,
  excerptBeforeHtml: '<p>前文</p>',
};
let wrapper: VueWrapper;
const writeClipboard = vi.fn(async () => {});
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: writeClipboard } });
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const open = async () => {
  wrapper = mount(ShareModal, { props: { post: samplePost, visible: true } });
  await flushPromises();
  await vi.advanceTimersByTimeAsync(150);
  await flushPromises();
};

describe('简洁分享编辑器', () => {
  it('shows primary actions and keeps developer tools out of the default UI', async () => {
    await open();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.get('[aria-label="保存图片"]').text()).toBe('');
    expect(wrapper.get('.export-actions .secondary-button').text()).toBe('');
    expect(wrapper.find('.zoom-toolbar').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('真实 DOM');
    expect(wrapper.text()).not.toContain('控制台打印');
    expect(wrapper.find('details').exists()).toBe(false);
    expect(wrapper.find('header').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('高清 PNG');
    expect(wrapper.find('aside').exists()).toBe(false);
    expect(wrapper.get('footer .theme-picker').findAll('button')).toHaveLength(
      3
    );
    expect(wrapper.find('footer [role="switch"]').exists()).toBe(false);
  });
  it('keeps the default background padding in the export source', async () => {
    await open();
    expect(wrapper.find('.has-outer-padding').exists()).toBe(true);
    expect(wrapper.get('.qs-excerpt-wrapper').text()).toContain('核心金句');
  });
  it('exports the unscaled offscreen source, never the preview image', async () => {
    await open();
    await wrapper
      .findAll('button')
      .find((button) => button.classes().includes('secondary-button'))!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label') === '保存图片')!
      .trigger('click');
    expect(copyCardToClipboard).toHaveBeenCalledWith(
      wrapper.get('.render-source > div').element,
      expect.objectContaining({ scale: 2.5 })
    );
    expect(downloadCardAsPng).toHaveBeenCalledWith(
      wrapper.get('.render-source > div').element,
      expect.any(String),
      expect.objectContaining({ scale: 2.5 })
    );
  });
  it('copies once on open and shows a temporary success notice', async () => {
    await open();
    expect(writeClipboard).toHaveBeenCalledTimes(1);
    expect(wrapper.get('footer .export-actions > .copy-notice').text()).toBe('已复制');
    await wrapper.findAll('footer .theme-choice')[1].trigger('click');
    await vi.advanceTimersByTimeAsync(150);
    expect(writeClipboard).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(wrapper.find('.copy-notice').exists()).toBe(false);
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(150);
    expect(writeClipboard).toHaveBeenCalledTimes(2);
  });
  it('shows a truthful notice when automatic clipboard access fails', async () => {
    writeClipboard.mockRejectedValueOnce(new Error('Permission denied'));
    await open();
    expect(wrapper.get('.copy-notice').text()).toBe('复制失败');
    expect(wrapper.get('[aria-label="复制图片"]').exists()).toBe(true);
  });
  it('keeps the toolbar width stable for very tall full posts', async () => {
    vi.mocked(renderCardToCanvas).mockResolvedValueOnce({
      width: 1600,
      height: 15000,
      toBlob: (cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' })),
    } as HTMLCanvasElement);
    await open();
    const dialog = wrapper.get('[role="dialog"]').element as HTMLElement;
    expect(dialog.style.width).toBe(`${Math.min(720, Math.max(280, window.innerWidth - 32))}px`);
    expect(parseFloat(dialog.style.height)).toBeLessThanOrEqual(810);
    expect(parseFloat(dialog.style.height)).toBeLessThanOrEqual(window.innerHeight - 32);
  });
  it('closes with Escape even when the host page stops keydown bubbling', async () => {
    await open();
    const target = document.createElement('input');
    document.body.appendChild(target);
    const stopOnHostPage = (event: KeyboardEvent) => event.stopPropagation();
    document.addEventListener('keydown', stopOnHostPage);
    try {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      document.removeEventListener('keydown', stopOnHostPage);
      target.remove();
    }
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('provides a retry if rendering fails', async () => {
    vi.mocked(renderCardToCanvas).mockRejectedValueOnce(
      new Error('render failed')
    );
    await open();
    expect(wrapper.text()).toContain('预览生成失败');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重试')!
      .trigger('click');
    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
