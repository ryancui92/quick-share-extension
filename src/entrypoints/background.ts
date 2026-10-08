function bufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return `data:${mimeType || 'image/png'};base64,${btoa(binary)}`;
}

export default defineBackground(() => {
  // 注册右键菜单（仅限划选文本时展示）
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'quick-share-selection',
      title: 'QuickShare',
      contexts: ['selection'],
    });
  });

  // 处理右键菜单点击
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'quick-share-selection' && tab?.id) {
      void browser.tabs.sendMessage(tab.id, {
        type: 'QUICK_SHARE_SELECTION_TRIGGER',
        selectionText: info.selectionText,
      }).catch((error) => {
        console.warn('[QuickShare Background] Selection message failed:', error);
      });
    }
  });

  // 处理跨域受限图片的无 CORS 阻拦代理抓取
  browser.runtime.onMessage.addListener((message: any, sender: { tab?: { id?: number; favIconUrl?: string } }) => {
    if (message?.type === 'GET_TAB_FAVICON') {
      return (async () => {
        if (!sender.tab?.id) return { url: '' };
        try {
          const tab = await browser.tabs.get(sender.tab.id);
          return { url: tab.favIconUrl || sender.tab.favIconUrl || '' };
        } catch {
          return { url: sender.tab.favIconUrl || '' };
        }
      })();
    }
    if (message?.type === 'FETCH_IMAGE_BASE64' && message.url) {
      return (async () => {
        try {
          let res: Response;
          try {
            res = await fetch(message.url, { credentials: 'include' });
          } catch {
            res = await fetch(message.url);
          }
          if (!res.ok) {
            res = await fetch(message.url);
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const mimeType = res.headers.get('content-type') || 'image/png';
          const buffer = await res.arrayBuffer();
          const dataUrl = bufferToDataUrl(buffer, mimeType);
          return { success: true, dataUrl };
        } catch (err: any) {
          console.warn('[QuickShare Background] Fetch image error:', message.url, err);
          return { success: false, error: err?.message || String(err) };
        }
      })();
    }
  });
});
