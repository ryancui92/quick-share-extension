import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { UniversalAdapter } from '@/adapters/universal.adapter';
import { getAdapterForUrl } from '@/adapters';
import { extractSelection, getSelectionEntity } from '@/utils/selection';
import { sanitizeWebExcerpt } from '@/utils/web-excerpt';

vi.mock('@/utils/exporter', () => ({ fetchImageAsDataUrl: vi.fn(async (url: string) => url) }));

const adapter = new UniversalAdapter();
const rangeIn = (selector: string, start = 0, end?: number) => {
  const node = document.querySelector(selector)!.firstChild!;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end ?? node.textContent!.length);
  return range;
};

beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

describe('Universal excerpt sharing', () => {
  it.each([
    ['https://x.com/user/status/1', 'x'],
    ['https://www.zhihu.com/question/1', 'zhihu'],
    ['https://chatgpt.com/c/1', 'chatgpt'],
    ['https://gemini.google.com/app/1', 'gemini'],
    ['https://mp.weixin.qq.com/s/article', 'universal'],
    ['http://example.com/story', 'universal'],
    ['https://notchatgpt.com/story', 'universal'],
    ['https://zhihu.com.example.org/story', 'universal'],
  ])('routes %s to %s', (url, platform) => {
    expect(getAdapterForUrl(new URL(url))?.platform).toBe(platform);
  });

  it.each(['chrome://extensions', 'file:///tmp/a.html', 'about:blank'])('does not run on %s', url => {
    expect(getAdapterForUrl(new URL(url))).toBeNull();
  });

  it('does not inject full-share controls or extract the whole page', async () => {
    document.body.innerHTML = '<article>Content</article>';
    adapter.start(() => { throw new Error('No full share'); });
    expect(document.querySelector('button')).toBeNull();
    expect(await adapter.extract(document.querySelector('article')!)).toBeNull();
    adapter.stop();
  });

  it('preserves cross-paragraph selected text, breaks and interleaved lazy images', async () => {
    document.body.innerHTML = '<article><p>Previous paragraph</p><p id="a">Start<br>next line</p><img data-src="/image.jpg"><p id="b"><strong>End</strong></p><p>Following paragraph</p></article>';
    const range = document.createRange();
    range.setStartBefore(document.querySelector('#a')!);
    range.setEndAfter(document.querySelector('#b')!);
    const result = await extractSelection(adapter, range);
    const output = document.createElement('div');
    output.innerHTML = result!.contentHtml!;
    expect(Array.from(output.children).map(el => el.tagName)).toEqual(['P', 'IMG', 'P']);
    expect(output.querySelector('br')).not.toBeNull();
    expect(output.querySelector('strong')?.textContent).toBe('End');
    expect(output.querySelector('img')?.getAttribute('src')).toBe(new URL('/image.jpg', document.baseURI).href);
    expect(result?.content).not.toContain('Previous');
    expect(result?.excerptBeforeHtml).toContain('Previous');
    expect(result?.excerptAfterHtml).toContain('Following');
  });

  it('preserves WeChat section paragraphs and blank lines through range extraction', async () => {
    document.body.innerHTML = '<div id="js_content"><section><span leaf=""><span textstyle="" style="font-size:16px">First</span></span></section><section><span><br></span></section><section><span style="font-weight:bold">Second<br><br>Third</span></section></div>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#js_content')!);
    const result = await extractSelection(adapter, range);
    const output = document.createElement('div');
    output.innerHTML = result!.contentHtml!;
    expect(Array.from(output.children).map(el => el.tagName)).toEqual(['SECTION', 'SECTION', 'SECTION']);
    expect(output.children[1].querySelector('br')).not.toBeNull();
    expect(output.querySelectorAll('br')).toHaveLength(3);
    expect(output.children[2].textContent).toBe('SecondThird');
  });

  it('keeps explicit zero margins around a blank line, image and caption', async () => {
    document.body.innerHTML = '<div id="js_content"><p style="margin:0 16px">Text</p><p style="margin:0 16px"><span><br></span></p><section style="margin:0 16px"><img data-src="https://example.com/image.jpg"></section><section style="margin-bottom:0px">Caption</section></div>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#js_content')!);
    const result = await extractSelection(adapter, range);
    const output = document.createElement('div');
    output.innerHTML = result!.contentHtml!;
    expect(Array.from(output.children).map(el => (el as HTMLElement).style.marginBottom)).toEqual(['0px', '0px', '0px', '0px']);
    expect(output.querySelectorAll('br')).toHaveLength(1);
    expect(Array.from(output.children).map(el => el.tagName)).toEqual(['P', 'P', 'SECTION', 'SECTION']);
    expect(output.querySelector('img')?.getAttribute('src')).toBe('https://example.com/image.jpg');
    expect((output.children[0] as HTMLElement).style.marginLeft).toBe('');
  });

  it('preserves safe vertical spacing without allowing host layout or resource expressions', () => {
    const output = document.createElement('div');
    output.innerHTML = sanitizeWebExcerpt('<p style="margin:12px 100vw 0px;position:fixed;height:500px">Text</p><p style="margin-bottom:var(--host-gap)">Next</p>', 'https://example.com');
    const first = output.children[0] as HTMLElement;
    expect(first.style.marginTop).toBe('12px');
    expect(first.style.marginBottom).toBe('0px');
    expect(first.style.marginRight).toBe('');
    expect(first.style.height).toBe('');
    expect(output.innerHTML).not.toContain('var(');
  });

  it('preserves inline formatting and does not add unselected media', async () => {
    document.body.innerHTML = '<article><p><img src="/unselected.jpg"><strong>Selected</strong></p></article>';
    const result = await extractSelection(adapter, rangeIn('strong'));
    expect(result?.contentHtml).toContain('<strong>Selected</strong>');
    expect(result?.contentHtml).not.toContain('<img');
  });

  it('retains a partial paragraph highlight and both nearby contexts', async () => {
    document.body.innerHTML = '<article><p>Before Selected After</p></article>';
    const result = await extractSelection(adapter, rangeIn('p', 7, 15));
    expect(result?.content).toBe('Selected');
    expect(result?.contentHtml).toContain('quick-share-spotlight');
    expect(result?.contentHtml).toContain('Before');
    expect(result?.contentHtml).toContain('After');
  });

  it.each(['<div contenteditable="true">Draft text</div>', '<textarea>Private draft</textarea>', '<nav>Navigation</nav>', '<div role="textbox">Draft</div>'])('ignores editable or navigation selections: %s', html => {
    document.body.innerHTML = html;
    const range = rangeIn('body > *');
    expect(getSelectionEntity(adapter, range)).toBeNull();
  });

  it('rejects a selection crossing a navigation boundary', () => {
    document.body.innerHTML = '<main><p>Start</p><nav>Navigation</nav><p>End</p></main>';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('main')!);
    expect(getSelectionEntity(adapter, range)).toBeNull();
  });

  it('reads WeChat article metadata and preserves URL identity parameters', async () => {
    const win = new Window({ url: 'https://mp.weixin.qq.com/s?__biz=abc&mid=123&idx=1&sn=signature&utm_source=test' });
    win.document.body.innerHTML = '<h1 id="activity-name">文章标题</h1><a id="js_name">公众号名称</a><span id="publish_time">2026年9月18日 09:30</span><div id="js_content"><p>正文内容</p></div>';
    const result = await adapter.extract(win.document.querySelector('#js_content') as unknown as HTMLElement, { selectedText: '正文', selectedHtml: '<p>正文</p>' });
    expect(result?.title).toBe('文章标题');
    expect(result?.author.name).toBe('公众号名称');
    expect(result?.siteName).toBe('微信公众号');
    expect(result?.createdAt).toBe('2026-09-18T09:30:00+08:00');
    expect(result?.url).toContain('__biz=abc&mid=123&idx=1&sn=signature');
    expect(result?.url).not.toContain('utm_source');
    await win.happyDOM.close();
  });

  it('uses site metadata and never fabricates missing publication dates', async () => {
    document.head.innerHTML = '<title>Page title</title><meta property="og:site_name" content="Example"><meta name="author" content="Author"><link rel="icon" href="/brand.png"><link rel="canonical" href="https://unrelated.example/article">';
    document.body.innerHTML = '<article>Text</article>';
    const result = await adapter.extract(document.querySelector('article')!, { selectedText: 'Text' });
    expect(result).toMatchObject({ title: 'Page title', author: { name: 'Author' }, siteName: 'Example' });
    expect(result?.createdAt).toBeUndefined();
    expect(result?.url).not.toContain('unrelated');
    expect(result?.siteIconUrl).toContain('/brand.png');
  });

  it('prefers the favicon chosen by the current browser tab', async () => {
    const previousBrowser = (globalThis as { browser?: unknown }).browser;
    vi.stubGlobal('browser', { runtime: { id: 'test-extension', sendMessage: vi.fn(async () => ({ url: 'https://example.com/tab-icon.png' })) } });
    try {
      document.head.innerHTML = '<link rel="icon" href="/page-icon.png">';
      document.body.innerHTML = '<article>Text</article>';
      const result = await adapter.extract(document.querySelector('article')!, { selectedText: 'Text' });
      expect(result?.siteIconUrl).toBe('https://example.com/tab-icon.png');
    } finally {
      vi.stubGlobal('browser', previousBrowser);
    }
  });

  it('keeps missing authors empty instead of attributing the article to the site', async () => {
    document.head.innerHTML = '<title>A useful article</title><meta property="og:site_name" content="Example"><meta property="article:author" content="https://example.com/user/1">';
    document.body.innerHTML = '<article>Text</article>';
    const result = await adapter.extract(document.querySelector('article')!, { selectedText: 'Text' });
    expect(result?.author.name).toBe('');
    expect(result?.siteName).toBe('Example');
    expect(result?.title).toBe('A useful article');
  });

  it('uses a WeChat account avatar rather than the article cover', async () => {
    const win = new Window({ url: 'https://mp.weixin.qq.com/s/article' });
    win.document.body.innerHTML = '<a id="js_name">公众号</a><div id="js_profile_qrcode"><img class="profile_avatar" data-src="https://example.com/account.png"></div><article><img src="https://example.com/cover.png">Text</article>';
    const result = await adapter.extract(win.document.querySelector('article') as unknown as HTMLElement, { selectedText: 'Text' });
    expect(result?.author).toEqual({ name: '公众号', avatarUrl: 'https://example.com/account.png' });
    await win.happyDOM.close();
  });

  it('reads the real portrait from the bottom WeChat account bar', async () => {
    const win = new Window({ url: 'https://mp.weixin.qq.com/s/G4FVwl--K4EIGXI589yaBQ' });
    win.document.body.innerHTML = '<a id="js_name">数字生命卡兹克</a><article><img src="https://example.com/article-cover.png">Text</article><div id="js_bottom_profile"><img class="wx_follow_avatar" data-src="https://mmbiz.qpic.cn/account-avatar/0"><img src="https://example.com/action-icon.svg"></div>';
    const result = await adapter.extract(win.document.querySelector('article') as unknown as HTMLElement, { selectedText: 'Text' });
    expect(result?.author).toEqual({ name: '数字生命卡兹克', avatarUrl: 'https://mmbiz.qpic.cn/account-avatar/0' });
    await win.happyDOM.close();
  });

  it('reads a WeChat account portrait set as a background image', async () => {
    const win = new Window({ url: 'https://mp.weixin.qq.com/s/article' });
    win.document.body.innerHTML = '<a id="js_name">公众号</a><article>Text</article><div id="js_bottom_profile"><span class="wx_follow_avatar" style="background-image:url(https://mmbiz.qpic.cn/background-avatar/0)"></span></div>';
    const result = await adapter.extract(win.document.querySelector('article') as unknown as HTMLElement, { selectedText: 'Text' });
    expect(result?.author.avatarUrl).toBe('https://mmbiz.qpic.cn/background-avatar/0');
    await win.happyDOM.close();
  });

  it('does not expose hidden, navigation or editable text in surrounding context', () => {
    expect(sanitizeWebExcerpt('<nav>Menu</nav><p hidden>Hidden</p><p aria-hidden="true">Hidden too</p><div contenteditable="true">Draft</div><p>Visible</p>', 'https://example.com')).toBe('<p>Visible</p>');
  });

  it('strips executable markup and host positioning while retaining text structure', () => {
    const html = sanitizeWebExcerpt('<p class="fixed" style="position:fixed; font-weight:700; background:url(https://tracker.example)">Safe<br><a href="javascript:alert(1)" onclick="alert(1)">Link</a><img data-src="/image.jpg" onerror="alert(1)"></p><script>alert(1)</script><iframe src="https://example.com"></iframe>', 'https://example.com/article');
    expect(html).not.toMatch(/javascript:|onclick|onerror|script|iframe|position|tracker|fixed/);
    expect(html).toContain('font-weight: 700');
    expect(html).toContain('src="https://example.com/image.jpg"');
    expect(html).toContain('<br>');
  });
});
