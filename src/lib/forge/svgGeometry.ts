/**
 * 由 ForgedSword 的几何数据生成手写 SVG 路径与元件。
 * 纯函数：输入 geometry，输出 path 的 d 字符串与若干绘制描述，
 * 不引用 React / DOM / 任何图形库。
 *
 * 坐标系与 generate.ts 约定一致：
 *   剑格在 y=0，剑尖向上（y 负方向），剑柄向下（y 正方向）。
 */

import { BLADE_LEN } from './generate';
import type { ForgedSword, GripForm, GuardForm, SwordGeometry } from './types';

export interface Pt {
  x: number;
  y: number;
}

const f = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** 平滑 Catmull-Rom 转 Bezier，走剑身两侧采样点。 */
function smoothPath(points: Pt[], close = false): string {
  if (points.length < 2) return '';
  let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  if (close) d += ' Z';
  return d;
}

/** 剑身外轮廓：右缘上行至剑尖，再沿左缘下行闭合。 */
export function bladeOutlinePath(g: SwordGeometry): string {
  const up = g.bladeRight;
  const down = [...g.bladeLeft].reverse();
  const pts = [...up, ...down];
  return smoothPath(pts, true);
}

/** 中轴脊线（淡淡的中线）。 */
export function spinePath(g: SwordGeometry): string {
  return smoothPath(g.spine);
}

/** 纹理线：几何里的归一化点投到真实剑身坐标。 */
export function grainLinePaths(g: SwordGeometry): Array<{ d: string; opacity: number; width: number }> {
  return g.grainLines.map((line) => {
    const pts: Pt[] = line.points.map((p) => {
      const t = p.y;
      // 找该 t 处的左右缘，用插值确定实际半宽
      const idx = Math.round(t * (g.bladeLeft.length - 1));
      const l = g.bladeLeft[idx];
      const r = g.bladeRight[idx];
      const half = (r.x - l.x) / 2;
      const cx = (r.x + l.x) / 2;
      return { x: cx + p.x * half * 2, y: -t * BLADE_LEN };
    });
    return { d: smoothPath(pts), opacity: line.opacity, width: line.width };
  });
}

/** 开刃双线：贴近两侧缘的高光刃筋。 */
export function edgeLinePaths(g: SwordGeometry): [string, string] {
  const inset = (arr: Pt[]): Pt[] =>
    arr.map((p, i) => {
      const l = g.bladeLeft[i];
      const r = g.bladeRight[i];
      const cx = (l.x + r.x) / 2;
      return { x: cx + (p.x - cx) * 0.82, y: p.y };
    });
  return [smoothPath(inset(g.bladeLeft)), smoothPath(inset(g.bladeRight))];
}

/* ------------------------------------------------------------------ */
/* 剑格（护手）形制：四种手绘造型                                      */
/* ------------------------------------------------------------------ */

export function guardPath(form: GuardForm): string {
  switch (form) {
    // 如意云头形：左右外撇、中心起鼓
    case 'ruyi':
      return (
        'M -26 -4 ' +
        'C -30 -12 -16 -14 -10 -8 ' +
        'C -6 -14 6 -14 10 -8 ' +
        'C 16 -14 30 -12 26 -4 ' +
        'C 20 2 10 4 0 4 ' +
        'C -10 4 -20 2 -26 -4 Z'
      );
    // 兽吻形：宽而方折，两端出尖牙
    case 'animal':
      return 'M -30 -6 L -22 2 L -8 6 L 0 3 L 8 6 L 22 2 L 30 -6 L 22 -8 L 8 -5 L 0 -7 L -8 -5 L -22 -8 Z';
    // 圆盘形：椭圆护手
    case 'disc':
      return 'M -22 0 A 22 7 0 1 1 22 0 A 22 7 0 1 1 -22 0 Z';
    // 展翼形：两翼斜挑
    case 'wing':
      return 'M -30 2 L -10 -3 L 0 -2 L 10 -3 L 30 2 L 12 6 L 0 4 L -12 6 Z';
    default:
      return '';
  }
}

/* ------------------------------------------------------------------ */
/* 剑柄 / 柄首：四种缠柄形制                                           */
/* ------------------------------------------------------------------ */

export interface GripArt {
  /** 柄身外轮廓 */
  grip: string;
  /** 缠绳/铆钉等装饰线（多条） */
  wraps: string[];
  /** 柄首路径 */
  pommel: string;
}

const GRIP_TOP = 8;
const GRIP_BOTTOM = 96;

