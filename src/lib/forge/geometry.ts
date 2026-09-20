/**
 * 剑体几何生成：纯函数，输入参数与种子随机流，输出整把剑的三维环面模型、
 * 纹理/折叠/裂痕装饰线、刃线。同参数同种子，几何逐点一致。
 *
 * 坐标约定：y 沿剑身向上（0 为剑格处，BLADE_LEN 为剑尖），x 为剑宽方向，
 * z 为剑脊厚度方向（+z 朝观察者）。剑格、剑柄、剑首位于 y < 0。
 */

import { MATERIALS, QUENCHES, type ForgeParams } from './options';
import type { Rng } from './rng';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ring {
  y: number;
  pts: Vec3[];
}

export interface Part {
  id: 'blade' | 'guard' | 'handle' | 'pommel';
  rings: Ring[];
  capStart: boolean;
  capEnd: boolean;
  color: [number, number, number];
  /** 镜面高光强度 0..1 */
  metallic: number;
}

export type DecoKind = 'grain' | 'layer' | 'crack';

export interface DecoLine {
  pts: Vec3[];
  /** 1 = 剑身正面，-1 = 背面 */
  side: 1 | -1;
  kind: DecoKind;
}

export interface BladeStation {
  y: number;
  cx: number;
  w: number;
  t: number;
}

export interface SwordModel {
  parts: Part[];
  decos: DecoLine[];
  edges: { left: Vec3[]; right: Vec3[] };
  /** 断口折线（仅过炼折损时存在） */
  breakLine: Vec3[] | null;
  /** 剑身站位表（供渲染层高光线等使用） */
  stations: BladeStation[];
  centerY: number;
  minY: number;
  maxY: number;
  broken: boolean;
}

export interface SwordModelMeta {
  curveAmp: number;
  grainCount: number;
  layerCount: number;
  breakU: number;
}

export const BLADE_LEN = 300;
const STATIONS = 24;

/** 超椭圆截面：n=2 椭圆，n→∞ 方形，n=1 菱形 */
function superellipse(rx: number, rz: number, n: number, count: number, offset = 0): Vec3[] {
  const pts: Vec3[] = [];
  const exp = 2 / n;
  for (let k = 0; k < count; k++) {
    const th = (2 * Math.PI * k) / count + offset;
    const c = Math.cos(th);
    const s = Math.sin(th);
    pts.push({
      x: rx * Math.sign(c) * Math.pow(Math.abs(c), exp),
      y: 0,
      z: rz * Math.sign(s) * Math.pow(Math.abs(s), exp),
    });
  }
  return pts;
}

function scaleRing(pts: Vec3[], y: number, scale: number): Ring {
  return { y, pts: pts.map((p) => ({ x: p.x * scale, y, z: p.z * scale })) };
}

