import { defineContentScript } from 'wxt/sandbox';
import { createApp } from 'vue';
import App from './App.vue';
import { getAdapterForUrl } from '@/adapters';
import { extractSelection, getSelectionEntity } from '@/utils/selection';
import { createContextMenuSelection } from '@/utils/context-menu-selection';
import '@/assets/style.css';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // 检查扩展上下文是否有效
    if (!browser.runtime?.id || !ctx.isValid) return;

    // 获取当前站点适配器
    const adapter = getAdapterForUrl();
    if (!adapter) return;

    let appInstance: any = null;

    let hostEl: HTMLElement | null = null;

    // 创建 Shadow DOM UI 容器，将 Tailwind 样式隔离注入
    const ui = await createShadowRootUi(ctx, {
      name: 'quick-share-ui-container',
      position: 'overlay',
      zIndex: 2147483647,
      anchor: 'body',
      append: 'last',
      onMount: (container) => {
        const root = container.getRootNode() as ShadowRoot;
        hostEl = (root?.host as HTMLElement) || null;
        if (hostEl) {
          hostEl.style.setProperty('position', 'fixed', 'important');
          hostEl.style.setProperty('top', '0', 'important');
          hostEl.style.setProperty('left', '0', 'important');
          hostEl.style.setProperty('width', '100vw', 'important');
          hostEl.style.setProperty('height', '100vh', 'important');
          hostEl.style.setProperty('z-index', '2147483647', 'important');
          hostEl.style.setProperty('pointer-events', 'none', 'important');
        }
        const app = createApp(App);
        appInstance = app.mount(container);
        return app;
      },
      onRemove: (app) => {
        app?.unmount();
      },
    });

    ui.mount();

    if (ui.uiContainer) {
      hostEl = ui.uiContainer;
      hostEl.style.setProperty('position', 'fixed', 'important');
      hostEl.style.setProperty('top', '0', 'important');
      hostEl.style.setProperty('left', '0', 'important');
      hostEl.style.setProperty('width', '100vw', 'important');
      hostEl.style.setProperty('height', '100vh', 'important');
      hostEl.style.setProperty('z-index', '2147483647', 'important');
      hostEl.style.setProperty('pointer-events', 'none', 'important');
    }

    // 启动站点适配器按钮注入监听
    adapter.start((postData) => {
      if (!ctx.isValid) return;
      if (appInstance && appInstance.openShareModal) {
        appInstance.openShareModal(postData);
      }
    });

    // 扩展重载时优雅清理
    ctx.onInvalidated(() => {
      adapter.stop();
    });

    // 划选快捷悬浮按钮监听
    const contextMenuSelection = createContextMenuSelection(adapter);

    // Some sites clear the DOM selection when their context menu opens. Keep the
    // original range before page handlers get a chance to change it.
    document.addEventListener('contextmenu', () => contextMenuSelection.capture(window.getSelection()), true);

    const handleSelectionChange = () => {
      if (!ctx.isValid || !appInstance) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        appInstance.hideFloatingButton?.();
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        appInstance.hideFloatingButton?.();
        return;
      }

      const range = selection.rangeCount ? selection.getRangeAt(0) : null;
      const entityEl = range && getSelectionEntity(adapter, range);
      if (!entityEl) {
        appInstance.hideFloatingButton?.();
        return;
      }
      contextMenuSelection.capture(selection);

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          appInstance.hideFloatingButton?.();
          return;
        }

        const x = rect.left + rect.width / 2;
        const y = rect.top > 45 ? rect.top - 8 : rect.bottom + 36;

        const savedRange = range.cloneRange();
        appInstance.showFloatingButton?.(x, y, () => {
          const postPromise = extractSelection(adapter, savedRange);
          if (appInstance && ctx.isValid) {
            appInstance.openShareModal(postPromise);
          }
        });
      }
    };

    document.addEventListener('mouseup', () => {
      setTimeout(handleSelectionChange, 10);
    });

    document.addEventListener('keyup', () => {
      setTimeout(handleSelectionChange, 10);
    });

    document.addEventListener('mousedown', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('quick-share-ui-container')) {
        setTimeout(() => {
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed) {
            appInstance?.hideFloatingButton?.();
          }
        }, 10);
      }
    });

    // 监听右键划选分享消息
    try {
      if (browser.runtime?.onMessage) {
        const onMessageListener = (message: unknown) => {
          if (!ctx.isValid) return;
          if (typeof message === 'object' && message !== null && 'type' in message) {
            const msg = message as { type: string; selectionText?: string };
            if (msg.type === 'QUICK_SHARE_SELECTION_TRIGGER') {
              const range = contextMenuSelection.take(window.getSelection(), msg.selectionText || '');
              if (!range) return;
              const postPromise = extractSelection(adapter, range);
              if (appInstance && ctx.isValid) {
                appInstance.openShareModal(postPromise);
              }
            }
          }
        };

        browser.runtime.onMessage.addListener(onMessageListener);
        ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessageListener));
      }
    } catch (e) {
      // 忽略上下文失效异常
    }
  },
});
