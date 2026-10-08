<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
} from 'vue';
import { clampPreviewOffset } from '@/utils/preview';
import type { PostData } from '@/types/post';
import {
  type CardRenderOptions,
  type CardThemeId,
  type QuickShareTheme,
  BUILTIN_THEMES,
} from '@/types/theme';
import { getThemeById, loadCustomThemes } from '@/utils/theme-engine';
import ShareCard from '@/components/card/ShareCard.vue';
import ThemeOrb from '@/components/ThemeOrb.vue';
import {
  renderCardToCanvas,
  copyCardToClipboard,
  downloadCardAsPng,
} from '@/utils/exporter';
import {
  getLastCardTheme,
  setLastCardTheme,
} from '@/utils/storage';
import {
  Copy,
  Download,
  Check,
  Loader2,
} from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    post: PostData | null;
    visible: boolean;
    isExtracting?: boolean;
  }>(),
  {
    isExtracting: false,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const themeLabels: Record<string, string> = {
  'raycast-dark': '曜石',
  'liquid-glass': '冰川玻璃',
  'craft-editorial': '暖纸墨色',
};
const themeLabel = (theme: QuickShareTheme) =>
  themeLabels[theme.id] || theme.name;

const renderError = ref('');
const dialogRef = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
const trapFocus = (event: KeyboardEvent) => {
  if (event.key !== 'Tab') return;
  const root = dialogRef.value;
  const elements = Array.from(
    root?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select, textarea, summary'
    ) || []
  ).filter((element) => element.getClientRects().length);
  const active = dialogRef.value?.getRootNode() as Document | ShadowRoot;
  const index = elements.indexOf(active?.activeElement as HTMLElement);
  if (event.shiftKey && index <= 0) {
    event.preventDefault();
    elements.at(-1)?.focus();
  } else if (!event.shiftKey && (index === elements.length - 1 || index < 0)) {
    event.preventDefault();
    elements[0]?.focus();
  }
};

const effectivePost = computed(() => props.post);

// 离屏渲染与视口引用
const offscreenCardRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const footerRef = ref<HTMLElement | null>(null);
const footerHeight = ref(68);

// 自定义主题与主题列表
const customThemes = ref<QuickShareTheme[]>([]);
const allThemes = computed<QuickShareTheme[]>(() => {
  return Object.values(BUILTIN_THEMES);
});

// 卡片渲染配置
const options = reactive<CardRenderOptions>({
  themeId: 'raycast-dark',
  showOuterPadding: true,
  padding: 24,
  showQrCode: false,
  showWatermark: true,
  showStats: false,
  fontScale: 1.0,
  cardRadius: 16,
  authorAvatarRadius: 'rounded-full',
  aspectRatio: 'auto',
});

// 生成的高清预览图片
const previewDataUrl = ref<string>('');
const imageNaturalWidth = ref<number>(0);
const imageNaturalHeight = ref<number>(0);
const isRendering = ref<boolean>(false);

const windowSize = ref({
  width: window.innerWidth,
  height: window.innerHeight,
});
const updateWindowSize = () => {
  windowSize.value = { width: window.innerWidth, height: window.innerHeight };
};
// Keep the toolbar width stable; long images scroll within the capped preview.
const editorStyle = computed(() => {
  const maxWidth = Math.max(280, windowSize.value.width - 32);
  const maxHeight = Math.min(810, Math.max(240, windowSize.value.height - 32));
  const width = imageNaturalWidth.value || 640;
  const height = imageNaturalHeight.value || 440;
  const contentWidth = Math.min(maxWidth, 720);
  return {
    width: `${contentWidth}px`,
    height: `${Math.min(maxHeight, contentWidth / width * height + footerHeight.value)}px`,
  };
});

// 缩放与平移状态 (支持 0.01x 极小全景缩放 ~ 4.0x 高清局部放大)
const scale = ref<number>(1);
const fitScale = ref<number>(1);
const translateX = ref<number>(0);
const translateY = ref<number>(0);
const isDragging = ref<boolean>(false);
const dragStartX = ref<number>(0);
const dragStartY = ref<number>(0);
const initialTranslateX = ref<number>(0);
const initialTranslateY = ref<number>(0);