export function buildSwordModel(
  params: ForgeParams,
  rng: Rng,
  broken: boolean,
): { model: SwordModel; meta: SwordModelMeta } {
  const mat = MATERIALS[params.material];
  const quench = QUENCHES[params.quench];

  // —— 剑身弧度：随材质变化，种子微调 ——
  const curveAmp = (mat.curvature + rng.range(-0.012, 0.012)) * (rng.chance(0.5) ? 1 : -1);
  const maxW = 13 * mat.width * rng.range(0.96, 1.05);
  const maxT = 3.4 * rng.range(0.95, 1.08);
  // —— 过炼折损：剑身在半途断裂 ——
  const breakU = broken ? rng.range(0.5, 0.66) : 1;

  const stations: BladeStation[] = [];
  for (let i = 0; i <= STATIONS; i++) {
    const su = Math.pow(i / STATIONS, 1.12);
    const u = su * breakU;
    const y = u * BLADE_LEN;
    const taper = Math.pow(1 - u, 0.62);
    const waist = 1 - 0.07 * Math.sin(u * Math.PI);
    const w = Math.max(0.35, maxW * taper * waist);
    const t = Math.max(0.3, maxT * (Math.pow(1 - u, 0.85) * 0.85 + 0.15));
    const cx = curveAmp * BLADE_LEN * Math.pow(u, 1.8);
    stations.push({ y, cx, w, t });
  }

  // 断口参差
  const breakJitter: { dy: number; dx: number }[] = [];
  if (broken) {
    for (let k = 0; k < 4; k++) {
      breakJitter.push({ dy: rng.range(-5, 5), dx: rng.range(-1.6, 1.6) });
    }
  }

  const bladeRings: Ring[] = stations.map((st, idx) => {
    const pts: Vec3[] = [
      { x: st.cx - st.w, y: st.y, z: 0 }, // 左刃
      { x: st.cx, y: st.y, z: st.t }, // 前脊
      { x: st.cx + st.w, y: st.y, z: 0 }, // 右刃
      { x: st.cx, y: st.y, z: -st.t }, // 后脊
    ];
    if (broken && idx === stations.length - 1) {
      pts.forEach((p, k) => {
        p.y += breakJitter[k].dy;
        p.x += breakJitter[k].dx;
      });
    }
    return { y: st.y, pts };
  });

  const blade: Part = {
    id: 'blade',
    rings: bladeRings,
    capStart: false,
    capEnd: broken,
    color: mat.steel,
    metallic: 0.95,
  };

  // —— 剑格形制：随材质变化 ——
  const guardH = 15;
  const guardSpec: Record<string, { gw: number; gt: number; n: number }> = {
    square: { gw: 34, gt: 10, n: 3.5 },
    round: { gw: 30, gt: 10, n: 2 },
    wing: { gw: 44, gt: 7, n: 2 },
    diamond: { gw: 30, gt: 9, n: 1 },
  };
  const gs = guardSpec[mat.guard];
  const gw = gs.gw * rng.range(0.95, 1.06);
  const gt = gs.gt * rng.range(0.94, 1.08);
  const guardBase = superellipse(gw, gt, gs.n, 8, Math.PI / 8);
  const guard: Part = {
    id: 'guard',
    rings: [
      scaleRing(guardBase, -guardH, 0.8),
      scaleRing(guardBase, -guardH * 0.45, 1),
      scaleRing(guardBase, 0.5, 0.92),
    ],
    capStart: true,
    capEnd: false,
    color: mat.fitting,
    metallic: 0.75,
  };

  // —— 剑柄形制：随淬火介质变化 ——
  const handleLen = 86 + rng.range(-4, 6);
  const handleTop = -guardH + 1;
  const handleRings: Ring[] = [];
  const HANDLE_RINGS = 5;
  for (let i = 0; i < HANDLE_RINGS; i++) {
    const v = i / (HANDLE_RINGS - 1);
    const y = handleTop - v * handleLen;
    let rx = 8;
    let rz = 7.2;
    let n = 2;
    let offset = 0;
    if (quench.handle === 'octagon') {
      rx = 8.4; rz = 7.6; n = 8; offset = Math.PI / 8;
    } else if (quench.handle === 'flat') {
      rx = 9.5; rz = 5; n = 3.5;
    } else if (quench.handle === 'spindle') {
      const bulge = 1 + 0.28 * Math.sin(Math.PI * v);
      rx = 8 * bulge; rz = 7 * bulge;
    }
    const taperK = 1 - 0.1 * v;
    handleRings.push(scaleRing(superellipse(rx, rz, n, 8, offset), y, taperK));
  }
  const handle: Part = {
    id: 'handle',
    rings: handleRings,
    capStart: false,
    capEnd: false,
    color: quench.handleColor,
    metallic: 0.25,
  };

  // —— 剑首 ——
  const pommelY = handleTop - handleLen;
  const pommelBase = superellipse(11.5, 9.5, 2, 8, Math.PI / 8);
  const pommel: Part = {
    id: 'pommel',
    rings: [
      scaleRing(superellipse(6, 5.4, 2, 8, Math.PI / 8), pommelY - 2, 1),
      scaleRing(pommelBase, pommelY - 11, 1),
      scaleRing(superellipse(5, 4.4, 2, 8, Math.PI / 8), pommelY - 16.5, 1),
    ],
    capStart: false,
    capEnd: true,
    color: mat.fitting,
    metallic: 0.75,
  };

  // —— 表面取样工具 ——
  const stationAt = (u: number): BladeStation => {
    const y = u * BLADE_LEN;
    // 站位按 su^1.12 分布，直接按 y 线性插值足够平滑
    let lo = stations[0];
    let hi = stations[stations.length - 1];
    for (let i = 0; i < stations.length - 1; i++) {
      if (y >= stations[i].y && y <= stations[i + 1].y) {
        lo = stations[i];
        hi = stations[i + 1];
        break;
      }
    }
    const span = hi.y - lo.y || 1;
    const k = Math.min(1, Math.max(0, (y - lo.y) / span));
    return {
      y,
      cx: lo.cx + (hi.cx - lo.cx) * k,
      w: lo.w + (hi.w - lo.w) * k,
      t: lo.t + (hi.t - lo.t) * k,
    };
  };
  /** 剑面上一点：f∈[0,1] 为距中线比例（0 脊 1 刃），eps 为浮出表面的距离 */
  const surfacePoint = (u: number, f: number, eps: number): Vec3 => {
    const st = stationAt(u);
    return { x: st.cx + f * st.w, y: st.y, z: st.t * (1 - f) + eps };
  };
  const mirrorPt = (p: Vec3): Vec3 => {
    const st = stationAt(p.y / BLADE_LEN);
    return { x: 2 * st.cx - p.x, y: p.y, z: -p.z };
  };

  const decos: DecoLine[] = [];

  // —— 折叠层线：条数随折叠次数变化 ——
  const layerCount = params.folds;
  const uHi = Math.max(0.2, breakU - 0.08);
  for (let k = 0; k < layerCount; k++) {
    const f0 = 0.14 + (0.68 * (k + 0.5)) / layerCount + rng.range(-0.02, 0.02);
    const phase = rng.range(0, Math.PI * 2);
    const amp = rng.range(0.008, 0.02);
    const pts: Vec3[] = [];
    const SEG = 36;
    for (let i = 0; i <= SEG; i++) {
      const u = 0.06 + (uHi - 0.06) * (i / SEG);
      const wob = 1 + amp * Math.sin(u * 22 + phase);
      const ff = Math.min(0.92, Math.max(0.06, f0 * wob));
      pts.push(surfacePoint(u, ff, 0.35));
    }
    decos.push({ pts, side: 1, kind: 'layer' });
    decos.push({ pts: pts.map(mirrorPt), side: -1, kind: 'layer' });
  }

  // —— 刃纹线：条数随淬火介质变化 ——
  const grainCount = quench.grainLines + rng.int(0, 2);
  for (let k = 0; k < grainCount; k++) {
    const f0 = rng.range(0.6, 0.88);
    const u0 = rng.range(0.08, Math.max(0.1, uHi - 0.24));
    const len = rng.range(0.14, 0.3);
    const phase = rng.range(0, Math.PI * 2);
    const freq = rng.range(30, 60);
    const pts: Vec3[] = [];
    const SEG = 22;
    for (let i = 0; i <= SEG; i++) {
      const u = u0 + len * (i / SEG);
      if (u > uHi) break;
      const f = Math.min(0.94, Math.max(0.5, f0 + 0.09 * Math.sin(u * freq + phase)));
      pts.push(surfacePoint(u, f, 0.45));
    }
    if (pts.length > 1) {
      decos.push({ pts, side: 1, kind: 'grain' });
      decos.push({ pts: pts.map(mirrorPt), side: -1, kind: 'grain' });
    }
  }

  // —— 过炼裂痕 ——
  if (broken) {
    const cracks = 2 + rng.int(0, 2);
    for (let k = 0; k < cracks; k++) {
      const f0 = rng.range(0.25, 0.7) * (rng.chance(0.5) ? 1 : -0.4);
      const len = rng.range(0.1, 0.24);
      const pts: Vec3[] = [];
      const SEG = 9;
      for (let i = 0; i <= SEG; i++) {
        const u = breakU - 0.015 - len * (i / SEG);
        if (u < 0.05) break;
        const f = Math.min(0.9, Math.max(0.05, f0 + rng.range(-0.09, 0.09)));
        pts.push(surfacePoint(u, f, 0.5));
      }
      if (pts.length > 1) {
        decos.push({ pts, side: 1, kind: 'crack' });
        decos.push({ pts: pts.map(mirrorPt), side: -1, kind: 'crack' });
      }
    }
  }

  // —— 刃线与断口 ——
  const left = bladeRings.map((r) => r.pts[0]);
  const right = bladeRings.map((r) => r.pts[2]);
  const breakLine = broken ? bladeRings[bladeRings.length - 1].pts.slice() : null;

  const minY = pommelY - 16.5;
  const maxY = stations[stations.length - 1].y;

  const model: SwordModel = {
    parts: [blade, guard, handle, pommel],
    decos,
    edges: { left, right },
    breakLine,
    stations,
    centerY: (minY + maxY) / 2,
    minY,
    maxY,
    broken,
  };

  return { model, meta: { curveAmp, grainCount, layerCount, breakU } };
}

/**
 * 几何指纹：把全部环面坐标量化后散列为 8 位十六进制。
 * 同参数同种子 → 同一指纹；几何有任何差异 → 指纹不同。
 */
export function fingerprintModel(model: SwordModel): string {
  let h = 2166136261 >>> 0;
  const mix = (n: number) => {
    h ^= n & 0xffff;
    h = Math.imul(h, 16777619);
  };
  for (const part of model.parts) {
    mix(part.id.length * 131 + part.rings.length);
    for (const ring of part.rings) {
      mix(Math.round(ring.y * 10) + 4096);
      for (const p of ring.pts) {
        mix(Math.round(p.x * 10) + 4096);
        mix(Math.round(p.z * 10) + 4096);
      }
    }
  }
  mix(model.decos.length * 7 + 13);
  for (const d of model.decos) {
    mix(d.pts.length * 3 + (d.side === 1 ? 1 : 2));
    const p0 = d.pts[0];
    mix(Math.round(p0.x * 10) + 4096);
    mix(Math.round(p0.y * 10) + 4096);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  const hex = (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}
