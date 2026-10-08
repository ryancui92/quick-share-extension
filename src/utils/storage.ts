import type { CardThemeId } from '@/types/theme';

export type UiThemeMode = 'system' | 'light' | 'dark';

export const KEY_LAST_CARD_THEME = 'quickshare_last_card_theme';
export const KEY_SIDEBAR_COLLAPSED = 'quickshare_sidebar_collapsed';
export const KEY_UI_THEME_MODE = 'quickshare_ui_theme_mode';

function getStorageApi() {
  const g = globalThis as any;
  if (typeof g.chrome !== 'undefined' && g.chrome.storage?.local) {
    return g.chrome.storage;
  }
  if (typeof browser !== 'undefined' && browser.storage?.local) {
    return browser.storage;
  }
  return null;
}

/**
 * 获取上次选中的卡片主题 ID
 */
export async function getLastCardTheme(): Promise<CardThemeId | null> {
  try {
    const storage = getStorageApi();
    if (!storage) return null;
    const data = await storage.local.get(KEY_LAST_CARD_THEME);
    return (data[KEY_LAST_CARD_THEME] as CardThemeId) || null;
  } catch (e) {
    console.warn('[QuickShare] Failed to get last card theme from storage:', e);
    return null;
  }
}

/**
 * 保存用户当前选中的卡片主题 ID
 */
export async function setLastCardTheme(themeId: CardThemeId): Promise<void> {
  try {
    const storage = getStorageApi();
    if (!storage) return;
    await storage.local.set({
      [KEY_LAST_CARD_THEME]: themeId,
    });
  } catch (e) {
    console.warn('[QuickShare] Failed to save card theme to storage:', e);
  }
}

/**
 * 获取侧边栏是否收起状态
 */
export async function getSidebarCollapsed(): Promise<boolean> {
  try {
    const storage = getStorageApi();
    if (!storage) return false;
    const data = await storage.local.get(KEY_SIDEBAR_COLLAPSED);
    if (typeof data[KEY_SIDEBAR_COLLAPSED] === 'boolean') {
      return data[KEY_SIDEBAR_COLLAPSED];
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * 保存侧边栏是否收起状态
 */
export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  try {
    const storage = getStorageApi();
    if (!storage) return;
    await storage.local.set({
      [KEY_SIDEBAR_COLLAPSED]: collapsed,
    });
  } catch (e) {
    console.warn('[QuickShare] Failed to save sidebar collapsed state to storage:', e);
  }
}

/**
 * 获取插件 UI 主题偏好 ('system' | 'light' | 'dark')
 */
export async function getUiThemeMode(): Promise<UiThemeMode> {
  try {
    const storage = getStorageApi();
    if (!storage) return 'system';
    const data = await storage.local.get(KEY_UI_THEME_MODE);
    return (data[KEY_UI_THEME_MODE] as UiThemeMode) || 'system';
  } catch (e) {
    console.warn('[QuickShare] Failed to get UI theme mode from storage:', e);
    return 'system';
  }
}

/**
 * 设置插件 UI 主题偏好 ('system' | 'light' | 'dark')
 */
export async function setUiThemeMode(mode: UiThemeMode): Promise<void> {
  try {
    const storage = getStorageApi();
    if (!storage) return;
    await storage.local.set({
      [KEY_UI_THEME_MODE]: mode,
    });
  } catch (e) {
    console.warn('[QuickShare] Failed to save UI theme mode to storage:', e);
  }
}

/**
 * 监听 Storage 变更
 */
export function onStorageChanged(
  callback: (changes: Record<string, { oldValue?: any; newValue?: any }>) => void
): () => void {
  const storage = getStorageApi();
  if (!storage?.onChanged) {
    return () => {};
  }

  const listener = (changes: Record<string, any>, areaName: string) => {
    if (areaName === 'local') {
      callback(changes);
    }
  };

  try {
    storage.onChanged.addListener(listener);
    return () => {
      storage.onChanged.removeListener(listener);
    };
  } catch {
    return () => {};
  }
}
