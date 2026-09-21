import { BaseAdapter, type OnShareTrigger, type ExcerptSelection } from './base';
import type { PostData, PostMedia } from '@/types/post';
import { cleanShareUrl } from '@/utils/url';
import { sanitizeHtmlForCard } from '@/utils/exporter';

export class XAdapter extends BaseAdapter {
  readonly platform = 'x';
  readonly name = 'X';
  private observer: MutationObserver | null = null;
  private onShareCallback: OnShareTrigger | null = null;

  match(url: URL): boolean {
    return ['x.com', 'twitter.com'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  }

  start(onShare: OnShareTrigger): void {
    this.onShareCallback = onShare;
    this.scanAndInject();

    this.observer = new MutationObserver(() => {
      this.scanAndInject();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    document.querySelectorAll('.quick-share-x-wrapper').forEach((el) => el.remove());
  }

  /**
   * 检查选区节点是否处于 X 推文容器内部
   */
  findEntityFromNode(node: Node): HTMLElement | null {
    const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
    if (!el) return null;
    return el.closest<HTMLElement>('article[data-testid="tweet"]');
  }

  /**
   * 获取 X 推文的正文根容器
   */
  getContentRootFromEntity(entity: HTMLElement): HTMLElement | null {
    return entity.querySelector<HTMLElement>('div[data-testid="tweetText"]') || entity;
  }

  private scanAndInject(): void {
    const tweets = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]');
    tweets.forEach((tweet) => {
      const actionGroup = tweet.querySelector<HTMLElement>('div[role="group"]');
      if (!actionGroup || actionGroup.querySelector('.quick-share-x-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'quick-share-x-wrapper';
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'center';
      wrapper.style.cursor = 'pointer';
      wrapper.style.padding = '0 6px';
      wrapper.style.color = 'rgb(113, 118, 123)';

      const btn = this.createShareButton(() => {
        if (this.onShareCallback) {
          this.onShareCallback(
            (async () => {
              await this.ensureExpanded(tweet);
              return this.extract(tweet);
            })()
          );
        }
      }, 'QuickShare 一键制图分享', 22);

      btn.style.background = 'transparent';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.padding = '4px';
      btn.style.borderRadius = '9999px';
      btn.style.color = 'inherit';
      btn.style.transition = 'background-color 0.2s, transform 0.15s';
      btn.onmouseenter = () => {
        btn.style.backgroundColor = 'rgba(29, 155, 240, 0.12)';
        btn.style.transform = 'scale(1.08)';
      };
      btn.onmouseleave = () => {
        btn.style.backgroundColor = 'transparent';
        btn.style.transform = 'scale(1)';
      };

      wrapper.appendChild(btn);
      actionGroup.appendChild(wrapper);
    });
  }

  /**
   * 检查长推文是否有「Show more / 显示更多」，若有则自动点击展开
   */
  private async ensureExpanded(tweet: HTMLElement): Promise<void> {
    const showMoreSelectors = [
      'button[data-testid="tweet-text-show-more-link"]',
      'div[data-testid="tweetText"] + div[role="button"]',
      'div[role="button"][tabindex="0"]',
    ];

    for (const selector of showMoreSelectors) {
      const candidates = tweet.querySelectorAll<HTMLElement>(selector);
      for (const btn of candidates) {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text.includes('show more') || text.includes('显示更多') || text.includes('展开')) {
          btn.click();
          await new Promise<void>((resolve) => setTimeout(resolve, 150));
          return;
        }
      }
    }
  }

  async extract(tweet?: HTMLElement, selection?: ExcerptSelection, skipContext = false): Promise<PostData | null> {
    if (!tweet) return null;

    try {
      // 提取作者信息
      const userNameEl = tweet.querySelector('div[data-testid="User-Name"]');
      let name = 'Unknown';
      let handle = '';
      if (userNameEl) {
        const links = userNameEl.querySelectorAll('a');
        if (links.length > 0) {
          name = links[0]?.textContent?.trim() || 'Unknown';
          const handleCandidate = links[1]?.textContent?.trim() || links[0]?.getAttribute('href')?.replace('/', '@') || '';
          handle = handleCandidate.startsWith('@') ? handleCandidate : `@${handleCandidate}`;
        } else {
          const parts = userNameEl.textContent?.split('@') || [];
          name = parts[0]?.trim() || 'Unknown';
          if (parts[1]) {
            handle = '@' + parts[1].split('·')[0]?.trim();
          }
        }
      }

      const avatarEl = tweet.querySelector<HTMLImageElement>('div[data-testid="Tweet-User-Avatar"] img');
      const avatarUrl = avatarEl?.getAttribute('src') || avatarEl?.src;

      // 提取时间与原文链接并清洗
      const timeEl = tweet.querySelector('time');
      const timeParentLink = timeEl?.closest('a');
      let rawUrl = timeParentLink ? (timeParentLink.getAttribute('href') || timeParentLink.href) : window.location.href;
      if (rawUrl.startsWith('/')) {
        rawUrl = `https://x.com${rawUrl}`;
      }
      const cleanUrl = cleanShareUrl(rawUrl);

      // 1. 提取正文内容与富文本 HTML
      let content = '';
      let contentHtml: string | undefined = undefined;
      let excerptBeforeHtml: string | undefined = undefined;
      let excerptAfterHtml: string | undefined = undefined;
      const isExcerpt = Boolean(selection);

      if (selection) {
        // 划选引述模式：保留富文本结构并提取前后上下文
        content = selection.selectedText.trim();
        const temp = document.createElement('div');
        temp.innerHTML = selection.selectedHtml || selection.selectedText.trim();
        this.convertNewlinesToBr(temp);
        contentHtml = sanitizeHtmlForCard(temp.innerHTML);

        if (selection.beforeHtml) {
          const beforeTemp = document.createElement('div');
          beforeTemp.innerHTML = selection.beforeHtml;
          this.convertNewlinesToBr(beforeTemp);
          excerptBeforeHtml = sanitizeHtmlForCard(beforeTemp.innerHTML);
        }
        if (selection.afterHtml) {
          const afterTemp = document.createElement('div');
          afterTemp.innerHTML = selection.afterHtml;
          this.convertNewlinesToBr(afterTemp);
          excerptAfterHtml = sanitizeHtmlForCard(afterTemp.innerHTML);
        }
      } else {
        const tweetTextEl = tweet.querySelector<HTMLElement>('div[data-testid="tweetText"]');
        if (tweetTextEl) {
          const clone = tweetTextEl.cloneNode(true) as HTMLElement;
          const links = clone.querySelectorAll<HTMLAnchorElement>('a');
          links.forEach((a) => {
            const href = a.getAttribute('href') || '';
            const text = a.textContent?.trim() || '';
            if (text.startsWith('@') || text.startsWith('#')) return;
            let actualUrl = a.title || href;
            if (actualUrl.startsWith('/')) {
              actualUrl = `https://x.com${actualUrl}`;
            }
            const span = document.createElement('span');
            span.textContent = ` ${actualUrl} `;
            a.replaceWith(span);
          });

          // 将 X 原生文本节点中的 \n 换行符显式转换为 <br />，确保排版换行 100% 保真
          this.convertNewlinesToBr(clone);

          // 处理推文内嵌表情 emoji <img> 保持行内尺寸与对齐
          clone.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
            if (img.src && (img.src.includes('emoji') || img.alt)) {
              img.className = 'inline-block w-4 h-4 align-text-bottom mx-0.5';
            }
          });

          content = clone.textContent?.trim() || '';
          contentHtml = sanitizeHtmlForCard(clone.innerHTML);
        }

        // 检查 Link Card / 网页链接卡片
        const cardEl = tweet.querySelector<HTMLElement>(
          'div[data-testid="card.wrapper"], [data-testid="card.layoutLarge.detail"], [data-testid="card.layoutSmall.detail"], div[data-testid="linkCard"], a[target="_blank"][role="link"]'
        );
        let cardUrl = '';
        if (cardEl) {
          const cardLink = cardEl.tagName.toLowerCase() === 'a' ? (cardEl as HTMLAnchorElement) : cardEl.querySelector<HTMLAnchorElement>('a[href]');
          if (cardLink) {
            const rawCardHref = cardLink.getAttribute('href') || cardLink.title || '';
            if (rawCardHref && (rawCardHref.startsWith('http') || !rawCardHref.startsWith('/'))) {
              cardUrl = cleanShareUrl(rawCardHref);
            }
          }
        }

        // 如果正文中未包含卡片链接，则附在正文末尾（排版位于图片上方）
        if (cardUrl && !content.includes(cardUrl)) {
          content = content ? `${content}\n\n${cardUrl}` : cardUrl;
          if (contentHtml) {
            contentHtml += `<p><a href="${cardUrl}">${cardUrl}</a></p>`;
          }
        }

        // 检查是否存在转发/引用原帖 (Quote Tweet)
        const quoteData = this.extractQuoteTweet(tweet);
        if (quoteData) {
          content += quoteData.text;
          if (contentHtml) {
            contentHtml += quoteData.html;
          } else {
            contentHtml = quoteData.html;
          }
        }
      }

      // 2. 提取当前推文自身的独立配图与视频（严格排除 Quote Tweet 原帖内的图片/视频）
      let mediaList: PostMedia[] | undefined = undefined;
      if (!selection) {
        const quoteEl = tweet.querySelector<HTMLElement>(
          'div[role="link"], div[data-testid="quoteTweet"], [role="link"][tabindex="0"]'
        );
        const list: PostMedia[] = [];

        // (1) 提取推文配图
        const photoEls = tweet.querySelectorAll<HTMLImageElement>(
          'div[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media/"], img[src*="pbs.twimg.com/card_img/"], div[data-testid="card.wrapper"] img, [data-testid="card.layoutLarge.detail"] img'
        );

        photoEls.forEach((img) => {
          if (quoteEl && quoteEl.contains(img)) return;
          // 排除视频容器内的占位元素
          if (img.closest('div[data-testid="videoComponent"], div[data-testid="videoPlayer"]')) return;
          if (img.src && !img.src.includes('emoji') && !img.src.includes('profile_images')) {
            let highResUrl = img.src;
            if (highResUrl.includes('name=')) {
              highResUrl = highResUrl.replace(/name=[a-zA-Z0-9_]+/, 'name=large');
            }
            if (!list.some((m) => m.url === highResUrl)) {
              list.push({
                type: 'image',
                url: highResUrl,
              });
            }
          }
        });

        // (2) 提取主推文视频首屏海报（包含时长）
        const mainVideoContainers = tweet.querySelectorAll<HTMLElement>(
          'div[data-testid="videoComponent"], div[data-testid="videoPlayer"], video'
        );
        for (const videoContainer of mainVideoContainers) {
          if (quoteEl && quoteEl.contains(videoContainer)) continue;
          const videoInfo = this.extractVideoInfo(videoContainer.closest('div[data-testid="tweetPhoto"], div[data-testid="videoPlayer"], div[data-testid="placementTracking"]') || videoContainer);
          if (videoInfo && !list.some((m) => m.url === videoInfo.posterUrl)) {
            list.push({
              type: 'video',
              url: videoInfo.posterUrl,
              posterUrl: videoInfo.posterUrl,
              duration: videoInfo.duration,
            });
            break;
          }
        }

        if (list.length > 0) mediaList = list;
      }

      // 3. 提取推文上下文对话链 (上级回复 / 主帖)
      let contextThread = undefined;
      if (!skipContext && !selection) {
        contextThread = await this.findContextThread(tweet);
      }

      return {
        id: cleanUrl,
        platform: 'x',
        createdAt: timeEl?.getAttribute('datetime') || undefined,
        url: cleanUrl,
        author: {
          name,
          handle,
          avatarUrl,
        },
        content,
        contentHtml,
        isExcerpt,
        excerptBeforeHtml,
        excerptAfterHtml,
        media: mediaList,
        contextThread,
      };
    } catch (err) {
      console.error('[QuickShare] Failed to extract tweet data:', err);
      return null;
    }
  }

  /**
   * 从推文节点提取其唯一的推文 ID (Tweet ID)
   */
  extractTweetId(tweet: HTMLElement): string | null {
    const timeLink = tweet.querySelector('time')?.closest<HTMLAnchorElement>('a');
    const href = timeLink?.getAttribute('href') || timeLink?.href || '';
    const match = href.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 获取当前页面 URL 中的焦点/主推文 ID (Focal Tweet ID)
   */
  getFocalTweetId(): string | null {
    if (typeof window === 'undefined' || !window.location) return null;
    const match = window.location.pathname.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 提取推文的作者 Handle (如 "@username")
   */
  extractAuthorHandle(tweet: HTMLElement): string {
    const userNameEl = tweet.querySelector('div[data-testid="User-Name"]');
    if (userNameEl) {
      const links = userNameEl.querySelectorAll('a');
      if (links.length > 0) {
        const handleCandidate = links[1]?.textContent?.trim() || links[0]?.getAttribute('href')?.replace('/', '@') || '';
        return handleCandidate.startsWith('@') ? handleCandidate : `@${handleCandidate}`;
      }
      const parts = userNameEl.textContent?.split('@') || [];
      if (parts[1]) {
        return '@' + parts[1].split('·')[0]?.trim();
      }
    }
    return '';
  }

  /**
   * 提取推文正文上方的 "Replying to @xxx" 或正文开头的被回复目标 Handles
   */
  extractRepliedHandles(tweet: HTMLElement): string[] {
    const handles: string[] = [];
    const userNameEl = tweet.querySelector('div[data-testid="User-Name"]');

    // 1. 扫描推文内所有用户链接 (排除操作栏和头像)
    const allLinks = Array.from(tweet.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'));
    for (const a of allLinks) {
      if (a.closest('div[role="group"]') || a.closest('div[data-testid="Tweet-User-Avatar"]')) continue;
      if (userNameEl && userNameEl.contains(a)) continue;

      const text = a.textContent?.trim() || '';
      const href = a.getAttribute('href') || '';
      if (text.startsWith('@')) {
        const clean = text.toLowerCase();
        if (!handles.includes(clean)) {
          handles.push(clean);
        }
      } else if (href.startsWith('/') && !href.includes('/status/') && !href.includes('/i/')) {
        const clean = `@${href.replace(/^\//, '').split('/')[0]}`.toLowerCase();
        if (clean !== '@' && !handles.includes(clean)) {
          handles.push(clean);
        }
      }
    }

    // 2. 扫描推文正文文本前 60 个字符中的 @ 提及
    const tweetTextEl = tweet.querySelector('div[data-testid="tweetText"]');
    if (tweetTextEl) {
      const textHead = tweetTextEl.textContent?.slice(0, 80) || '';
      const matches = textHead.match(/@[a-zA-Z0-9_]+/g);
      if (matches) {
        for (const m of matches) {
          const clean = m.toLowerCase();
          if (!handles.includes(clean)) {
            handles.push(clean);
          }
        }
      }
    }

    return handles;
  }

  /**
   * 检查推文节点是否存在垂直 Thread 连接线 (视觉连线)
   */
  hasThreadConnector(tweet: HTMLElement, position: 'top' | 'bottom'): boolean {
    const avatarCol = tweet.querySelector('div[data-testid="Tweet-User-Avatar"]')?.parentElement;
    if (!avatarCol) return false;

    const lineCandidates = avatarCol.querySelectorAll<HTMLElement>('div');
    for (const el of lineCandidates) {
      if (el.querySelector('img')) continue;
      const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (!style) continue;
      const width = parseFloat(style.width);
      const height = parseFloat(style.height);
      const bg = style.backgroundColor;
      if (width >= 1 && width <= 6 && height >= 6 && bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查两个推文是否处于同一个 DOM Conversation 容器 / cellInnerDiv 内
   */
  isSameConversationContainer(tweetA: HTMLElement, tweetB: HTMLElement): boolean {
    const cellA = tweetA.closest('div[data-testid="cellInnerDiv"], [data-testid="conversationthread"]');
    const cellB = tweetB.closest('div[data-testid="cellInnerDiv"], [data-testid="conversationthread"]');
    if (cellA && cellB && cellA === cellB) {
      return true;
    }
    return false;
  }

  /**
   * 检查推文是否为赞助/推广广告推文 (Promoted / Ad Tweet)
   */
  isPromotedTweet(tweet: HTMLElement): boolean {
    // 1. 检查推文是否缺少常规 time 链接（广告推文通常没有标准的推文发布时间 /status/ 链接）
    const timeLink = tweet.querySelector('time')?.closest<HTMLAnchorElement>('a');
    const href = timeLink?.getAttribute('href') || timeLink?.href || '';
    if (!timeLink || !href.includes('/status/')) {
      return true;
    }

    // 2. 检查是否有独立的推广/广告标记
    const badges = tweet.querySelectorAll('span, div');
    for (const el of badges) {
      if (el.children.length === 0) {
        const text = el.textContent?.trim() || '';
        if (text === 'Ad' || text === 'Promoted' || text === '推广' || text === '赞助' || text === '广告') {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 严格验证 candidate 上级推文是否为当前推文真实的直接父回复
   */
  private isValidParentTweet(currentTweet: HTMLElement, parentCandidate: HTMLElement, rootTweet: HTMLElement): boolean {
    if (this.isPromotedTweet(parentCandidate)) return false;

    const parentTweetId = this.extractTweetId(parentCandidate);
    const rootTweetId = this.extractTweetId(rootTweet);
    if (!parentTweetId || (rootTweetId && parentTweetId === rootTweetId)) {
      return false;
    }

    const parentHandle = this.extractAuthorHandle(parentCandidate).toLowerCase();
    const rootHandle = this.extractAuthorHandle(rootTweet).toLowerCase();
    const repliedHandles = this.extractRepliedHandles(currentTweet);

    // 1. 如果当前推文明确包含指向 parentHandle 的回复或提及标记
    if (parentHandle && repliedHandles.some((h) => h === parentHandle || h === parentHandle.replace(/^@/, ''))) {
      if (parentHandle === rootHandle) {
        // 同作者多条回复时需确认连线
        return this.hasThreadConnector(currentTweet, 'top') || this.hasThreadConnector(parentCandidate, 'bottom') || this.isSameConversationContainer(currentTweet, parentCandidate);
      }
      return true;
    }

    // 2. 检查 DOM 容器与 Thread 物理连线
    if (this.isSameConversationContainer(currentTweet, parentCandidate)) {
      return true;
    }
    if (this.hasThreadConnector(currentTweet, 'top') || this.hasThreadConnector(parentCandidate, 'bottom')) {
      return true;
    }

    return false;
  }

  /**
   * 向上追溯当前推文的上级推文 (Parent Tweet) 与主帖 (Root Tweet)
   */
  private async findContextThread(tweet: HTMLElement): Promise<{ rootPost?: PostData; parentPost?: PostData } | undefined> {
    try {
      if (this.isPromotedTweet(tweet)) return undefined;

      const currentTweetId = this.extractTweetId(tweet);
      const focalTweetId = this.getFocalTweetId();

      // 只关联详情页已加载的主帖；首页/搜索结果不能按 DOM 顺序猜测关系。
      if (!focalTweetId || !currentTweetId || currentTweetId === focalTweetId) {
        return undefined;
      }

      // 过滤掉所有广告推文
      const allTweets = Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))
        .filter((t) => !this.isPromotedTweet(t));

      const currentIndex = allTweets.indexOf(tweet);
      if (currentIndex < 0) return undefined;

      // 2. 精准定位真实主帖 (Root Tweet)：在 DOM 列表中查找匹配 focalTweetId 的推文
      let rootTweet: HTMLElement | null = null;
      if (focalTweetId) {
        rootTweet = allTweets.find((t) => this.extractTweetId(t) === focalTweetId) || null;
      }

      // 主帖必须已加载且位于当前评论之前，不能引用自己或后续推荐。
      if (!rootTweet || allTweets.indexOf(rootTweet) >= currentIndex) {
        return undefined;
      }

      // 3. 寻找并严格验证直接父级回复 (Parent Tweet)
      let parentCandidate: HTMLElement | null = null;
      if (currentIndex > 0) {
        const prev = allTweets[currentIndex - 1];
        if (prev !== tweet) {
          parentCandidate = prev;
        }
      }

      const isSameAsRoot = Boolean(rootTweet && parentCandidate && parentCandidate === rootTweet);
      const isParentValid = Boolean(
        parentCandidate &&
        !isSameAsRoot &&
        rootTweet &&
        this.isValidParentTweet(tweet, parentCandidate, rootTweet)
      );

      // 异步提取上级与根推文 (使用 skipContext = true 避免循环递归)
      const [parentPost, rootPost] = await Promise.all([
        isParentValid && parentCandidate ? this.extract(parentCandidate, undefined, true) : Promise.resolve(null),
        rootTweet ? this.extract(rootTweet, undefined, true) : Promise.resolve(null),
      ]);

      if (!parentPost && !rootPost) return undefined;

      return {
        parentPost: parentPost || undefined,
        rootPost: rootPost || undefined,
      };
    } catch (e) {
      console.warn('[QuickShare] Failed to find context thread:', e);
      return undefined;
    }
  }

  /**
   * 提取转发/引用的原帖 (Quote Tweet) 结构
   */
  private extractQuoteTweet(tweet: HTMLElement): { html: string; text: string; element: HTMLElement } | null {
    // 寻找推文容器内部的引用推文块 (role="link" 且内部含有 User-Name 或 tweetText，或者是旧版 data-testid="quoteTweet")
    const candidates = tweet.querySelectorAll<HTMLElement>(
      'div[role="link"], div[data-testid="quoteTweet"], [role="link"][tabindex="0"]'
    );
    let quoteEl: HTMLElement | null = null;
    for (const el of candidates) {
      if (el === tweet) continue;
      // 排除操作栏内的链接、用户头像链接、时间链接等非 Quote 卡片
      if (el.closest('div[role="group"]') || el.closest('div[data-testid="User-Name"]')) continue;
      if (el.querySelector('[data-testid="User-Name"], [data-testid="Tweet-User-Avatar"], [data-testid="tweetText"]')) {
        quoteEl = el;
        break;
      }
    }
    if (!quoteEl) return null;

    // 1. 提取原作者头像
    const avatarEl = quoteEl.querySelector<HTMLImageElement>(
      'div[data-testid="Tweet-User-Avatar"] img, img[src*="profile_images"]'
    );
    const avatarUrl = avatarEl?.getAttribute('src') || avatarEl?.src || '';

    // 2. 提取原作者名称、Handle、时间
    let quoteAuthorName = '原帖作者';
    let quoteHandle = '';
    let quoteTime = '';
    const userNameEl = quoteEl.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      const timeEl = userNameEl.querySelector('time');
      if (timeEl) {
        quoteTime = `· ${timeEl.textContent?.trim() || ''}`;
      }
      const links = userNameEl.querySelectorAll('a');
      if (links.length > 0) {
        quoteAuthorName = links[0]?.textContent?.trim() || '原帖作者';
        const h = links[1]?.textContent?.trim() || links[0]?.getAttribute('href')?.replace('/', '@') || '';
        quoteHandle = h.startsWith('@') ? h : `@${h}`;
      } else {
        const fullText = userNameEl.textContent || '';
        const parts = fullText.split('@');
        quoteAuthorName = parts[0]?.trim() || '原帖作者';
        if (parts[1]) {
          quoteHandle = '@' + parts[1].split('·')[0]?.trim();
        }
      }
    }

    // 3. 提取原帖正文
    let quoteTextHtml = '';
    let quoteRawText = '';
    const tweetTextEl = quoteEl.querySelector<HTMLElement>('div[data-testid="tweetText"]');
    if (tweetTextEl) {
      const clone = tweetTextEl.cloneNode(true) as HTMLElement;
      // 转换链接
      clone.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
        const href = a.getAttribute('href') || '';
        const text = a.textContent?.trim() || '';
        if (text.startsWith('@') || text.startsWith('#')) return;
        let actualUrl = a.title || href;
        if (actualUrl.startsWith('/')) {
          actualUrl = `https://x.com${actualUrl}`;
        }
        const span = document.createElement('span');
        span.textContent = ` ${actualUrl} `;
        a.replaceWith(span);
      });
      this.convertNewlinesToBr(clone);
      clone.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
        if (img.src && (img.src.includes('emoji') || img.alt)) {
          img.className = 'inline-block w-4 h-4 align-text-bottom mx-0.5';
        }
      });
      quoteTextHtml = clone.innerHTML;
      quoteRawText = clone.textContent?.trim() || '';
    }

    // 4. 提取原帖配图 (最多支持 4 张网格)
    const quoteImgs: string[] = [];
    const photoEls = quoteEl.querySelectorAll<HTMLImageElement>(
      'div[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media/"]'
    );
    photoEls.forEach((img) => {
      if (img.src && !img.src.includes('emoji') && !img.src.includes('profile_images')) {
        let highResUrl = img.src;
        if (highResUrl.includes('name=')) {
          highResUrl = highResUrl.replace(/name=[a-zA-Z0-9_]+/, 'name=large');
        }
        if (!quoteImgs.includes(highResUrl)) {
          quoteImgs.push(highResUrl);
        }
      }
    });

    // 检查原帖视频
    const quoteVideoInfo = this.extractVideoInfo(quoteEl);

    // 5. 组装嵌入式 Quote Tweet DOM
    let html = '<div class="quick-share-quote-tweet">';
    
    // Header
    html += '<div class="quick-share-quote-header">';
    if (avatarUrl) {
      html += `<img class="quick-share-quote-avatar" src="${avatarUrl}" alt="avatar" crossorigin="anonymous" />`;
    }
    html += `<span class="quick-share-quote-name">${quoteAuthorName}</span>`;
    if (quoteHandle) {
      html += `<span class="quick-share-quote-handle">${quoteHandle}</span>`;
    }
    if (quoteTime) {
      html += `<span class="quick-share-quote-time">${quoteTime}</span>`;
    }
    html += '</div>';

    // Body
    if (quoteTextHtml) {
      html += `<div class="quick-share-quote-text">${quoteTextHtml}</div>`;
    }

    // Media
    if (quoteImgs.length > 0) {
      const gridClass = quoteImgs.length === 1 ? 'grid-cols-1' : `qs-media-mosaic ${quoteImgs.length === 3 ? 'qs-media-three' : quoteImgs.length === 4 ? 'qs-media-four' : quoteImgs.length > 4 ? 'qs-media-many' : ''}`;
      html += `<div class="quick-share-quote-media-grid ${gridClass}">`;
      quoteImgs.forEach((src) => {
        html += `<img class="quick-share-quote-img" src="${src}" alt="media" crossorigin="anonymous" />`;
      });
      html += '</div>';
    } else if (quoteVideoInfo) {
      html += `<div class="quick-share-quote-media-grid grid-cols-1">`;
      html += `<div class="quick-share-video-container">`;
      html += `<img class="quick-share-quote-img" src="${quoteVideoInfo.posterUrl}" alt="video thumbnail" crossorigin="anonymous" />`;
      html += `<div class="qs-video-play-badge"><svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 ml-0.5"><path d="M8 5v14l11-7z"/></svg></div>`;
      if (quoteVideoInfo.duration) {
        html += `<div class="qs-video-duration-badge">${quoteVideoInfo.duration}</div>`;
      }
      html += `</div>`;
      html += `</div>`;
    }

    html += '</div>';

    const text = `\n\n[原帖 @${quoteHandle} ${quoteAuthorName}]: ${quoteRawText}`;

    return {
      html,
      text,
      element: quoteEl,
    };
  }

  /**
   * 提取视频海报 (Poster) 及视频时长
   */
  private extractVideoInfo(container: HTMLElement): { posterUrl: string; duration?: string } | null {
    let posterUrl = '';
    let duration: string | undefined = undefined;

    // 1. 从 video 标签提取 poster 属性
    const videoEl = container.tagName.toLowerCase() === 'video' ? (container as HTMLVideoElement) : container.querySelector<HTMLVideoElement>('video');
    if (videoEl) {
      posterUrl = videoEl.getAttribute('poster') || videoEl.poster || '';
    }

    // 2. 若无 poster，尝试从推文背景图或视频缩略图 img 标签提取
    if (!posterUrl) {
      const thumbImg = container.querySelector<HTMLImageElement>(
        'img[src*="amplify_video_thumb"], img[src*="ext_tw_video_thumb"], img[src*="video_thumb"], img[src*="pbs.twimg.com/media/"]'
      );
      if (thumbImg) {
        posterUrl = thumbImg.getAttribute('src') || thumbImg.src || '';
      }
    }

    // 3. 若仍未找到，检查 style 中是否有 background-image
    if (!posterUrl) {
      const bgEls = container.querySelectorAll<HTMLElement>('[style*="background-image"]');
      for (const el of bgEls) {
        const bg = el.style.backgroundImage || '';
        const match = bg.match(/url\(["']?(https:\/\/[^"']+)["']?\)/);
        if (match && match[1] && (match[1].includes('video_thumb') || match[1].includes('amplify_video_thumb') || match[1].includes('twimg.com'))) {
          posterUrl = match[1];
          break;
        }
      }
    }

    if (!posterUrl) return null;

    // 4. 提取视频时长文本 (例如 3:40, 0:15 等格式)
    const durationRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;
    const textEls = container.querySelectorAll<HTMLElement>('span, div[role="progressbar"] + span, [data-testid="app-bar-duration"]');
    for (const el of textEls) {
      const text = el.textContent?.trim() || '';
      if (durationRegex.test(text)) {
        duration = text;
        break;
      }
    }
    if (!duration) {
      const allSpans = container.querySelectorAll('span');
      for (const s of allSpans) {
        const t = s.textContent?.trim() || '';
        if (durationRegex.test(t)) {
          duration = t;
          break;
        }
      }
    }

    return {
      posterUrl,
      duration,
    };
  }

  /**
   * 将 X (Twitter) 原生文本节点中的 \n 换行符显式转换为 <br />，确保排版换行 100% 保真
   */
  private convertNewlinesToBr(root: HTMLElement): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text);
    }

    textNodes.forEach((node) => {
      if (!node.nodeValue || !node.nodeValue.includes('\n')) return;

      // HTML 块之间的缩进不是正文换行；行内元素之间的换行仍需保留。
      if (node.nodeValue.trim() === '') {
        const blockTags = /^(P|SECTION|ARTICLE|FIGURE|FIGCAPTION|UL|OL|LI|BLOCKQUOTE|TABLE|H[1-6]|PRE|HR)$/;
        const isBlock = (sibling: Node | null) => sibling instanceof Element && blockTags.test(sibling.tagName);
        if (!node.previousSibling || !node.nextSibling || isBlock(node.previousSibling) || isBlock(node.nextSibling)) {
          node.remove();
          return;
        }
      }

      const fragment = document.createDocumentFragment();
      const parts = node.nodeValue.split('\n');
      parts.forEach((part, index) => {
        if (index > 0) {
          fragment.appendChild(document.createElement('br'));
        }
        if (part) {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      node.parentNode?.replaceChild(fragment, node);
    });
  }
}
