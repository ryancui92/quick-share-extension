export type PlatformType = 'x' | 'zhihu' | 'chatgpt' | 'gemini' | 'jike' | 'weibo' | 'universal';

export interface PostAuthor {
  name: string;
  handle?: string;
  avatarUrl?: string;
  verified?: boolean;
}

export interface PostMedia {
  type: 'image' | 'video';
  url: string;
  duration?: string;
  posterUrl?: string;
}

export interface PostContextThread {
  rootPost?: PostData;
  parentPost?: PostData;
}

export interface PostData {
  id: string;
  platform: PlatformType;
  url: string;
  author: PostAuthor;
  siteName?: string;
  siteIconUrl?: string;
  title?: string;
  promptHtml?: string;
  content: string;
  contentHtml?: string;
  /** X 的原生引用帖，渲染在当前帖附图之后。 */
  quoteHtml?: string;
  isExcerpt?: boolean;
  excerptBeforeHtml?: string;
  excerptAfterHtml?: string;
  media?: PostMedia[];
  createdAt?: string;
  contextThread?: PostContextThread;
  parentThreadPost?: PostData;
  stats?: {
    likes?: number | string;
    reposts?: number | string;
    comments?: number | string;
  };
}
