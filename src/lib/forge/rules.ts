/**
 * 铸剑规则：属性、命名、刃色辉光、过炼折损——全部由参数与种子算出。
 * 纯函数，不依赖 React，不用 Math.random。
 */

import { createRng, hashSeed } from './rng';
import {
  MATERIALS,
  QUENCHES,
  isOverForged,
  type ForgeParams,
  type MaterialId,
  type QuenchId,
} from './options';
import { buildSwordModel, fingerprintModel, type SwordModel } from './geometry';

export interface ForgeAttributes {
  sharpness: number;
  hardness: number;
  flexibility: number;
  craftsmanship: number;
}

export interface EdgeGlow {
  /** 刃色 */
  color: string;
  /** 辉光强度 0..1 */
  intensity: number;
  label: string;
}

export interface ForgeResult {
  params: ForgeParams;
  name: string;
  alias: string;
  broken: boolean;
  attributes: ForgeAttributes;
  stats: {
    /** 折叠层数 = 2^折叠次数 */
    layers: number;
    grainLines: number;
    curvature: number;
    guardName: string;
    handleName: string;
    heatLabel: string;
  };
  glow: EdgeGlow;
  lore: string;
  model: SwordModel;
  fingerprint: string;
}

export function heatLabel(heat: number): string {
  if (heat <= 3) return '文火';
  if (heat <= 6) return '中火';
  if (heat <= 8) return '武火';
  return '极焰';
}

/** 刃色辉光：随火候变化；过炼则转为黯淡余烬 */
export function edgeGlow(heat: number, broken: boolean): EdgeGlow {
  if (broken) {
    return { color: 'rgb(176, 58, 46)', intensity: 0.5, label: '余烬暗红' };
  }
  const stops: { t: number; c: [number, number, number]; label: string }[] = [
    { t: 0, c: [122, 138, 153], label: '冷铁青灰' },
    { t: 0.3, c: [159, 180, 200], label: '霜刃银蓝' },
    { t: 0.55, c: [232, 232, 240], label: '寒光银白' },
    { t: 0.8, c: [255, 217, 122], label: '流金炽芒' },
    { t: 1, c: [255, 107, 74], label: '赤焰流光' },
  ];
  const t = (heat - 1) / 9;
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const c = a.c.map((v, i) => Math.round(v + (b.c[i] - v) * k)) as [number, number, number];
  const label = k < 0.5 ? a.label : b.label;
  return {
    color: `rgb(${c[0]}, ${c[1]}, ${c[2]})`,
    intensity: 0.25 + 0.75 * t,
    label,
  };
}

const NAME_PREFIX: Record<MaterialId, string[]> = {
  xuantie: ['玄', '墨', '渊', '陨'],
  bintie: ['镔', '霜', '冽', '雪'],
  qingtong: ['青', '夔', '钺', '苍'],
  bailian: ['炼', '虹', '星', '寒'],
};

const NAME_SUFFIX: Record<QuenchId, string[]> = {
  hanquan: ['泉', '潭', '冰', '泓'],
  songzhi: ['松', '烟', '柏', '脂'],
  shouxue: ['血', '炎', '赤', '煞'],
  chenlu: ['露', '晓', '霖', '霑'],
};

const ALIAS_POOL = ['断水', '流云', '惊鸿', '照夜', '衔霜', '逐月', '沉星', '听雨', '裁云', '饮雪'];
const ALIAS_BROKEN = ['折戟', '沉沙', '断鸿'];

const clampAttr = (v: number) => Math.max(3, Math.min(99, Math.round(v)));

export function forgeSword(params: ForgeParams): ForgeResult {
  // 随机流：种子 + 全部参数，取流顺序固定，保证完全确定
  const rng = createRng(
    hashSeed(`${params.seed}｜${params.material}｜${params.heat}｜${params.folds}｜${params.quench}`),
  );
  const broken = isOverForged(params);
  const mat = MATERIALS[params.material];
  const quench = QUENCHES[params.quench];

  // —— 属性 ——
  let sharpness = 34 + params.heat * 3.2 + params.folds * 1.2 + quench.sharpness + mat.sharpness + rng.range(-6, 6);
  let hardness = 30 + params.heat * 3.8 + mat.hardness + params.folds * 0.8 + rng.range(-6, 6);
  let flexibility = 32 + params.folds * 3.4 + mat.flexibility - params.heat * 1.4 + rng.range(-6, 6);
  let craftsmanship = 28 + params.folds * 2.2 + params.heat * 1.6 + rng.range(0, 22);
  if (broken) {
    sharpness *= 0.42;
    hardness *= 0.5;
    flexibility *= 0.35;
    craftsmanship *= 0.55;
  }
  const attributes: ForgeAttributes = {
    sharpness: clampAttr(sharpness),
    hardness: clampAttr(hardness),
    flexibility: clampAttr(flexibility),
    craftsmanship: clampAttr(craftsmanship),
  };

  // —— 命名 ——
  const prefix = rng.pick(NAME_PREFIX[params.material]);
  const suffix = rng.pick(NAME_SUFFIX[params.quench]);
  const name = broken ? `残·${prefix}${suffix}` : `${prefix}${suffix}`;
  const alias = broken ? rng.pick(ALIAS_BROKEN) : rng.pick(ALIAS_POOL);

  // —— 几何（继续消耗同一随机流，顺序固定） ——
  const { model, meta } = buildSwordModel(params, rng, broken);
  const fingerprint = fingerprintModel(model);
  const glow = edgeGlow(params.heat, broken);

  const layers = Math.pow(2, params.folds);
  const lore = broken
    ? `以${mat.name}为胚，${heatLabel(params.heat)}锻之，折叠${params.folds}次凡${layers}层，` +
      `方入${quench.name}，剑身不堪重负，铿然断于炉前。过炼之伤，非战之罪。`
    : `以${mat.name}为胚，${heatLabel(params.heat)}锻之，折叠${params.folds}次凡${layers}层，` +
      `${quench.name}淬之，砥石开刃。剑成之日，${glow.label}，光寒一室。`;

  return {
    params,
    name,
    alias,
    broken,
    attributes,
    stats: {
      layers,
      grainLines: meta.grainCount,
      curvature: Math.abs(meta.curveAmp),
      guardName: mat.guardName,
      handleName: quench.handleName,
      heatLabel: heatLabel(params.heat),
    },
    glow,
    lore,
    model,
    fingerprint,
  };
}
