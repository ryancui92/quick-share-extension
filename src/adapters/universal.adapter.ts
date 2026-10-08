import { BaseAdapter, type ExcerptSelection, type OnShareTrigger } from './base';
import type { PostData } from '@/types/post';
import { fetchImageAsDataUrl } from '@/utils/exporter';
import { cleanShareUrl } from '@/utils/url';
import { extractPostDate, formatPostDate } from '@/utils/post-date';
import { sanitizeWebExcerpt, webUrl } from '@/utils/web-excerpt';

export const EXCLUDED_SELECTION = 'input, textarea, select, button, [contenteditable]:not([contenteditable="false"]), [role="textbox"], nav, [role="navigation"], script, style, noscript, [hidden], [aria-hidden="true"], quick-share-ui-container';

/** WeChat may put the account portrait in its bottom author bar instead of the profile popup. */
function wechatAccountAvatarUrl(doc: Document): string | undefined {
  const selectors = [
    '#js_bottom_profile .wx_follow_avatar img',
    '#js_bottom_profile img.wx_follow_avatar',
    '#js_bottom_profile img[class*="avatar"]',
    '#js_bottom_profile img[id*="avatar"]',
    '.wx_follow_avatar img',
    'img.wx_follow_avatar',
    '#js_profile_qrcode .profile_avatar',
    'img.profile_avatar',
  ];
  for (const selector of selectors) {
    for (const image of doc.querySelectorAll<HTMLImageElement>(selector)) {
      const url = webUrl(image.getAttribute('data-src') || image.getAttribute('data-original') || image.getAttribute('src'), doc.baseURI);
      if (url) return url;
    }
  }

  // Some article templates render the portrait as a background image.
  const portrait = doc.querySelector<HTMLElement>('#js_bottom_profile .wx_follow_avatar, #js_bottom_profile .profile_avatar, #js_bottom_profile [class*="avatar"], #js_profile_qrcode .profile_avatar');
  const background = portrait?.style.backgroundImage || (portrait && doc.defaultView?.getComputedStyle(portrait).backgroundImage) || '';
  const backgroundUrl = background.match(/url\(\s*["']?([^"')]+)["']?\s*\)/i)?.[1];
  if (backgroundUrl) return webUrl(backgroundUrl, doc.baseURI);

  // Only search inside the account bar; an article cover must never become the author avatar.
  for (const image of doc.querySelectorAll<HTMLImageElement>('#js_bottom_profile img')) {
    const url = webUrl(image.getAttribute('data-src') || image.getAttribute('src'), doc.baseURI);
    if (url && /(?:mmbiz|qpic|wx\.qlogo)\./i.test(new URL(url).hostname)) return url;
  }
  return undefined;
}

/** The browser's chosen tab icon can differ from the first favicon link in the page. */
async function currentTabIconUrl(doc: Document): Promise<string | undefined> {
  if (typeof browser !== 'undefined' && browser.runtime?.id) {
    try {
      const result = await browser.runtime.sendMessage({ type: 'GET_TAB_FAVICON' }) as { url?: string } | undefined;
      const tabIcon = result?.url?.startsWith('data:image/') ? result.url : webUrl(result?.url, doc.baseURI);
      if (tabIcon) return tabIcon;
    } catch { /* The page favicon remains available when the tab API is unavailable. */ }
  }
  const iconLinks = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  for (const link of iconLinks.reverse()) {
    const icon = webUrl(link.href, doc.baseURI);
    if (icon) return icon;
  }
  return undefined;
}

/** Ordinary pages are excerpt-only: no page observer or full-article button. */
export class UniversalAdapter extends BaseAdapter {
  readonly platform = 'universal';
  readonly name = '网页';

  match(url: URL): boolean {
    return url.protocol === 'https:' || url.protocol === 'http:';
  }

  start(_onShare: OnShareTrigger): void {}
  stop(): void {}

  findEntityFromNode(node: Node): HTMLElement | null {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
    if (!element || !element.isConnected || element.closest(EXCLUDED_SELECTION)) return null;
    // Prefer article boundaries. On pages without semantic markup, use the nearest
    // block container; the shared resolver passes the range's common ancestor.
    return element.closest<HTMLElement>('#js_content, [itemprop="articleBody"], article, main, [role="main"]')
      || element.closest<HTMLElement>('div, section, blockquote, ul, ol, table, body');
  }

  getContentRootFromEntity(entity: HTMLElement): HTMLElement {
    return entity;
  }

  async extract(entity?: HTMLElement, selection?: ExcerptSelection): Promise<PostData | null> {
    if (!entity || !selection?.selectedText.trim()) return null;
    const doc = entity.ownerDocument;
    const url = new URL(doc.URL);
    const wechat = url.hostname === 'mp.weixin.qq.com';
    const meta = (selector: string) => doc.querySelector(selector)?.getAttribute('content')?.trim() || '';
    const siteName = meta('meta[property="og:site_name"]') || (wechat ? '微信公众号' : url.hostname);
    const author = [
      wechat ? doc.querySelector('#js_name')?.textContent?.trim() : '',
      meta('meta[name="author"]'), meta('meta[property="article:author"]'),
    ].find(value => value && !/^https?:\/\//i.test(value)) || '';
    const avatarUrl = wechat ? wechatAccountAvatarUrl(doc) : undefined;
    const title = (wechat ? doc.querySelector('#activity-name')?.textContent?.trim() : '')
      || meta('meta[property="og:title"]') || doc.title || entity.querySelector('h1')?.textContent || '';
    const icon = await currentTabIconUrl(doc);
    const canonical = webUrl(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), doc.baseURI);
    // A foreign canonical must never redirect attribution to another site.
    const shareUrl = canonical && new URL(canonical).origin === url.origin ? canonical : url.href;
    let createdAt = meta('meta[property="article:published_time"]')
      || meta('meta[itemprop="datePublished"]') || extractPostDate(entity);
    if (wechat && !createdAt) {
      const published = doc.querySelector('#publish_time')?.textContent?.trim() || '';
      const match = published.match(/^(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        createdAt = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        if (hour) createdAt += `T${hour.padStart(2, '0')}:${minute}:${second || '00'}+08:00`;
      }
    }
    // Never substitute the sharing time for an unknown publication time.
    if (!createdAt || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(createdAt) || !formatPostDate(createdAt)) createdAt = undefined;
    const fallback = doc.createElement('p');
    fallback.textContent = selection.selectedText;
    const content = doc.createElement('div');
    content.innerHTML = sanitizeWebExcerpt(selection.selectedHtml || fallback.outerHTML, doc.baseURI);
    // WeChat and many article CDNs block page-side cross-origin image requests.
    await Promise.all(Array.from(content.querySelectorAll('img')).map(async image => {
      image.src = await fetchImageAsDataUrl(image.src);
    }));
    return {
      id: `excerpt-${Date.now()}`,
      platform: this.platform,
      url: cleanShareUrl(shareUrl),
      author: { name: author, ...(avatarUrl ? { avatarUrl: await fetchImageAsDataUrl(avatarUrl) } : {}) },
      siteName,
      siteIconUrl: icon ? await fetchImageAsDataUrl(icon) : undefined,
      title: title.trim() || undefined,
      createdAt,
      content: selection.selectedText,
      contentHtml: content.innerHTML,
      isExcerpt: true,
      excerptBeforeHtml: sanitizeWebExcerpt(selection.beforeHtml || '', doc.baseURI) || undefined,
      excerptAfterHtml: sanitizeWebExcerpt(selection.afterHtml || '', doc.baseURI) || undefined,
    };
  }
}