// 操作状态
const isCopying = ref(false);
const isDownloading = ref(false);
const copySuccess = ref(false);
const copyNotice = ref('');
let copyNoticeTimer: ReturnType<typeof setTimeout> | undefined;
let autoCopyAttempted = false;
let openRevision = 0;
const showCopyNotice = (success: boolean) => {
  if (copyNoticeTimer) clearTimeout(copyNoticeTimer);
  copySuccess.value = success;
  copyNotice.value = success ? '已复制' : '自动复制失败，请点击复制';
  copyNoticeTimer = setTimeout(() => {
    copySuccess.value = false;
    copyNotice.value = '';
  }, success ? 2000 : 3500);
};
const autoCopyPreview = async (blob: Blob) => {
  if (autoCopyAttempted || !props.visible || props.isExtracting) return;
  autoCopyAttempted = true;
  const opening = openRevision;
  isCopying.value = true;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    if (opening === openRevision && props.visible) showCopyNotice(true);
  } catch (error) {
    console.warn('[QuickShare] 自动复制失败:', error);
    if (opening === openRevision && props.visible) showCopyNotice(false);
  } finally {
    if (opening === openRevision) isCopying.value = false;
  }
};

/**
 * 触发离屏真实 DOM 高清预览渲染 (2.5x Retina 超高清输出)
 */
let renderTimer: ReturnType<typeof setTimeout> | undefined;
let renderRevision = 0;
let renderQueue = Promise.resolve();
const previewScale = 2.5;
const triggerRender = () => {
  if (renderTimer) clearTimeout(renderTimer);
  const revision = ++renderRevision;
  if (!effectivePost.value) return;
  isRendering.value = true;
  renderError.value = '';
  renderTimer = setTimeout(() => {
    renderQueue = renderQueue.then(async () => {
      if (revision !== renderRevision || !offscreenCardRef.value) return;
      let url = '';
      try {
        await nextTick();
        const canvas = await renderCardToCanvas(offscreenCardRef.value, {
          scale: previewScale,
          cardRadius: options.cardRadius,
        });
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (!blob) throw new Error('Unable to encode preview');
        if (revision !== renderRevision) return;
        url = URL.createObjectURL(blob);
        if (previewDataUrl.value) URL.revokeObjectURL(previewDataUrl.value);
        imageNaturalWidth.value = canvas.width / previewScale;
        imageNaturalHeight.value = canvas.height / previewScale;
        previewDataUrl.value = url;
        await nextTick();
        resetToFit();
        if (revision === renderRevision) await autoCopyPreview(blob);
      } catch (err) {
        if (revision !== renderRevision) return;
        if (url) URL.revokeObjectURL(url);
        console.error('[QuickShare] Render failed:', err);
        renderError.value = '预览生成失败，请重试';
      } finally {
        if (revision === renderRevision) isRendering.value = false;
      }
    });
  }, 100);
};

/**
 * 贴合预览宽度；超长图片从顶部展示，支持滚动和平移。
 */
const resetToFit = () => {
  if (
    !viewportRef.value ||
    !imageNaturalWidth.value ||
    !imageNaturalHeight.value
  )
    return;
  const vWidth = viewportRef.value.clientWidth;
  const vHeight = viewportRef.value.clientHeight;

  if (vWidth > 0 && vHeight > 0) {
    const scaleX = vWidth / imageNaturalWidth.value;
    const calculatedFit = scaleX;
    fitScale.value = Math.max(0.01, calculatedFit);
    scale.value = fitScale.value;
    translateX.value = 0;
    translateY.value = Math.max(0, (imageNaturalHeight.value * scale.value - vHeight) / 2);
  }
};

const clampTranslation = () => {
  if (!viewportRef.value) return;
  translateX.value = clampPreviewOffset(translateX.value, imageNaturalWidth.value * scale.value, viewportRef.value.clientWidth);
  translateY.value = clampPreviewOffset(translateY.value, imageNaturalHeight.value * scale.value, viewportRef.value.clientHeight);
};

/**
 * 复合滚轮事件处理：
 * - Meta (Command) 或 Ctrl + 滚轮：光标锚定缩放
 * - Shift + 滚轮：左右横向平移
 * - 普通滚轮：上下平移
 */
