import { describe, it, expect, beforeEach } from 'vitest';
import { XAdapter } from '@/adapters/x.adapter';
import { X_TWEET_SIMPLE_HTML, X_TWEET_MULTILINE_IMAGES_HTML } from '../fixtures/x.fixture';

describe('XAdapter 结构解析与数据提取测试', () => {
  let adapter: XAdapter;

  beforeEach(() => {
    adapter = new XAdapter();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'location', { value: new URL('https://x.com/elonmusk/status/1000'), writable: true });
  });

  it('does not attach an unrelated earlier tweet from the home feed', async () => {
    Object.defineProperty(window, 'location', { value: new URL('https://x.com/home'), writable: true });
    document.body.innerHTML = X_TWEET_SIMPLE_HTML + X_TWEET_SIMPLE_HTML.replaceAll('123456789', '987654321');
    const tweets = document.querySelectorAll<HTMLElement>('article');
    const post = await adapter.extract(tweets[1]);
    expect(post?.contextThread).toBeUndefined();
  });

  describe('1. 路由与 URL 匹配', () => {
    it('匹配 x.com 和 twitter.com', () => {
      expect(adapter.match(new URL('https://x.com/elonmusk/status/123'))).toBe(true);
      expect(adapter.match(new URL('https://twitter.com/elonmusk/status/123'))).toBe(true);
      expect(adapter.match(new URL('https://zhihu.com'))).toBe(false);
    });
  });

  describe('2. 推文数据提取与换行/图片保真', () => {
    it('正确提取单推文作者、handle、头像、正文及规范 URL', async () => {
      document.body.innerHTML = X_TWEET_SIMPLE_HTML;
      const tweetEl = document.querySelector<HTMLElement>('article[data-testid="tweet"]')!;
      expect(tweetEl).not.toBeNull();

      const postData = await adapter.extract(tweetEl);
      expect(postData).not.toBeNull();

      expect(postData?.platform).toBe('x');
      expect(postData?.author.name).toBe('Elon Musk');
      expect(postData?.author.handle).toBe('@elonmusk');
      expect(postData?.author.avatarUrl).toContain('avatar_normal.jpg');
      expect(postData?.contentHtml).toContain('Slow is Fast');
      
      // 验证 URL 剔除追踪参数
      expect(postData?.url).toBe('https://x.com/elonmusk/status/1234567890');
    });

    it('正确提取多段落换行推文与图片数组', async () => {
      document.body.innerHTML = X_TWEET_MULTILINE_IMAGES_HTML;
      const tweetEl = document.querySelector<HTMLElement>('article[data-testid="tweet"]')!;

      const postData = await adapter.extract(tweetEl);
      expect(postData).not.toBeNull();

      // 验证换行符 <br> 完整保留
      expect(postData?.contentHtml).toContain('<br');
      expect(postData?.contentHtml).toContain('First paragraph');
      expect(postData?.contentHtml).toContain('Second paragraph');

      // 验证多图解析与高清源升级
      expect(postData?.media?.length).toBe(2);
      expect(postData?.media?.[0].url).toContain('name=large');
      expect(postData?.media?.[1].url).toContain('name=large');
    });

    it('正确将 X 原生文本节点中的 \\n 转换为 <br /> 标签，避免排版合并坍缩', async () => {
      const rawTweetHtml = `
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <a href="/author"><span>Author</span></a>
          </div>
          <div data-testid="tweetText">
            <span>第一行观点
第二行分析

第三行结论</span>
          </div>
          <a href="/author/status/2097150432996892889">
            <time datetime="2026-09-09T00:00:00.000Z">Sep 9</time>
          </a>
        </article>
      `;
      document.body.innerHTML = rawTweetHtml;
      const tweetEl = document.querySelector<HTMLElement>('article[data-testid="tweet"]')!;

      const postData = await adapter.extract(tweetEl);
      expect(postData).not.toBeNull();

      // 验证 contentHtml 内存在 3 个 <br> 换行
      const temp = document.createElement('div');
      temp.innerHTML = postData!.contentHtml!;

      const brTags = temp.querySelectorAll('br');
      expect(brTags.length).toBe(3);
      expect(postData?.contentHtml).toContain('第一行观点<br>第二行分析<br><br>第三行结论');
    });

    it('正确向上追溯二级评论的主帖 (Root Post) 与上级回复 (Parent Post)', async () => {
      const threadHtml = `
        <article data-testid="tweet" id="tweet-root">
          <div data-testid="User-Name"><a href="/elonmusk"><span>Elon Musk</span></a></div>
          <div data-testid="tweetText"><span>主帖内容：Optimus release date</span></div>
          <a href="/elonmusk/status/1000"><time>1h</time></a>
        </article>
        <article data-testid="tweet" id="tweet-parent">
          <div data-testid="User-Name"><a href="/user1"><span>User 1</span></a></div>
          <div data-testid="tweetText"><span>一级评论：When is demo?</span></div>
          <a href="/user1/status/1001"><time>45m</time></a>
        </article>
        <article data-testid="tweet" id="tweet-current">
          <div data-testid="User-Name"><a href="/user2"><span>User 2</span></a></div>
          <div><span>Replying to </span><a href="/user1">@user1</a></div>
          <div data-testid="tweetText"><span>二级评论：Probably next month.</span></div>
          <a href="/user2/status/1002"><time>30m</time></a>
        </article>
      `;
      document.body.innerHTML = threadHtml;
      const currentTweetEl = document.getElementById('tweet-current')!;

      const postData = await adapter.extract(currentTweetEl);
      expect(postData).not.toBeNull();
      expect(postData?.contextThread).toBeDefined();

      // 验证上级回复正确识别为 User 1
      expect(postData?.contextThread?.parentPost?.author.name).toBe('User 1');
      expect(postData?.contextThread?.parentPost?.content).toBe('一级评论：When is demo?');

      // 验证主帖
      expect(postData?.contextThread?.rootPost?.author.name).toBe('Elon Musk');
      expect(postData?.contextThread?.rootPost?.content).toBe('主帖内容：Optimus release date');
    });

    it('当评论直接回复主帖（即使上方有其他兄弟评论）时，正确排除无关的上一个评论，仅保留主帖', async () => {
      const threadHtml = `
        <article data-testid="tweet" id="tweet-root">
          <div data-testid="User-Name"><a href="/elonmusk"><span>Elon Musk</span></a></div>
          <div data-testid="tweetText"><span>主帖内容：Optimus release date</span></div>
          <a href="/elonmusk/status/1000"><time>1h</time></a>
        </article>
        <article data-testid="tweet" id="tweet-sibling">
          <div data-testid="User-Name"><a href="/user1"><span>User 1</span></a></div>
          <div><span>Replying to </span><a href="/elonmusk">@elonmusk</a></div>
          <div data-testid="tweetText"><span>兄弟评论1：Cool!</span></div>
          <a href="/user1/status/1001"><time>45m</time></a>
        </article>
        <article data-testid="tweet" id="tweet-current">
          <div data-testid="User-Name"><a href="/user2"><span>User 2</span></a></div>
          <div><span>Replying to </span><a href="/elonmusk">@elonmusk</a></div>
          <div data-testid="tweetText"><span>兄弟评论2（直接回复主帖）：Amazing progress.</span></div>
          <a href="/user2/status/1002"><time>30m</time></a>
        </article>
      `;
      document.body.innerHTML = threadHtml;
      const currentTweetEl = document.getElementById('tweet-current')!;

      const postData = await adapter.extract(currentTweetEl);
      expect(postData).not.toBeNull();
      expect(postData?.contextThread).toBeDefined();

      // 验证由于当前评论直接回复 @elonmusk，上方的 User 1 兄弟评论被正确排除（parentPost 为 undefined）
      expect(postData?.contextThread?.parentPost).toBeUndefined();
    });

    it('当点击主帖 (Focal Tweet) 本身时，不生成任何向上上下文 (contextThread 为 undefined)', async () => {
      // 模拟当前页面处于主帖 URL
      Object.defineProperty(window, 'location', {
        value: new URL('https://x.com/elonmusk/status/1000'),
        writable: true,
      });

      const rootHtml = `
        <article data-testid="tweet" id="tweet-root">
          <div data-testid="User-Name"><a href="/elonmusk"><span>Elon Musk</span></a></div>
          <div data-testid="tweetText"><span>主帖内容：Optimus release date</span></div>
          <a href="/elonmusk/status/1000"><time>1h</time></a>
        </article>
      `;
      document.body.innerHTML = rootHtml;
      const rootTweetEl = document.getElementById('tweet-root')!;

      const postData = await adapter.extract(rootTweetEl);
      expect(postData).not.toBeNull();
      // 主帖自身绝不生成向上上下文
      expect(postData?.contextThread).toBeUndefined();
    });

    it('当页面存在主帖作者的其他散落评论时，精准识别主帖与评论，不将同一作者的其他回复误认作父级', async () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://x.com/xiqingongzi/status/2098267710362898575'),
        writable: true,
      });

      const threadHtml = `
        <article data-testid="tweet" id="tweet-root">
          <div data-testid="User-Name"><a href="/xiqingongzi"><span>Bestony | 白宦成</span></a></div>
          <div data-testid="tweetText"><span>主帖内容：忘了和大家说，我曾经是飞书开放平台负责 OpenAPI 治理和审批的产品经理</span></div>
          <a href="/xiqingongzi/status/2098267710362898575"><time>4h</time></a>
        </article>
        <article data-testid="tweet" id="tweet-other-reply">
          <div data-testid="User-Name"><a href="/xiqingongzi"><span>Bestony | 白宦成</span></a></div>
          <div><span>Replying to </span><a href="/user_other">@user_other</a></div>
          <div data-testid="tweetText"><span>评论回复：会涉及到 breaking changes</span></div>
          <a href="/xiqingongzi/status/2098270000000000000"><time>3h</time></a>
        </article>
        <article data-testid="tweet" id="tweet-evan">
          <div data-testid="User-Name"><a href="/RanRan113080440"><span>Evan</span></a></div>
          <div><span>Replying to </span><a href="/xiqingongzi">@xiqingongzi</a></div>
          <div data-testid="tweetText"><span>评论内容：既然遇到了，我就先骂一下，你们字节的那些开发文档</span></div>
          <a href="/RanRan113080440/status/2098280768472793526"><time>2h</time></a>
        </article>
      `;
      document.body.innerHTML = threadHtml;
      const evanTweetEl = document.getElementById('tweet-evan')!;

      const postData = await adapter.extract(evanTweetEl);
      expect(postData).not.toBeNull();
      expect(postData?.contextThread).toBeDefined();

      // 验证由于 Evan 与 tweet-other-reply 之间没有 Thread 连线且 Evan 是直接评论主帖，parentPost 必须为 undefined
      expect(postData?.contextThread?.parentPost).toBeUndefined();

      // 验证 rootPost 精准命中真正的主帖，而不是那条 breaking changes 评论
      expect(postData?.contextThread?.rootPost?.url).toContain('2098267710362898575');
      expect(postData?.contextThread?.rootPost?.content).toContain('忘了和大家说');
    });

    it('当评论上方存在 Starlink 等推广广告推文时，广告被彻底过滤，评论精准关联真实主帖且 parentPost 为 undefined', async () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://x.com/xiqingongzi/status/2098267710362898575'),
        writable: true,
      });

      const threadHtml = `
        <article data-testid="tweet" id="tweet-root">
          <div data-testid="User-Name"><a href="/xiqingongzi"><span>Bestony | 白宦成</span></a></div>
          <div data-testid="tweetText"><span>主帖内容：忘了和大家说</span></div>
          <a href="/xiqingongzi/status/2098267710362898575"><time>4h</time></a>
        </article>
        <article data-testid="tweet" id="tweet-ad">
          <div data-testid="User-Name"><a href="/Starlink"><span>Starlink</span></a></div>
          <div><span>Ad</span></div>
          <div data-testid="tweetText"><span>High-speed internet anywhere. Order now.</span></div>
          <!-- 广告推文通常没有常规的 /status/ 链接 -->
          <a href="https://starlink.com/ads"><span>Sponsored</span></a>
        </article>
        <article data-testid="tweet" id="tweet-evan">
          <div data-testid="User-Name"><a href="/RanRan113080440"><span>Evan</span></a></div>
          <!-- 一级评论正文上方无 Replying to @Starlink -->
          <div data-testid="tweetText"><span>评论内容：既然遇到了，我就先骂一下</span></div>
          <a href="/RanRan113080440/status/2098280768472793526"><time>2h</time></a>
        </article>
      `;
      document.body.innerHTML = threadHtml;
      const evanTweetEl = document.getElementById('tweet-evan')!;

      const postData = await adapter.extract(evanTweetEl);
      expect(postData).not.toBeNull();
      expect(postData?.contextThread).toBeDefined();

      // 验证 Starlink 广告被完全过滤，parentPost 为 undefined
      expect(postData?.contextThread?.parentPost).toBeUndefined();

      // 验证 rootPost 仍为真实主帖 Bestony
      expect(postData?.contextThread?.rootPost?.author.name).toBe('Bestony | 白宦成');
    });

    it('当点击二级回复（如 Bestony 回复 Evan 的评论）时，精准识别 parentPost (Evan) 与 rootPost (Bestony 主帖)', async () => {
      Object.defineProperty(window, 'location', {
        value: new URL('https://x.com/xiqingongzi/status/2098267710362898575'),
        writable: true,
      });

      const threadHtml = `
        <article data-testid="tweet" id="tweet-root">
          <div data-testid="User-Name"><a href="/xiqingongzi"><span>Bestony | 白宦成</span></a></div>
          <div data-testid="tweetText"><span>主帖内容：忘了和大家说</span></div>
          <a href="/xiqingongzi/status/2098267710362898575"><time>4h</time></a>
        </article>
        <div data-testid="cellInnerDiv">
          <article data-testid="tweet" id="tweet-evan">
            <div data-testid="User-Name"><a href="/RanRan113080440"><span>Evan</span></a></div>
            <div data-testid="tweetText"><span>评论内容：既然遇到了，我就先骂一下</span></div>
            <a href="/RanRan113080440/status/2098280768472793526"><time>2h</time></a>
          </article>
          <article data-testid="tweet" id="tweet-bestony-reply">
            <div data-testid="User-Name"><a href="/xiqingongzi"><span>Bestony | 白宦成</span></a></div>
            <div data-testid="tweetText"><span>@RanRan113080440 这里几个事：1. 飞书的文档真的治理过；我们再友商里不算差</span></div>
            <a href="/xiqingongzi/status/2098285000000000000"><time>1h</time></a>
          </article>
        </div>
      `;
      document.body.innerHTML = threadHtml;
      const bestonyReplyEl = document.getElementById('tweet-bestony-reply')!;

      const postData = await adapter.extract(bestonyReplyEl);
      expect(postData).not.toBeNull();
      expect(postData?.contextThread).toBeDefined();

      // 验证精准提取 Evan 为直接上级评论
      expect(postData?.contextThread?.parentPost?.author.name).toBe('Evan');
      expect(postData?.contextThread?.parentPost?.content).toContain('既然遇到了，我就先骂一下');

      // 验证精准提取 Bestony 主帖为顶层 Root Post
      expect(postData?.contextThread?.rootPost?.author.name).toBe('Bestony | 白宦成');
      expect(postData?.contextThread?.rootPost?.content).toContain('忘了和大家说');
    });
  });
});
