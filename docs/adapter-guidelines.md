# QuickShare 站点适配器与金句分享规范 (Single Source of Truth)

本文档是 QuickShare 扩展接入新站点以及维护现有适配器的 **唯一事实基准 (Single Source of Truth, SSOT)**。所有站点适配器（如知乎、X/Twitter、即刻、小红书等）必须严格遵循本规范中定义的接口契约、排版原则与设计哲学。

---

## 核心原则 (Core Tenets)

### 1. 原站点 Output 格式绝对保真 (Strict Layout Fidelity)
* **不可篡改原始排版**：必须严格遵循要分享 Entity 在原站点的 Output 格式。
* **样式可美化，结构不可变**：允许在 CSS / UI 层面做视觉润色（如添加轻微圆角、主题配色、字体阴影、毛玻璃等），但**严禁篡改原有 Layout 结构**：
  * 段落换行（`<p>`, `<br>`）严格保留；
  * 图片在文本中的先后排列位置不可随意置顶或置底（若原文为图文混排，需保持图文混排流）；
  * 列表（`<ul>`, `<ol>`）、引用块（`<blockquote>`）、代码块（`<pre><code>`）、表格（`<table>`）结构完整保留；
  * 数学公式（`KaTeX`/`MathJax`）与行内标记完整保留。
* **外链与媒体流**：
  * 如推文或帖子附带外链 Card，应在正文末尾附上规范 URL，并在其下方呈现卡片预览大图；
  * 原帖附带的视频应转换为视频来源链接附在正文中。
* **AI Chat 平台（ChatGPT, Gemini 等）规范**：
  * **单轮 Entity 粒度**：一次对话 turn（即模型的一条完整回复）为一个独立 Entity，暂不支持跨 turn 合并；
  * **Title 契约**：卡片 Title 统一提取该 turn 对应的用户提问 prompt（User Message Input），若无则留空；
  * **代码高亮与 Markdown 流保真**：必须完整保留模型的 Markdown 排版、语法高亮与列表结构。

### 2. 金句 / 划词分享 UI 全局一致 (Universal Excerpt & Spotlight UI)
* **逻辑统一，仅差异化识别**：金句分享的 UI 表现与交互逻辑在所有站点之间**必须完全一致**。
* **适配器职责单一化**：适配器仅负责：
  1. 识别并定位当前站点的 Post Entity 边界；
  2. 获取 Entity 的正文容器节点（Content Root）；
  3. 提取作者、标准 Clean URL、站点 Favicon 与正文数据。
* **全局划词交互由系统管线统一驱动**：
  * **单段落内局部划选**：将段落内未选中的前后文移至高亮内容上下，统一采用两行垂直渐隐与微模糊；选区核心文字 100% 锐利高亮；
  * **完整整段 / 跨段落划选**：选中的段落 100% 锐利呈现，上方相邻段落呈现垂直顶部淡出（底部对齐无截断），下方相邻段落呈现垂直底部淡出；
  * **上下文长度限制**：未选中的前后文各最多预取紧邻选区的 512 个 Unicode 字符，折叠空行，并按实际排版每侧最多展示两行；原文不足时不补造内容。选中文字、富文本和媒体顺序不得截断或重排。此规则由共享渲染层处理，也适用于 X 将长文包在单一 DOM 块内的情况。
  * **划词悬浮快捷唤起**：选区上方/下方统一弹出快捷 `QuickShare` Pill 按钮。

### 3. URL 规范清洗 (Clean Canonical URL)
* 必须剔除一切营销追踪参数（如 `utm_*`, `ref`, `share_source`, `origin` 等）；
* 必须精确定位到具体的回答/帖子/文章级别（例如知乎问答必须是 `/question/{qid}/answer/{aid}`，而非仅 `/question/{qid}`）。

---

## 接口契约规范 (Global Interface Contract)

所有站点适配器必须继承并实现 `BaseAdapter`（位于 `src/adapters/base.ts`）：

