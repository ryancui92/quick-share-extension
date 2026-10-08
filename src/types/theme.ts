export type BuiltinCardThemeId =
  | 'raycast-dark'
  | 'liquid-glass'
  | 'craft-editorial';

export type CardThemeId = BuiltinCardThemeId | (string & {});

/**
 * 环境弥散光核配置 (用于 Raycast 破晓光晕 / Apple 流动光斑)
 */
export interface AmbientGlow {
  color: string;
  position: string; // e.g. '50% 100%', 'bottom center', 'top right'
  size: string; // e.g. '500px 240px', '70% 50%'
  blur?: string; // e.g. '80px'
  opacity?: number; // 0.0 ~ 1.0
}

/**
 * 解耦的高自由度卡片主题架构
 */
export interface QuickShareTheme {
  $schema?: string;
  version: 1; // 语义化版本号，用于向后兼容与迁移
  id: CardThemeId;
  name: string;
  author?: string;
  description?: string;
  previewColor: string; // 在主题选择器中展示的色块或渐变

  // 1. 环境底色与多层空间弥散光斑 (Ambient & Light Field)
  ambient: {
    isDark: boolean;
    outerBackground: string; // 外部衬底背景 (纯色、线性渐变、径向渐变或 Mesh)
    glows?: AmbientGlow[]; // 空间多重弥散光核 (Raycast破晓光晕 / Apple流体光斑)
    noiseOpacity?: number; // 磨砂微噪点强度 (0 ~ 1)
  };

  // 2. 卡片容器材质与光学高光 (Surface & Specular Highlights)
  card: {
    background: string; // 纯色、半透明 RGBA、多重微渐变
    backdropFilter?: string; // 毛玻璃滤镜，如 'blur(24px) saturate(180%)'
    border?: string; // 基础边框
    borderHighlight?: string; // 顶部 1px 镜面反光光刃 (linear-gradient)
    shadow: string; // 多层物理立体投影
    innerGlow?: string; // 内发光微雕倒角 (inset box-shadow)
  };

  // 3. 字体与排版体系 (Typography)
  typography: {
    fontFamily: 'sans' | 'serif' | 'mono' | string;
    textPrimary: string;
    textSecondary: string;
    textMuted?: string;
    headingFontFamily?: string;
    codeFontFamily?: string;
  };

  // 4. 组件级独立样式覆写 (Component-level Overrides)
  components?: {
    platformBadge?: {
      background?: string;
      color?: string;
      border?: string;
      borderRadius?: string;
    };
    promptCard?: {
      background?: string;
      border?: string;
      borderRadius?: string;
      headerColor?: string;
    };
    quoteBlock?: {
      background?: string;
      borderColor?: string;
      borderWidth?: string;
      borderRadius?: string;
    };
    codeBlock?: {
      background?: string;
      color?: string;
      border?: string;
      borderRadius?: string;
    };
    table?: {
      borderColor?: string;
      headerBg?: string;
      rowEvenBg?: string;
    };
    footer?: {
      textColor?: string;
      borderTop?: string;
    };
  };

  // 5. 极限扩展：自由 CSS 变量与覆盖
  customVars?: Record<string, string>;
}

export interface CardRenderOptions {
  themeId: CardThemeId;
  showOuterPadding: boolean; // 是否启用外层直角背景边距
  padding: number; // 24, 32
  showQrCode: boolean;
  showWatermark: boolean;
  showStats: boolean;
  fontScale: number; // 0.9, 1.0, 1.1, 1.2
  cardRadius: number; // 8, 16, 24
  authorAvatarRadius: 'rounded-full' | 'rounded-xl' | 'rounded-none';
  aspectRatio: 'auto' | '1:1' | '4:3' | '16:9';
}

/**
 * 三款精选预设主题
 */
