import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ShareCard from '@/components/card/ShareCard.vue';
import type { PostData } from '@/types/post';
import type { CardRenderOptions } from '@/types/theme';

describe('ShareCard 组件 DOM 结构渲染与保真度测试', () => {
  const defaultOptions: CardRenderOptions = {
    themeId: 'raycast-dark',
    showOuterPadding: true,
    padding: 24,
    showQrCode: false,
    showWatermark: false,
    showStats: false,
    fontScale: 1.0,
    cardRadius: 16,
    authorAvatarRadius: 'rounded-full',
    aspectRatio: 'auto',
  };

  const samplePost: PostData = {
    id: 'https://www.zhihu.com/question/123/answer/456',
    platform: 'zhihu',
    url: 'https://www.zhihu.com/question/123/answer/456',
    title: '现代前端工程化演进思考',
    author: {
      name: 'Ryan Cui',
      handle: '@ryancui',
      avatarUrl: 'https://example.com/avatar.jpg',
    },
    content: '第一段：架构与抽象\n第二段：代码示例 vitest',
    contentHtml: '<p>第一段：架构与抽象</p><p>第二段：代码示例 <code>vitest</code></p>',
    createdAt: '2026-09-01T12:00:00.000Z',
  };

  describe('1. 基础 DOM 结构与元数据渲染', () => {
    it('正确渲染卡片作者名、Title、Favicon 与正文段落结构', () => {
      const wrapper = mount(ShareCard, {
        props: {
          post: samplePost,
          options: defaultOptions,
        },
      });

      // 验证作者信息
      expect(wrapper.text()).toContain('Ryan Cui');
      expect(wrapper.text()).toContain('@ryancui');

      // 验证 Title 存在且内容正确
      expect(wrapper.text()).toContain('现代前端工程化演进思考');

      // 验证正文富文本内部各个 <p> 段落节点完整存在于 DOM 中
      const paragraphs = wrapper.findAll('.quick-share-rich-body p, p');
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(wrapper.html()).toContain('第一段：架构与抽象');
      expect(wrapper.html()).toContain('<code>vitest</code>');
    });

    it('当 post.title 为空时不渲染标题容器', () => {
      const postWithoutTitle: PostData = {
        ...samplePost,
        title: undefined,
      };

      const wrapper = mount(ShareCard, {
        props: {
          post: postWithoutTitle,
          options: defaultOptions,
        },
      });

      // 验证标题文本不存在
      expect(wrapper.text()).not.toContain('现代前端工程化演进思考');
    });
  });

  describe('2. 外层背景边距 (showOuterPadding) 结构切换', () => {
    it('开启与关闭外层边距时正确切换外层容器与直角背景', async () => {
      const wrapper = mount(ShareCard, {
        props: {
          post: samplePost,
          options: {
            ...defaultOptions,
            showOuterPadding: true,
          },
        },
      });

      // 开启时外层包装存在
      expect(wrapper.find('.has-outer-padding').exists()).toBe(true);

      // 关闭外层背景边距
      await wrapper.setProps({
        options: {
          ...defaultOptions,
          showOuterPadding: false,
        },
      });

      expect(wrapper.find('.has-outer-padding').exists()).toBe(false);
    });
  });

  describe('3. 金句引述 (Excerpt) 划词模式 DOM 渲染', () => {
    it('渲染金句模式下的 spotlight-focus 结构，保留前后渐隐文字', () => {
      const excerptPost: PostData = {
        ...samplePost,
        isExcerpt: true,
        content: '核心金句内容',
        contentHtml: '<span class="spotlight-focus">核心金句内容</span>',
        excerptBeforeHtml: '<span class="fade-in-blur">前文：</span>',
        excerptAfterHtml: '<span class="fade-out-blur">后文...</span>',
      };

      const wrapper = mount(ShareCard, {
        props: {
          post: excerptPost,
          options: defaultOptions,
        },
      });

      expect(wrapper.find('.spotlight-focus').exists()).toBe(true);
      expect(wrapper.find('.spotlight-focus').text()).toBe('核心金句内容');
      expect(wrapper.get('.quick-share-excerpt-top-fade').text()).toBe('前文：');
      expect(wrapper.get('.quick-share-excerpt-bottom-fade').text()).toBe('后文...');
    });
  });

  describe('4. 多图 (Media) 媒体渲染', () => {
    it('存在 post.media 且无 contentHtml 时正确渲染图片标签与原图 src', () => {
      const imagePost: PostData = {
        ...samplePost,
        contentHtml: undefined,
        media: [
          { type: 'image', url: 'https://example.com/img1.png' },
          { type: 'image', url: 'https://example.com/img2.png' },
        ],
      };

      const wrapper = mount(ShareCard, {
        props: {
          post: imagePost,
          options: defaultOptions,
        },
      });

      const imgs = wrapper.findAll('.qs-media-img');
      expect(imgs.length).toBe(2);
      expect(imgs[0].attributes('src')).toBe('https://example.com/img1.png');
      expect(imgs[1].attributes('src')).toBe('https://example.com/img2.png');
    });
  });

  it.each([1, 2, 3, 4, 6])('lays out %i attachments without changing their order', count => {
    const media = Array.from({ length: count }, (_, i) => ({ type: 'image' as const, url: `https://example.com/${i}.jpg` }));
    const wrapper = mount(ShareCard, { props: { post: { ...samplePost, media }, options: defaultOptions } });
    const gallery = wrapper.get('.qs-media-gallery');
    expect(gallery.classes().includes('qs-media-mosaic')).toBe(count > 1);
    expect(gallery.classes().includes('qs-media-three')).toBe(count === 3);
    expect(gallery.classes().includes('qs-media-four')).toBe(count === 4);
    expect(gallery.classes().includes('qs-media-many')).toBe(count > 4);
    expect(gallery.findAll('img').map(img => img.attributes('src'))).toEqual(media.map(item => item.url));
  });

  describe('Web article headers', () => {
    it('puts the title and source date at the top when there is no author', () => {
      const wrapper = mount(ShareCard, { props: {
        post: { ...samplePost, platform: 'universal', author: { name: '' }, siteName: 'Example' },
        options: defaultOptions,
      } });
      expect(wrapper.find('.qs-card-header h3').text()).toBe(samplePost.title);
      expect(wrapper.find('.qs-card-header time').exists()).toBe(true);
      expect(wrapper.find('.qs-author-box').exists()).toBe(false);
      expect(wrapper.find('.qs-card-content .qs-post-title').exists()).toBe(false);
      expect(wrapper.findAll('h3')).toHaveLength(1);
    });

    it.each(['raycast-dark', 'liquid-glass', 'craft-editorial'])('uses a theme orb in %s for WeChat', themeId => {
      const wrapper = mount(ShareCard, { props: {
        post: { ...samplePost, platform: 'universal', url: 'https://mp.weixin.qq.com/s/article', author: { name: '公众号名称' } },
        options: { ...defaultOptions, themeId },
      } });
      expect(wrapper.find('.qs-publisher-orb').exists()).toBe(true);
      expect(wrapper.find('.qs-avatar-fallback').exists()).toBe(false);
      expect(wrapper.find('.qs-author-name').text()).toBe('公众号名称');
    });

    it('falls back to the theme orb when a real avatar fails to load', async () => {
      const wrapper = mount(ShareCard, { props: {
        post: { ...samplePost, platform: 'universal', url: 'https://mp.weixin.qq.com/s/article' },
        options: defaultOptions,
      } });
      await wrapper.find('.qs-publisher-avatar img').trigger('error');
      expect(wrapper.find('.qs-publisher-orb').exists()).toBe(true);
      await wrapper.setProps({ post: { ...samplePost, platform: 'universal', url: 'https://mp.weixin.qq.com/s/article', author: { name: 'Another account', avatarUrl: 'https://example.com/new.png' } } });
      expect(wrapper.find('.qs-publisher-avatar img').attributes('src')).toBe('https://example.com/new.png');
    });
  });

  describe('Reply quote cards', () => {
    const root: PostData = { id: 'root', platform: 'x', url: 'https://x.com/author/status/1', author: { name: 'Original author', handle: '@author' }, content: 'Original post', createdAt: '2026-09-20T01:00:00Z', media: [{ type: 'video', url: 'https://example.com/video', posterUrl: 'https://example.com/poster.png', duration: '1:20' }] };
    it.each(['raycast-dark', 'liquid-glass', 'craft-editorial'])('shows comment then root with video and date in %s', themeId => {
      const wrapper = mount(ShareCard, { props: { post: { ...samplePost, platform: 'x', contentHtml: '<p>My reply</p>', contextThread: { rootPost: root } }, options: { ...defaultOptions, themeId } } });
      expect(wrapper.get('.qs-card-header').text()).toContain(samplePost.author.name);
      expect(wrapper.html().indexOf('My reply')).toBeLessThan(wrapper.html().indexOf('Original post'));
      expect(wrapper.get('.qs-reply-quote time').attributes('datetime')).toBe(root.createdAt);
      expect(wrapper.get('.qs-reply-quote img').attributes('src')).toBe('https://example.com/poster.png');
      expect(wrapper.get('.qs-reply-quote .qs-video-duration-badge').text()).toBe('1:20');
      expect(wrapper.get('.qs-footer-url').text()).toBe(samplePost.url);
    });
    it('does not attach root to excerpts or secondary replies', () => {
      for (const extra of [{ isExcerpt: true }, { contextThread: { rootPost: root, parentPost: root } }]) {
        const wrapper = mount(ShareCard, { props: { post: { ...samplePost, contextThread: { rootPost: root }, ...extra }, options: defaultOptions } });
        expect(wrapper.find('.qs-reply-quote').exists()).toBe(false);
      }
    });
  });

  describe('5. Thread 对话链模式渲染', () => {
    it('兼容旧父帖数据，评论在上、主帖引用在下', () => {
      const threadPost: PostData = {
        id: 'https://x.com/user2/status/2',
        platform: 'x',
        url: 'https://x.com/user2/status/2',
        author: {
          name: '回复作者',
          handle: '@reply_user',
          avatarUrl: 'https://example.com/avatar2.jpg',
        },
        content: '这是当前回复的内容',
        parentThreadPost: {
          id: 'https://x.com/user1/status/1',
          platform: 'x',
          url: 'https://x.com/user1/status/1',
          author: {
            name: '主帖作者',
            handle: '@root_user',
            avatarUrl: 'https://example.com/avatar1.jpg',
          },
          content: '这是主帖推文内容',
        },
      };

      const wrapper = mount(ShareCard, {
        props: {
          post: threadPost,
          options: defaultOptions,
        },
      });

      // 验证 Thread 对话链专属结构与垂直连线
      expect(wrapper.find('.qs-reply-quote').exists()).toBe(true);
      expect(wrapper.html().indexOf('这是当前回复的内容')).toBeLessThan(wrapper.html().indexOf('这是主帖推文内容'));
      expect(wrapper.find('.qs-thread-connector-line').exists()).toBe(false);

      // 验证主帖与回复两者的作者信息与内容均存在于卡片中
      expect(wrapper.text()).toContain('主帖作者');
      expect(wrapper.text()).toContain('@root_user');
      expect(wrapper.text()).toContain('这是主帖推文内容');

      expect(wrapper.text()).toContain('回复作者');
      expect(wrapper.text()).toContain('@reply_user');
      expect(wrapper.text()).toContain('这是当前回复的内容');
    });
  });
});
