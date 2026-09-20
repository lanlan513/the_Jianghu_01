/**
 * 铸剑台数值与几何生成（纯函数，不依赖 React / DOM）。
 *
 * 约定：剑身以「竖直向上」建模，剑柄在下方，剑尖在上方。
 * SVG 坐标：y 越小越靠上。剑格位于 y = 0，剑尖在 y = -BLADE_LEN 附近。
 */

import { createRng, seedFromParts, hashString } from './rng';
import type {
  FoldLevel,
  ForgedSword,
  ForgeParams,
  ForgeStats,
  GrainLine,
  GrainStyle,
  GripForm,
  GuardForm,
  MaterialDef,
  MaterialId,
  Overforge,
  QuenchDef,
  QuenchId,
  SwordGeometry,
} from './types';

/* ------------------------------------------------------------------ */
/* 静态词表（确定性常量，非随机）                                       */
/* ------------------------------------------------------------------ */

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  qingjin: {
    id: 'qingjin',
    name: '青金铁',
    hue: 205,
    sharpness: 0.72,
    hardness: 0.62,
    flexibility: 0.55,
    arcBias: -6,
    grainStyle: 'flow',
    description: '色泛青芒，刚柔并济，仕子佩剑常用。',
  },
  xantie: {
    id: 'xantie',
    name: '玄铁精',
    hue: 260,
    sharpness: 0.85,
    hardness: 0.92,
    flexibility: 0.3,
    arcBias: 2,
    grainStyle: 'straight',
    description: '沉黑如夜，硬度绝伦，唯柔韧稍逊。',
  },
  hanyu: {
    id: 'hanyu',
    name: '寒玉钢',
    hue: 175,
    sharpness: 0.78,
    hardness: 0.7,
    flexibility: 0.78,
    arcBias: -16,
    grainStyle: 'cloud',
    description: '触之生寒，弹韧若柳，利于弯折缠斗。',
  },
  wujin: {
    id: 'wujin',
    name: '乌金砂',
    hue: 42,
    sharpness: 0.66,
    hardness: 0.8,
    flexibility: 0.6,
    arcBias: 10,
    grainStyle: 'scale',
    description: '金纹隐隐，沉稳贵重，折叠后纹理灿然。',
  },
};

export const QUENCHES: Record<QuenchId, QuenchDef> = {
  water: {
    id: 'water',
    name: '清水淬',
    hueShift: 0,
    glowBoost: 0,
    hardnessMod: 0.08,
    sharpnessMod: 0.05,
    crackRisk: 0.25,
    description: '中正平和，最稳妥的古法。',
  },
  oil: {
    id: 'oil',
    name: '油脂淬',
    hueShift: 18,
    glowBoost: 0.12,
    hardnessMod: 0.02,
    sharpnessMod: 0.0,
    crackRisk: 0.08,
    description: '缓冷而韧，刃含温光。',
  },
  brine: {
    id: 'brine',
    name: '盐卤淬',
    hueShift: -12,
    glowBoost: 0.22,
    hardnessMod: 0.14,
    sharpnessMod: 0.12,
    crackRisk: 0.42,
    description: '激冷至极，刃利而险，易生细纹。',
  },
  snow: {
    id: 'snow',
    name: '雪水淬',
    hueShift: -35,
    glowBoost: 0.3,
    hardnessMod: 0.1,
    sharpnessMod: 0.08,
    crackRisk: 0.35,
    description: '至寒入刃，青辉流转。',
  },
};

/** 折叠档位 -> 名义折叠次数（展示用） */
export const FOLD_COUNTS = [0, 3, 8, 16, 32] as const;
/** 折叠档位 -> 理论层数 2^n */
const FOLD_LAYERS = [1, 8, 256, 65536, 4294967296] as const;

export const HEAT_LABELS = ['', '微温', '文火', '武火', '烈焰', '真火'] as const;

/* ------------------------------------------------------------------ */
/* 几何常量                                                            */
/* ------------------------------------------------------------------ */