export const BUILTIN_THEMES: Record<BuiltinCardThemeId, QuickShareTheme> = {
  // 1. Raycast Wrapped：深黑面板、琥珀边缘光与精细分隔线
  'raycast-dark': {
    version: 1,
    id: 'raycast-dark',
    name: 'Raycast 曜石',
    author: 'QuickShare',
    description: '深黑面板、明亮橙色辉光与精密发光边缘',
    previewColor: 'radial-gradient(ellipse at 50% 115%, #ff8a35 0%, #b84512 29%, #0a0807 68%)',
    ambient: {
      isDark: true,
      outerBackground: 'radial-gradient(ellipse at 0% 0%, #c85219 0%, transparent 48%), radial-gradient(ellipse at 100% 100%, #b34116 0%, transparent 46%), #160b08',
      glows: [
        {
          color: 'rgba(255, 110, 43, 0.88)',
          position: '45% 104%',
          size: '540px 240px',
          blur: '35px',
          opacity: 0.9,
        },
        {
          color: 'rgba(255, 101, 48, 0.48)',
          position: '95% 10%',
          size: '360px 160px',
          blur: '50px',
          opacity: 0.8,
        },
      ],
    },
    card: {
      background: 'radial-gradient(ellipse 75% 130px at 50% 110%, rgba(248, 92, 32, 0.25), transparent 85%), linear-gradient(155deg, #101011 0%, #060607 55%, #0b0806 100%)',
      backdropFilter: 'none',
      border: '1px solid rgba(255, 255, 255, 0.14)',
      borderHighlight: 'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.02) 100%)',
      shadow: '0 20px 50px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 0, 0, 0.7)',
      innerGlow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), inset 0 -1px 0 rgba(255, 112, 48, 0.34)',
    },
    typography: {
      fontFamily: 'sans',
      textPrimary: '#ededee',
      textSecondary: '#929093',
      textMuted: '#71717a',
    },
    components: {
      platformBadge: {
        background: 'rgba(255, 255, 255, 0.03)',
        color: '#f4f4f5',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '8px',
      },
      promptCard: {
        background: 'linear-gradient(180deg, rgba(39, 39, 42, 0.70) 0%, rgba(24, 24, 27, 0.80) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        borderRadius: '14px',
        headerColor: '#fb923c',
      },
      quoteBlock: {
        background: 'rgba(249, 115, 22, 0.06)',
        borderColor: '#f97316',
        borderRadius: '0 8px 8px 0',
      },
      codeBlock: {
        background: '#0d0d11',
        color: '#f4f4f5',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
      },
      table: {
        borderColor: 'rgba(255, 255, 255, 0.12)',
        headerBg: 'rgba(255, 255, 255, 0.06)',
        rowEvenBg: 'rgba(255, 255, 255, 0.02)',
      },
    },
  },

  // 2. 冰川玻璃：无纹理、无线条的连续柔光渐变。
  'liquid-glass': {
    version: 1, id: 'liquid-glass', name: '冰川玻璃', author: 'QuickShare',
    description: '低饱和冰蓝与浅紫柔光，通透的浅色玻璃',
    previewColor: 'linear-gradient(135deg, #cfe0e7, #e9edf2 55%, #dedbea)',
    ambient: {
      isDark: false,
      outerBackground: 'radial-gradient(ellipse at 7% 12%, rgba(133,177,195,.52), transparent 56%), radial-gradient(ellipse at 94% 88%, rgba(168,161,192,.46), transparent 58%), linear-gradient(135deg, #d3e1e7 0%, #e1e9ef 45%, #dbe2ec 76%, #e2dbe9 100%)',
      glows: [], noiseOpacity: 0,
    },
    card: {
      background: 'linear-gradient(145deg, rgba(255,255,255,.58), rgba(247,249,252,.42))',
      backdropFilter: 'blur(10px) saturate(108%)',
      border: '1px solid transparent',
      shadow: '0 16px 32px -18px rgba(47,65,83,.28), 0 3px 8px -4px rgba(47,65,83,.16)',
      innerGlow: 'inset 0 1px 2px rgba(255,255,255,.28), inset 0 -1px 2px rgba(67,83,102,.08)',
    },
    typography: { fontFamily: 'sans', textPrimary: '#192330', textSecondary: '#536479', textMuted: '#718095' },
    components: {
      promptCard: { background: 'rgba(255,255,255,.4)', border: '1px solid rgba(133,159,193,.18)', borderRadius: '12px', headerColor: '#597b9b' },
      quoteBlock: { background: 'rgba(158,194,223,.09)', borderColor: '#9bbbd4', borderRadius: '0 6px 6px 0' },
      codeBlock: { background: '#eaf0f8', color: '#25384b', border: '1px solid #d6e1ee', borderRadius: '8px' },
      table: { borderColor: '#d5dfeb', headerBg: '#e9eff7', rowEvenBg: 'rgba(255,255,255,.35)' },
      footer: { textColor: '#8794a7', borderTop: '1px solid rgba(117,139,166,.22)' },
    },
  },
  // 3. 暖纸墨色：暖白细纸纹与克制的朱红点缀。
  'craft-editorial': {
    version: 1, id: 'craft-editorial', name: '暖纸墨色', author: 'QuickShare',
    description: '暖白纸感、墨色宋体与一抹朱红',
    previewColor: 'linear-gradient(135deg, #e5dac8, #f7f1e7 55%, #e9ddca)',
    ambient: {
      isDark: false,
      outerBackground: 'radial-gradient(ellipse at 20% 5%, rgba(255,252,245,.82), transparent 58%), radial-gradient(ellipse at 90% 92%, rgba(205,187,156,.3), transparent 62%), linear-gradient(145deg, #f0e9dd, #e8ddcb)',
      glows: [], noiseOpacity: .1,
    },
    card: {
      background: 'linear-gradient(150deg, #fbf8f1, #f7f1e7)',
      border: '1px solid rgba(255,253,247,.78)',
      shadow: '0 12px 30px -14px rgba(76,65,51,.18)',
      innerGlow: 'none',
    },
    typography: { fontFamily: 'serif', textPrimary: '#292824', textSecondary: '#8c8881', textMuted: '#a49d93' },
    components: {
      promptCard: { background: '#f0ece4', border: '1px solid #e3ddd3', borderRadius: '8px', headerColor: '#a56b60' },
      quoteBlock: { background: 'rgba(185,128,113,.05)', borderColor: '#bd8779', borderRadius: '0 4px 4px 0' },
      codeBlock: { background: '#eeebe4', color: '#37352f', border: '1px solid #ded8ce', borderRadius: '6px' },
      table: { borderColor: '#ded8ce', headerBg: '#eeebe4', rowEvenBg: '#f5f2ec' },
      footer: { textColor: '#938d86', borderTop: '1px solid #dcd6ce' },
    },
  },
};

/**
 * 保持兼容旧调用的 PRESET_THEMES 引用
 */
export const PRESET_THEMES = BUILTIN_THEMES;