const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  if (!viewportRef.value) return;

  // 1. Meta / Ctrl + 滚轮 -> 缩放
  if (e.metaKey || e.ctrlKey) {
    const rect = viewportRef.value.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const mx = mouseX - rect.width / 2;
    const my = mouseY - rect.height / 2;

    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    const oldScale = scale.value;
    const newScale = Math.min(
      Math.max(fitScale.value, Number((oldScale + delta).toFixed(3))),
      4.0
    );

    if (newScale === oldScale) return;

    const ratio = newScale / oldScale;
    translateX.value = mx - (mx - translateX.value) * ratio;
    translateY.value = my - (my - translateY.value) * ratio;
    scale.value = newScale;
    clampTranslation();
    return;
  }

  // 2. Shift + 滚轮 -> 左右平移
  if (e.shiftKey) {
    const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
    translateX.value -= delta * 1.2;
    clampTranslation();
    return;
  }

  // 3. 普通滚轮 -> 上下平移
  translateY.value -= e.deltaY * 1.2;
  clampTranslation();
};

/**
 * 鼠标拖拽平移交互
 */
const handleMouseDown = (e: MouseEvent) => {
  if (e.button !== 0) return;
  e.preventDefault();
  isDragging.value = true;
  dragStartX.value = e.clientX;
  dragStartY.value = e.clientY;
  initialTranslateX.value = translateX.value;
  initialTranslateY.value = translateY.value;
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  e.preventDefault();
  const deltaX = e.clientX - dragStartX.value;
  const deltaY = e.clientY - dragStartY.value;
  translateX.value = initialTranslateX.value + deltaX;
  translateY.value = initialTranslateY.value + deltaY;
  clampTranslation();
};

const handleMouseUp = () => {
  isDragging.value = false;
};

// 复制 2.5x 高清图片到剪切板
const handleCopy = async () => {
  if (!offscreenCardRef.value) return;
  try {
    isCopying.value = true;
    await copyCardToClipboard(offscreenCardRef.value, {
      scale: 2.5,
      quality: 0.98,
      cardRadius: options.cardRadius,
    });
    if (props.visible) showCopyNotice(true);
  } catch (err) {
    console.error('[QuickShare] 复制失败:', err);
    alert('复制图片到剪切板失败，请尝试直接下载 PNG');
  } finally {
    isCopying.value = false;
  }
};

// 下载 2.5x 高清 PNG 图片
const handleDownload = async () => {
  if (!offscreenCardRef.value) return;
  try {
    isDownloading.value = true;
    const platform = props.post?.platform || 'share';
    await downloadCardAsPng(
      offscreenCardRef.value,
      `quick-share-${platform}-${Date.now()}.png`,
      { scale: 2.5, quality: 0.98, cardRadius: options.cardRadius }
    );
  } catch (err) {
    console.error('[QuickShare] 下载失败:', err);
    alert('下载图片失败');
  } finally {
    isDownloading.value = false;
  }
};

const selectTheme = (themeId: CardThemeId) => {
  options.themeId = themeId;
  setLastCardTheme(themeId);
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (!props.visible || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  emit('close');
};

let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  const root = dialogRef.value?.getRootNode() as Document | ShadowRoot;
  previousFocus = root?.activeElement as HTMLElement | null;
  dialogRef.value?.focus();
  // 恢复主题偏好；卡片始终保留背景留白。
  const [loadedCustoms, savedTheme] = await Promise.all([
    loadCustomThemes(),
    getLastCardTheme(),
  ]);
  customThemes.value = loadedCustoms;

  if (savedTheme) {
    const resolved = getThemeById(savedTheme, loadedCustoms);
    options.themeId = resolved.id;
  } else {
    options.themeId = 'raycast-dark';
  }
  await nextTick();

  if (props.post) {
    if (typeof window !== 'undefined') {
      (window as any).__QUICK_SHARE_POST__ = props.post;
    }
    triggerRender();
  }
  if (viewportRef.value) {
    resizeObserver = new ResizeObserver(() => {
      footerHeight.value = footerRef.value?.getBoundingClientRect().height || 68;
      resetToFit();
    });
    resizeObserver.observe(viewportRef.value);
    if (footerRef.value) resizeObserver.observe(footerRef.value);
  }
  window.addEventListener('resize', updateWindowSize);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('keydown', handleKeyDown, true);
});

onUnmounted(() => {
  openRevision++;
  if (copyNoticeTimer) clearTimeout(copyNoticeTimer);
  renderRevision++;
  previousFocus?.focus();
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('resize', updateWindowSize);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('keydown', handleKeyDown, true);
  if (renderTimer) clearTimeout(renderTimer);
  if (previewDataUrl.value) {
    URL.revokeObjectURL(previewDataUrl.value);
  }
});