```typescript
export interface ExcerptSelection {
  selectedText: string;
  selectedHtml?: string;
  beforeHtml?: string;
  afterHtml?: string;
}

export abstract class BaseAdapter {
  abstract readonly platform: PlatformType;
  abstract readonly name: string;

  /**
   * 1. 路由匹配：判断当前 URL 是否归属该适配器
   */
  abstract match(url: URL): boolean;

  /**
   * 2. 按钮注入：启动 DOM MutationObserver 并向 Entity 操作栏注入 QuickShare 按钮
   */
  abstract start(onShare: OnShareTrigger): void;

  /**
   * 3. 清理：停止监听并清理注入的 DOM 节点
   */
  abstract stop(): void;

  /**
   * 4. 选区归属校验：检查 DOM 节点是否位于合法的 Post Entity 容器内（严格隔离侧边栏、评论区与导航栏）
   */
  abstract findEntityFromNode(node: Node): HTMLElement | null;

  /**
   * 5. 定位正文根节点：获取 Entity 内部承载文字与图文排版的根容器（用于 Range 上下文提取）
   */
  abstract getContentRootFromEntity(entity: HTMLElement): HTMLElement | null;

  /**
   * 6. 结构化数据提取：提取 PostData（支持全文提取与 Excerpt 引述模式）
   */
  abstract extract(targetElement?: HTMLElement, selection?: ExcerptSelection): Promise<PostData | null>;
}
```

---

## 新增站点适配器检查清单 (Checklist for New Adapters)

在新增任何站点（如小红书、即刻、微博、Medium 等）时，必须按顺序完成以下自检：

- [ ] **1. Favicon 规范**：在 `ShareCard.vue` 的 `platformConfig` 中配置官方高清 Favicon（如 `https://example.com/favicon.ico`）与品牌 Badge 颜色。
- [ ] **2. 展开全文保障**：提取前调用 `ensureExpanded(entity)` 自动展开被折叠的“查看更多/展开全部”。
- [ ] **3. Entity 边界隔离**：`findEntityFromNode` 必须严格排除评论区、侧边栏、广告流与页头页尾。
- [ ] **4. 原图质量优先**：清洗图片 URL 时获取最高清原图源（如替换缩略图参数为原图，知乎 `data-original`，X `name=large`）。
- [ ] **5. Clean URL**：使用 `cleanShareUrl` 工具清洗所有追踪 query。
- [ ] **6. 注册适配器**：在 `src/adapters/index.ts` 中注册新适配器。


## 通用网页兜底（仅摘录）

`UniversalAdapter` 在四个专用适配器之后匹配普通 HTTP(S) 页面。`start/stop` 不注入按钮，也不启动页面扫描；没有选区时 `extract` 返回 `null`。微信文章通过正文容器及页面提供的标题、公众号名、明确发布时间补充来源信息，不请求登录、不用当前时间代替文章时间。

共享 `src/utils/selection.ts` 负责双端边界校验、选区 HTML 与上下文切分，浮层和右键菜单调用同一管线。点击浮层使用保存的 Range，避免焦点移动导致选区丢失。文章选区不扩展到侧边导航或编辑区域。

通用网页必须通过 `sanitizeWebExcerpt` 清洗宿主脚本、事件属性、危险 URL 与定位样式，保留正文结构与媒体顺序；相对资源地址转绝对地址，懒加载图片读取 `data-src/data-original`，使用已有图片代理支持跨域导出。站点 favicon 通过 `PostData.siteIconUrl` 传入，仍只显示 logo。规范 URL 仅接受同源 canonical，微信文章的 `__biz/mid/idx/sn` 等标识参数不得删除。

上述通用摘录不适用“全文展开／按钮注入”检查项。专用适配器必须维持优先级与原有 Entity 边界。

通用网页的 `author.name` 只保存明确提供的署名，缺失时为空字符串，不以站点名或作者主页 URL 替代；卡片此时使用标题顶栏，并保留可读取的日期。公众号头像只读取账号资料中的头像，不以文章封面替代；缺失或加载失败时使用与编辑器一致、随当前主题切换的圆球。

## X 一级评论引用

分享详情页中的一级评论时，评论正文和媒体在上，`contextThread.rootPost` 作为下方的主题引用卡片；不新增编辑器开关。引用保留主帖作者、可读取的时间、正文和媒体，底部链接仍指向评论。已识别的二级回复不套用一级评论样式，划词分享仍使用统一摘录布局。仅使用当前详情页已加载的主帖，不从首页或搜索结果的 DOM 顺序猜测关系；缺失主帖时只分享评论。

## 帖子独立附图网格

全文分享的独立 `media` 附图按原顺序布局：单张保留原比例，两张并排，三张左一右二，四张 2×2，超过四张按三列排列。多图使用等比缩放及居中裁切，不拉伸、不丢弃图片；原生引用帖与评论引用主帖共用此规则。正文中穿插的图文和划词选区不应用附图网格，继续保留原文顺序。

X 全文分享中的原生引用帖由 `quoteHtml` 独立承载，在当前帖的正文和独立附图之后渲染。独立附图网格的列数要由卡片数据直接确定，以便在 Shadow DOM、离屏导出和原图横竖尺寸不同时保持一致；引用帖自己的图片不计入当前帖附图。