export const BLADE_LEN = 360; // 剑格到剑尖的长度（SVG 单位）
const BLADE_SAMPLES = 48; // 剑身采样段数
const TIP_LEN = 34; // 收尖长度

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** HSL 转 hex，颜色由材质色相 + 淬火偏移决定。 */
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/* ------------------------------------------------------------------ */
/* 过炼判定                                                            */
/* ------------------------------------------------------------------ */

/** 火候与折叠同时过高触发过炼：heat>=4 且 folds>=3；heat=5 且 folds>=4 最严重。 */
export function evaluateOverforge(heat: number, folds: number): Overforge {
  const heatExcess = Math.max(0, heat - 3); // 0..2
  const foldExcess = Math.max(0, folds - 2); // 0..2
  const raw = heatExcess * foldExcess; // 0..4
  if (raw === 0) return { active: false, severity: 0, note: '' };
  const severity = clamp(raw / 4, 0, 1);
  let note: string;
  if (severity >= 0.9) note = '过炼折损：烈焰叠折，剑身崩裂寸许，锋芒大减。';
  else if (severity >= 0.5) note = '过炼折损：火猛折频，刃口生瑕，柔韧受损。';
  else note = '过炼折损：火候略燥，折叠过密，纹理微乱。';
  return { active: true, severity, note };
}

/* ------------------------------------------------------------------ */
/* 属性计算                                                            */
/* ------------------------------------------------------------------ */

function computeStats(
  material: MaterialDef,
  quench: QuenchDef,
  heat: number,
  folds: number,
  over: Overforge,
  rngPick: number,
): ForgeStats {
  // 火候：3 为最佳；偏离最佳则降工艺
  const heatFactor = 1 - Math.abs(heat - 3) * 0.07;
  // 折叠：适度提升工艺与锋利，过多受过炼影响
  const foldCraft = folds === 0 ? -0.05 : Math.min(0.22, folds * 0.06);
  const foldSharp = folds * 0.02;

  let sharpness = material.sharpness + quench.sharpnessMod + foldSharp + (heat - 3) * 0.015;
  let hardness = material.hardness + quench.hardnessMod + (heat - 3) * 0.03;
  let flexibility =
    material.flexibility -
    quench.hardnessMod * 0.6 -
    (heat - 3) * 0.02 +
    Math.min(0.12, folds * 0.03);
  let craftsmanship = clamp(0.5 + heatFactor * 0.4 + foldCraft, 0, 1);

  // 种子微扰（±3%），让同参数不同种子仍有可辨差异
  sharpness += (rngPick - 0.5) * 0.06;
  hardness += (rngPick - 0.5) * 0.05;

  if (over.active) {
    const s = over.severity;
    sharpness -= 0.12 * s + 0.08 * s; // 锋利与工艺双降
    hardness -= 0.05 * s;
    flexibility -= 0.22 * s; // 过炼最伤柔韧
    craftsmanship -= 0.25 * s;
  }

  const round100 = (v: number) => clamp(Math.round(v * 100), 1, 100);
  return {
    sharpness: round100(sharpness),
    hardness: round100(hardness),
    flexibility: round100(flexibility),
    craftsmanship: round100(craftsmanship),
  };
}

/* ------------------------------------------------------------------ */
/* 弧度：材质 arcBias + 火候（热则柔，弯）+ 种子抖动                    */
/* ------------------------------------------------------------------ */