watch(
  () => props.visible,
  async (newVal) => {
    openRevision++;
    renderRevision++;
    autoCopyAttempted = false;
    copySuccess.value = false;
    copyNotice.value = '';
    isCopying.value = false;
    if (copyNoticeTimer) clearTimeout(copyNoticeTimer);
    if (newVal) {
      const [loadedCustoms, savedTheme] = await Promise.all([
        loadCustomThemes(),
        getLastCardTheme(),
      ]);
      customThemes.value = loadedCustoms;
      if (savedTheme) {
        const resolved = getThemeById(savedTheme, loadedCustoms);
        options.themeId = resolved.id;
      }
      await nextTick();
      triggerRender();
    }
  }
);

watch(
  [
    () => options.themeId,
    () => options.padding,
    () => options.fontScale,
    () => options.showWatermark,
    () => props.post,
    () => props.isExtracting,
  ],
  () => {
    if (effectivePost.value) {
      triggerRender();
    }
  }
);
</script>

<template>
  <div v-if="visible" class="editor-overlay" @click.self="emit('close')">
    <div v-if="effectivePost" class="render-source" aria-hidden="true">
      <div ref="offscreenCardRef">
        <ShareCard
          :post="effectivePost"
          :options="options"
          :custom-themes="customThemes"
        />
      </div>
    </div>

    <section
      ref="dialogRef"
      class="editor"
      :style="editorStyle"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="分享图编辑器"
      @keydown="trapFocus"
    >
      <div class="editor-body">
        <main
          class="preview-panel"
          aria-label="分享图预览"
          :aria-busy="isRendering || isExtracting"
        >
          <div ref="viewportRef" class="preview-viewport">
            <div
              class="preview-interaction"
              :class="{ dragging: isDragging }"
              @wheel.prevent="handleWheel"
              @mousedown="handleMouseDown"
            />
            <div
              v-if="previewDataUrl"
              class="preview-image"
              :style="{
                transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
              }"
            >
              <img
                :src="previewDataUrl"
                alt="分享图预览"
                :style="{
                  width: `${imageNaturalWidth}px`,
                  height: `${imageNaturalHeight}px`,
                }"
              />
            </div>
            <div
              v-if="(!post || isExtracting || isRendering) && !renderError"
              class="preview-loading"
              role="status"
              aria-label="正在生成预览"
            >
              <Loader2 :size="24" class="spin" />
            </div>
            <div v-if="renderError" class="preview-error" role="alert">
              <p>{{ renderError }}</p>
              <button class="secondary-button" @click="triggerRender">
                重试
              </button>
            </div>
          </div>
        </main>
      </div>

      <footer ref="footerRef" class="editor-footer">
        <div class="appearance-controls">
          <div class="theme-picker" role="group" aria-label="主题">
            <button
              v-for="theme in allThemes"
              :key="theme.id"
              class="theme-choice"
              :class="{ selected: options.themeId === theme.id }"
              :aria-pressed="options.themeId === theme.id"
              :aria-label="theme.name"
              :title="themeLabel(theme)"
              @click="selectTheme(theme.id)"
            >
              <ThemeOrb :theme="theme" />
            </button>
          </div>
        </div>
        <div class="export-actions">
          <span v-if="copyNotice" class="copy-notice" role="status" aria-live="polite" :title="copyNotice">
            <Check v-if="copySuccess" :size="14" />{{ copySuccess ? '已复制' : '复制失败' }}
          </span>
          <button
            class="secondary-button"
            :aria-label="copySuccess ? '已复制' : '复制图片'"
            :title="copySuccess ? '已复制' : '复制图片'"
            :disabled="
              !post ||
              isExtracting ||
              isRendering ||
              isCopying ||
              isDownloading ||
              !!renderError
            "
            @click="handleCopy"
          >
            <Check v-if="copySuccess" :size="16" /><Loader2
              v-else-if="isCopying"
              :size="16"
              class="spin"
            /><Copy v-else :size="18" />
          </button>
          <button
            class="primary-button"
            aria-label="保存图片"
            title="保存图片"
            :disabled="
              !post ||
              isExtracting ||
              isRendering ||
              isDownloading ||
              isCopying ||
              !!renderError
            "
            @click="handleDownload"
          >
            <Loader2 v-if="isDownloading" :size="16" class="spin" /><Download
              v-else
              :size="16"
            />
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.editor-overlay {
  --editor-bg: rgba(247, 249, 252, 0.54);
  --editor-panel: rgba(255, 255, 255, 0.16);
  --editor-control: rgba(255, 255, 255, 0.38);
  --editor-ink: #29333c;
  --editor-muted: #65717c;
  --editor-line: rgba(71, 88, 102, 0.1);
  --editor-edge: rgba(255, 255, 255, 0.6);
  --editor-accent: #34414b;
  --editor-on-accent: #fff;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(26, 37, 48, 0.2);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: var(--editor-ink);
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  pointer-events: auto;
}
.editor {
  position: relative;
  width: 832px;
  container-type: inline-size;
  container-name: quickshare-editor;
  max-width: 100%;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.075),
      transparent 48%,
      rgba(0, 0, 0, 0.06)
    ),
    var(--editor-bg);
  border: 0;
  border-radius: 24px;
  backdrop-filter: blur(44px) saturate(1.55);
  -webkit-backdrop-filter: blur(44px) saturate(1.55);
  box-shadow:
    0 32px 100px #0008,
    0 4px 16px #0003;
}
.editor:focus {
  outline: none;
}
.editor button {
  cursor: pointer;
  transition:
    background 0.15s,
    opacity 0.15s,
    border-color 0.15s;
}
.editor button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.editor button:focus-visible {
  outline: 2px solid var(--editor-accent);
  outline-offset: 4px;
}
.editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.appearance-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.theme-picker {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 5px;
  max-width: 270px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}