export function gripArt(form: GripForm): GripArt {
  // 柄身微鼓
  const grip =
    'M -6 ' + GRIP_TOP +
    ' C -8 30 -8 72 -7 ' + GRIP_BOTTOM +
    ' L 7 ' + GRIP_BOTTOM +
    ' C 8 72 8 30 6 ' + GRIP_TOP + ' Z';

  const wraps: string[] = [];
  if (form === 'plainwrap') {
    // 素缠：三段横向布箍
    [30, 52, 74].forEach((y) => {
      wraps.push(`M -6.6 ${y} C 0 ${y + 3} 0 ${y + 3} 6.6 ${y}`);
    });
  } else if (form === 'coilcord') {
    // 缠绳：连续斜向缠绕
    for (let y = GRIP_TOP + 6; y < GRIP_BOTTOM - 4; y += 9) {
      wraps.push(`M -6.8 ${y} C 0 ${y + 5} 0 ${y + 5} 6.8 ${y + 9}`);
    }
  } else if (form === 'jadeinlay') {
    // 嵌玉：三处方形嵌片
    [34, 56, 78].forEach((y) => {
      wraps.push(`M -3 ${y - 4} L 3 ${y - 4} L 3 ${y + 4} L -3 ${y + 4} Z`);
    });
  } else {
    // 铆钉：双排圆点（用极短路径模拟）
    for (let y = 26; y <= 80; y += 12) {
      wraps.push(`M -3 ${y} a 1.6 1.6 0 1 0 0.1 0 Z`);
      wraps.push(`M 3 ${y + 6} a 1.6 1.6 0 1 0 0.1 0 Z`);
    }
  }

  // 柄首：各形制统一做一个剑首，但随形制微调
  const pommel =
    form === 'jadeinlay'
      ? 'M -8 96 L 8 96 L 6 108 C 0 112 -6 112 -6 108 Z'
      : form === 'rivet'
        ? 'M -9 96 L 9 96 L 7 106 L -7 106 Z'
        : 'M -7 96 L 7 96 C 9 104 6 109 0 109 C -6 109 -9 104 -7 96 Z';

  return { grip, wraps, pommel };
}

/** 过炼崩裂缺口（在刃身上画小三角缺口，由 cracks 位置决定）。 */
export function crackMarks(g: SwordGeometry): string[] {
  return g.cracks.map((t) => {
    const idx = Math.round(t * (g.bladeLeft.length - 1));
    const p = g.bladeRight[idx];
    const y = p.y;
    const depth = 3 + ((idx * 7) % 4);
    return `M ${f(p.x)} ${f(y)} l -${depth} 2 l ${depth - 1} 3 Z`;
  });
}

/* ------------------------------------------------------------------ */
/* 伪三维投影：给定绕竖直中轴的转角，返回水平压缩比与横向偏移           */
/* 纯函数，供 rAF 每帧调用（在 ref 里），不触发 React 渲染              */
/* ------------------------------------------------------------------ */

export interface Projected {
  /** 水平方向压缩（cos 角），绝对值越小越侧 */
  scaleX: number;
  /** 整体水平平移（让旋转绕视觉中心，轻微视差） */
  shiftX: number;
  /** 朝向：1 朝右，-1 朝左，0 近似正侧 */
  facing: number;
  /** 刃身高光在宽度内的归一化位置 -1..1，随光位与转角变化 */
  highlight: number;
  /** 明暗系数 0..1（侧对光源变暗） */
  shade: number;
}

/**
 * @param angleRad 绕竖直轴转角（弧度）
 * @param lightAngleRad 光源方位角（相对正前方）
 */
export function projectBlade(angleRad: number, lightAngleRad: number): Projected {
  const scaleX = Math.cos(angleRad);
  const facing = scaleX >= 0 ? 1 : -1;
  // 高光：光与法线（随转角旋转）夹角越小越居中
  const rel = lightAngleRad - angleRad;
  const highlight = Math.max(-1, Math.min(1, Math.sin(rel)));
  const shade = 0.55 + 0.45 * Math.abs(Math.cos(rel));
  return { scaleX, shiftX: 0, facing, highlight, shade };
}

/** 组装一把剑的全部静态路径（调试 / 一次性渲染用）。 */
export function buildSwordPaths(sword: ForgedSword) {
  const g = sword.geometry;
  const [edgeL, edgeR] = edgeLinePaths(g);
  return {
    blade: bladeOutlinePath(g),
    spine: spinePath(g),
    grains: grainLinePaths(g),
    edgeL,
    edgeR,
    guard: guardPath(g.guardForm),
    grip: gripArt(g.gripForm),
    cracks: crackMarks(g),
  };
}