function computeArc(material: MaterialDef, heat: number, jitter: number): number {
  // 火候越高越容易拉出弧度；寒玉钢本就偏弯
  const heatPull = (heat - 2) * 3.2;
  return Math.round((material.arcBias + heatPull + jitter * 10) * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* 折叠层数与纹理线数                                                  */
/* ------------------------------------------------------------------ */

function computeLayers(folds: FoldLevel, over: Overforge): { layers: number; visible: number } {
  const nominal = FOLD_LAYERS[folds];
  // 过炼时折损：严重过炼会让有效层数塌一档并带“崩层”
  let layers = nominal;
  if (over.active && over.severity > 0.8) layers = FOLD_LAYERS[Math.max(0, folds - 1)];
  // 可见纹理线：0 折 2 条，每档翻倍但封顶（多了视觉糊成色带）
  const visibleCap = [2, 5, 10, 16, 22][folds];
  return { layers, visible: visibleCap };
}

/* ------------------------------------------------------------------ */
/* 纹理生成：沿归一化剑身 t∈[0,1]（0=剑格, 1=剑尖），x 为宽度内偏移     */
/* ------------------------------------------------------------------ */

function makeGrainLines(
  style: GrainStyle,
  count: number,
  rng: ReturnType<typeof createRng>,
  over: Overforge,
): GrainLine[] {
  const lines: GrainLine[] = [];
  const segs = 22;
  for (let i = 0; i < count; i++) {
    // 在剑身宽度 [-0.42, 0.42] 内均匀布放基准位置
    const base = count === 1 ? 0 : -0.42 + (0.84 * i) / (count - 1);
    const phase = rng.float(0, Math.PI * 2);
    const amp = style === 'straight' ? 0.6 : style === 'flow' ? 3.2 : style === 'cloud' ? 5 : 2.2;
    const freq = style === 'cloud' ? 1.6 : style === 'scale' ? 3.2 : 1.1;
    const points: GrainLine['points'] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      let x: number;
      switch (style) {
        case 'straight':
          x = base + Math.sin(t * 2 + phase) * 0.4;
          break;
        case 'flow':
          x = base + Math.sin(t * Math.PI * 2 * freq + phase) * amp * 0.014;
          break;
        case 'cloud':
          x =
            base +
            (Math.sin(t * Math.PI * 2 * freq + phase) * 0.5 +
              Math.sin(t * Math.PI * 5 + phase * 1.7) * 0.5) *
              amp *
              0.012;
          break;
        case 'scale':
          x = base + (Math.abs(Math.sin(t * Math.PI * 2 * freq + phase)) - 0.5) * amp * 0.02;
          break;
      }
      // 向剑尖收窄：宽度位置随 t 线性收束
      x *= 1 - t * 0.85;
      // 过炼让纹理在剑身上段紊乱
      if (over.active && t > 0.6) {
        x += (rng.next() - 0.5) * over.severity * 0.05;
      }
      points.push({ x: Math.round(x * 1000) / 1000, y: Math.round(t * 1000) / 1000 });
    }
    lines.push({
      points,
      opacity: Math.round((0.22 + rng.next() * 0.4) * 100) / 100,
      width: Math.round((0.5 + rng.next() * 0.9) * 100) / 100,
    });
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* 剑格 / 剑柄形制：由四项参数共同决定（每种参数都参与）                */
/* ------------------------------------------------------------------ */

function computeForms(params: ForgeParams, seed: number): {
  guard: GuardForm;
  grip: GripForm;
} {
  // 材质定大类倾向，火候/折叠/淬火做轮换，保证四项都在形制上有贡献
  const materialOrder: Record<MaterialId, GuardForm[]> = {
    qingjin: ['ruyi', 'wing', 'disc', 'animal'],
    xantie: ['animal', 'disc', 'wing', 'ruyi'],
    hanyu: ['wing', 'ruyi', 'animal', 'disc'],
    wujin: ['disc', 'animal', 'ruyi', 'wing'],
  };
  const gripByQuench: Record<QuenchId, GripForm[]> = {
    water: ['plainwrap', 'coilcord', 'jadeinlay', 'rivet'],
    oil: ['coilcord', 'plainwrap', 'rivet', 'jadeinlay'],
    brine: ['rivet', 'jadeinlay', 'coilcord', 'plainwrap'],
    snow: ['jadeinlay', 'rivet', 'plainwrap', 'coilcord'],
  };
  const guardIdx = (params.heat - 1 + params.folds) % 4;
  const gripIdx = (params.folds + params.heat + (seed % 3)) % 4;
  return {
    guard: materialOrder[params.material][guardIdx],
    grip: gripByQuench[params.quench][gripIdx],
  };
}

/* ------------------------------------------------------------------ */
/* 剑名：由参数与种子从词表里组合，纯确定                               */
/* ------------------------------------------------------------------ */

const NAME_PREFIX = ['流', '寒', '玄', '青', '烬', '雪', '墨', '霜'];
const NAME_CORE = ['霜', '虹', '螭', '星', '岚', '魄', '电', '潮'];
const TITLES = [
  '新锻初成',
  '炉中初鸣',
  '淬火方利',
  '纹理自开',
  '寒芒未定',
  '折叠有成',
  '炉火纯青',
  '百炼始发',
];

function pickName(rng: ReturnType<typeof createRng>, over: Overforge): { name: string; title: string } {
  if (over.active && over.severity > 0.8) {
    return { name: '残锋', title: '过炼折损' };
  }
  return {
    name: `${rng.pick(NAME_PREFIX)}${rng.pick(NAME_CORE)}`,
    title: rng.pick(TITLES),
  };
}

/* ------------------------------------------------------------------ */
/* 剑身几何：弧度中轴 + 两侧轮廓 + 剑尖                                 */
/* ------------------------------------------------------------------ */

function buildBlade(arc: number, baseWidth: number) {
  const spine: SwordGeometry['spine'] = [];
  const bladeLeft: SwordGeometry['bladeLeft'] = [];
  const bladeRight: SwordGeometry['bladeRight'] = [];

  // 弧度曲线：以三次缓动把横向位移从 0 推到 arc，像手工拉出的弯身
  const curve = (t: number) => arc * (1 - Math.pow(1 - t, 3));
  // 剑身宽度：剑格处最宽，直线收窄，末段 TIP_LEN 快速收成尖
  const widthAt = (t: number) => {
    const y = t * BLADE_LEN;
    if (y >= BLADE_LEN - TIP_LEN) {
      const k = (BLADE_LEN - y) / TIP_LEN; // 1 -> 0
      return baseWidth * Math.max(0, k);
    }
    return baseWidth * (1 - 0.55 * t);
  };

  for (let i = 0; i <= BLADE_SAMPLES; i++) {
    const t = i / BLADE_SAMPLES;
    const y = -t * BLADE_LEN;
    const cx = curve(t);
    const w = widthAt(t);
    spine.push({ x: r2(cx), y: r2(y) });
    bladeLeft.push({ x: r2(cx - w / 2), y: r2(y) });
    bladeRight.push({ x: r2(cx + w / 2), y: r2(y) });
  }

  const tip = spine[spine.length - 1];
  return { spine, bladeLeft, bladeRight, tip };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ */
/* 主入口：forgeSword —— 唯一的数值/几何真源                            */
/* ------------------------------------------------------------------ */

export function forgeSword(params: ForgeParams): ForgedSword {
  const material = MATERIALS[params.material];
  const quench = QUENCHES[params.quench];

  const seedValue = seedFromParts([
    'v1',
    params.material,
    params.heat,
    params.folds,
    params.quench,
    params.seed.trim() || 'default',
  ]);
  const rng = createRng(seedValue);

  const over = evaluateOverforge(params.heat, params.folds);
  const stats = computeStats(
    material,
    quench,
    params.heat,
    params.folds,
    over,
    rng.next(),
  );

  const arc = computeArc(material, params.heat, rng.next() - 0.5);
  // 剑格处宽度：玄铁厚，寒玉窄；火候高略展宽
  const baseWidth = r2(
    clamp(15 + (material.hardness - 0.6) * 12 + (params.heat - 3) * 0.8, 10, 22),
  );

  const { layers, visible } = computeLayers(params.folds, over);
  const grainLines = makeGrainLines(material.grainStyle, visible, rng, over);

  // 淬火裂纹：风险高且 rng 命中时，在刃身 0.4-0.95 处生成 1-3 条
  const cracks: number[] = [];
  const crackRoll = rng.next();
  if (crackRoll < quench.crackRisk) {
    const n = 1 + (crackRoll < quench.crackRisk * 0.35 ? 2 : 0);
    for (let i = 0; i < n; i++) cracks.push(r2(0.4 + rng.next() * 0.55));
  }

  // 刃色辉光：材质色相 + 淬火偏移；火候高辉光强，过炼则溃散
  const hue = material.hue + quench.hueShift + (rng.next() - 0.5) * 6;
  const sat = clamp(0.45 + params.folds * 0.06 + quench.glowBoost, 0.25, 0.85);
  const light = clamp(0.4 + (params.heat - 1) * 0.05 + quench.glowBoost * 0.4, 0.25, 0.72);
  let glowIntensity = clamp(
    0.25 + (params.heat - 1) * 0.12 + quench.glowBoost + params.folds * 0.03,
    0.1,
    0.95,
  );
  if (over.active) glowIntensity *= 1 - over.severity * 0.55;
  glowIntensity = r2(glowIntensity);

  const bladeColor = hslToHex(hue, sat * 0.5, light * 0.7);
  const edgeColor = hslToHex(hue, sat, Math.min(0.9, light + 0.25));

  const { guard, grip } = computeForms(params, seedValue);
  const { spine, bladeLeft, bladeRight, tip } = buildBlade(arc, baseWidth);
  const { name, title } = pickName(rng, over);

  const geometry: SwordGeometry = {
    spine,
    bladeLeft,
    bladeRight,
    tip,
    baseWidth,
    arc,
    layers,
    grainLineCount: grainLines.length,
    grainStyle: material.grainStyle,
    grainLines,
    guardForm: guard,
    gripForm: grip,
    cracks,
    glow: {
      color: edgeColor,
      intensity: glowIntensity,
      radius: r2(6 + glowIntensity * 14),
    },
    bladeColor,
    edgeColor,
  };

  // 几何指纹：对所有采样点与关键属性做归一化哈希（确定性，无随机调用）
  const fingerprint = geometryFingerprint(params, seedValue, stats, geometry);

  return {
    params,
    seedValue,
    name,
    title,
    stats,
    overforge: over,
    geometry,
    fingerprint,
    forgedAt: '甲子炉火',
  };
}

/** 几何指纹：采样坐标 + 离散属性共同哈希，保证同参同种完全一致。 */
export function geometryFingerprint(
  params: ForgeParams,
  seedValue: number,
  stats: ForgeStats,
  g: SwordGeometry,
): string {
  const parts: Array<string | number> = [
    seedValue,
    params.material,
    params.heat,
    params.folds,
    params.quench,
    r2(g.arc),
    r2(g.baseWidth),
    g.layers,
    g.grainLineCount,
    g.grainStyle,
    g.guardForm,
    g.gripForm,
    g.glow.color,
    r2(g.glow.intensity),
    stats.sharpness,
    stats.hardness,
    stats.flexibility,
    stats.craftsmanship,
  ];
  // 采样点指纹：取两侧轮廓与纹理关键点，量化到 0.01
  const sample: number[] = [];
  for (const p of g.bladeLeft) sample.push(p.x, p.y);
  for (const p of g.bladeRight) sample.push(p.x, p.y);
  for (const line of g.grainLines) {
    for (const p of line.points) sample.push(p.x, p.y);
  }
  parts.push(hashString(sample.join(',')));
  // 双哈希拉开长度，形成 16 位指纹
  const h1 = hashString(parts.join('|')).toString(16).padStart(8, '0');
  const h2 = hashString(`fp:${h1}:${sample.length}`).toString(16).padStart(8, '0');
  return (h1 + h2).slice(0, 16);
}