.theme-choice {
  width: 34px;
  height: 34px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 50%;
  position: relative;
  transition: box-shadow .18s ease, transform .18s ease, opacity .18s ease;
}
.theme-choice.selected {
  box-shadow: 0 0 0 3px rgba(48, 60, 70, .22), 0 4px 10px rgba(29, 40, 48, .1);
}
.theme-choice.selected:hover {
  box-shadow: 0 0 0 3px rgba(48, 60, 70, .27), 0 4px 10px rgba(29, 40, 48, .1);
}
.theme-choice:not(.selected):hover {
  transform: scale(1.04);
}
.theme-choice:not(.selected) {
  opacity: 0.82;
}
.theme-choice:hover {
  opacity: 1;
}
.export-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
.preview-panel {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}
.preview-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.preview-interaction {
  position: absolute;
  inset: 0;
  z-index: 10;
  cursor: grab;
}
.preview-interaction.dragging {
  cursor: grabbing;
}
.preview-image {
  position: relative;
  isolation: isolate;
  flex-shrink: 0;
  transform-origin: center;
  pointer-events: none;
  user-select: none;
}
.preview-image img {
  max-width: none;
  display: block;
}
.preview-loading,
.preview-error {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 12px;
  color: var(--editor-muted);
}
.preview-loading {
  pointer-events: none;
}
.preview-loading svg {
  box-sizing: content-box;
  background: var(--editor-bg);
  padding: 12px;
  border-radius: 50%;
}
.preview-error {
  background: var(--editor-bg);
  backdrop-filter: blur(10px);
}
.copy-notice {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 4px;
  color: var(--editor-muted);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  flex-wrap: nowrap;
  padding: 12px 16px;
  border: 0;
  background: var(--editor-panel);
}
.primary-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 550;
}
.primary-button {
  background: var(--editor-accent);
  color: var(--editor-on-accent);
  border: 1px solid transparent;
}
.primary-button:hover {
  opacity: 0.85;
}
.secondary-button {
  border: 1px solid var(--editor-edge);
  background: var(--editor-control);
  color: var(--editor-ink);
}
.secondary-button:hover {
  border-color: var(--editor-muted);
}
.render-source {
  position: fixed;
  left: -9999px;
  top: 0;
  pointer-events: none;
  width: 640px;
}
.spin {
  animation: qs-spin 1s linear infinite;
}
@keyframes qs-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 780px) {
  .editor-overlay {
    padding: 14px;
  }
  .editor {
    border-radius: 18px;
  }
}
.export-actions button {
  width: 38px;
  height: 38px;
  padding: 0;
  flex-shrink: 0;
}
@container quickshare-editor (max-width: 480px) {
  .editor-footer { gap: 10px; padding: 10px; }
  .appearance-controls { gap: 8px; }
  .theme-picker { gap: 8px; }
  .theme-choice { width: 28px; height: 28px; }
  .export-actions { gap: 6px; }
  .export-actions button { width: 32px; height: 34px; min-height: 34px; }
}
@media (prefers-reduced-motion: reduce) {
  .editor * {
    transition: none !important;
  }
}
</style>
