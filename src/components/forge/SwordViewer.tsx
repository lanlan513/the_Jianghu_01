import { useEffect, useMemo, useRef } from 'react';
import type { Part, SwordModel, Vec3 } from '@/lib/forge/geometry';
import type { EdgeGlow } from '@/lib/forge/rules';

/**
 * 伪三维赏剑：手写旋转投影与简单光照，不引入任何图形/三维库。
 * 每帧只通过 requestAnimationFrame 写 ref（setAttribute），绝不 setState；
 * 卸载即停帧；遵循系统减少动态效果偏好（静态渲染 + 拖拽时按需重绘）。
 */

interface FaceDef {
  verts: number[];
  part: Part;
  /** 用于判定法线朝向的内侧参考点（局部坐标） */
  inner: Vec3;
}

interface RenderData {
  verts: Vec3[];
  faces: FaceDef[];
  order: number[];
  depth: number[];
}

const VIEW = 640;
const HALF = VIEW / 2;
const PERSP = 1150;
const SCALE = 1.22;

function buildRenderData(model: SwordModel): RenderData {
  const verts: Vec3[] = [];
  const faces: FaceDef[] = [];
  for (const part of model.parts) {
    const base = verts.length;
    for (const ring of part.rings) {
      for (const p of ring.pts) verts.push(p);
    }
    const n = part.rings[0].pts.length;
    const idx = (r: number, j: number) => base + r * n + ((j % n) + n) % n;
    for (let r = 0; r < part.rings.length - 1; r++) {
      const yMid = (part.rings[r].y + part.rings[r + 1].y) / 2;
      for (let j = 0; j < n; j++) {
        faces.push({
          verts: [idx(r, j), idx(r, j + 1), idx(r + 1, j + 1), idx(r + 1, j)],
          part,
          inner: { x: 0, y: yMid, z: 0 },
        });
      }
    }
    const cap = (ringIdx: number, flip: boolean) => {
      const ring = part.rings[ringIdx];
      const cx = ring.pts.reduce((s, p) => s + p.x, 0) / n;
      const cz = ring.pts.reduce((s, p) => s + p.z, 0) / n;
      const ci = verts.length;
      verts.push({ x: cx, y: ring.y, z: cz });
      for (let j = 0; j < n; j++) {
        const a = idx(ringIdx, j);
        const b = idx(ringIdx, j + 1);
        faces.push({
          verts: flip ? [ci, b, a] : [ci, a, b],
          part,
          inner: { x: cx, y: ring.y + (flip ? 1 : -1), z: cz },
        });
      }
    };
    if (part.capStart) cap(0, true);
    if (part.capEnd) cap(part.rings.length - 1, false);
  }
  return {
    verts,
    faces,
    order: Array.from({ length: faces.length }, (_, i) => i),
    depth: new Array(faces.length).fill(0),
  };
}

interface ViewerState {
  rx: number;
  ry: number;
  tx: number;
  ty: number;
  baseRy: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
  idle: number;
  light: { x: number; y: number };
}

export default function SwordViewer({
  model,
  glow,
}: {
  model: SwordModel;
  glow: EdgeGlow;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const faceEls = useRef<(SVGPathElement | null)[]>([]);
  const decoEls = useRef<(SVGPathElement | null)[]>([]);
  const edgeL = useRef<SVGPathElement | null>(null);
  const edgeR = useRef<SVGPathElement | null>(null);
  const edgeGlowL = useRef<SVGPathElement | null>(null);
  const edgeGlowR = useRef<SVGPathElement | null>(null);
  const breakRef = useRef<SVGPathElement | null>(null);
  const sheenRef = useRef<SVGPathElement | null>(null);

  const data = useMemo(() => buildRenderData(model), [model]);
  const stateRef = useRef<ViewerState>({
    rx: -0.14,
    ry: 0.55,
    tx: -0.14,
    ty: 0.55,
    baseRy: 0.55,
    dragging: false,
    lastX: 0,
    lastY: 0,
    idle: 0,
    light: { x: 0.45, y: 0.35 },
  });
  const frameFnRef = useRef<() => void>(() => {});
  const reducedRef = useRef(false);
  // 每帧复用的变换缓存，避免重复分配
  const bufRef = useRef<{ px: Float64Array; py: Float64Array; pz: Float64Array } | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reducedRef.current = reduced;
    const s = stateRef.current;
    const { verts, faces, order, depth } = data;
    const n = verts.length;
    if (!bufRef.current || bufRef.current.px.length < n) {
      bufRef.current = { px: new Float64Array(n), py: new Float64Array(n), pz: new Float64Array(n) };
    }
    const { px, py, pz } = bufRef.current;

    const projectPoint = (v: Vec3, cy: number, sy: number, cx: number, sx: number, out: Vec3) => {
      const y0 = v.y - model.centerY;
      const x1 = v.x * cy + v.z * sy;
      const z1 = -v.x * sy + v.z * cy;
      const y1 = y0 * cx - z1 * sx;
      const z2 = y0 * sx + z1 * cx;
      out.x = x1;
      out.y = y1;
      out.z = z2;
    };

    const tmpA: Vec3 = { x: 0, y: 0, z: 0 };
    const tmpB: Vec3 = { x: 0, y: 0, z: 0 };
    const tmpC: Vec3 = { x: 0, y: 0, z: 0 };

    const renderFrame = () => {
      const cy = Math.cos(s.ry);
      const sy = Math.sin(s.ry);
      const cx = Math.cos(s.rx);
      const sx = Math.sin(s.rx);
      for (let i = 0; i < n; i++) {
        const v = verts[i];
        const y0 = v.y - model.centerY;
        const x1 = v.x * cy + v.z * sy;
        const z1 = -v.x * sy + v.z * cy;
        px[i] = x1;
        py[i] = y0 * cx - z1 * sx;
        pz[i] = y0 * sx + z1 * cx;
      }
      // 光源（视线坐标系，+z 朝观察者）
      const lx = s.light.x * 480;
      const ly = s.light.y * 480;
      const lz = 640;

      // 画家算法：按深度排序后写入固定次序的 path 元素
      for (let f = 0; f < faces.length; f++) {
        const fv = faces[f].verts;
        let z = 0;
        for (let k = 0; k < fv.length; k++) z += pz[fv[k]];
        depth[f] = z / fv.length;
      }
      order.sort((a, b) => depth[a] - depth[b]);

      for (let k = 0; k < order.length; k++) {
        const el = faceEls.current[k];
        if (!el) continue;
        const face = faces[order[k]];
        const fv = face.verts;
        let d = '';
        let fcx = 0;
        let fcy = 0;
        let fcz = 0;
        for (let j = 0; j < fv.length; j++) {
          const vi = fv[j];
          const sc = (PERSP / (PERSP - pz[vi])) * SCALE;
          const X = px[vi] * sc;
          const Y = -py[vi] * sc;
          d += j === 0 ? `M${X.toFixed(1)} ${Y.toFixed(1)}` : `L${X.toFixed(1)} ${Y.toFixed(1)}`;
          fcx += px[vi];
          fcy += py[vi];
          fcz += pz[vi];
        }
        d += 'Z';
        fcx /= fv.length;
        fcy /= fv.length;
        fcz /= fv.length;
        // Newell 法线
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (let j = 0; j < fv.length; j++) {
          const a = fv[j];
          const b = fv[(j + 1) % fv.length];
          nx += (py[a] - py[b]) * (pz[a] + pz[b]);
          ny += (pz[a] - pz[b]) * (px[a] + px[b]);
          nz += (px[a] - px[b]) * (py[a] + py[b]);
        }
        // 法线朝外
        projectPoint(face.inner, cy, sy, cx, sx, tmpA);
        const ox = fcx - tmpA.x;
        const oy = fcy - tmpA.y;
        const oz = fcz - tmpA.z;
        if (nx * ox + ny * oy + nz * oz < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        // 光照：环境光 + 漫反射 + 金属镜面高光
        let Lx = lx - fcx;
        let Ly = ly - fcy;
        let Lz = lz - fcz;
        const Ll = Math.hypot(Lx, Ly, Lz) || 1;
        Lx /= Ll;
        Ly /= Ll;
        Lz /= Ll;
        const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
        let Hx = Lx;
        let Hy = Ly;
        let Hz = Lz + 1;
        const Hl = Math.hypot(Hx, Hy, Hz) || 1;
        Hx /= Hl;
        Hy /= Hl;
        Hz /= Hl;
        const ndh = Math.max(0, nx * Hx + ny * Hy + nz * Hz);
        const spec = Math.pow(ndh, 26) * face.part.metallic;
        const bright = 0.34 + 0.66 * diff;
        const col = face.part.color;
        const r = Math.min(255, col[0] * bright + 240 * spec);
        const g = Math.min(255, col[1] * bright + 240 * spec);
        const b = Math.min(255, col[2] * bright + 240 * spec);
        el.setAttribute('d', d);
        el.setAttribute('fill', `rgb(${r | 0},${g | 0},${b | 0})`);
      }

      // 剑身法线（近似），决定装饰线可见性
      projectPoint({ x: 0, y: model.centerY, z: 1 }, cy, sy, cx, sx, tmpA);
      projectPoint({ x: 0, y: model.centerY, z: 0 }, cy, sy, cx, sx, tmpB);
      const bnx = tmpA.x - tmpB.x;
      const bny = tmpA.y - tmpB.y;
      const bnz = tmpA.z - tmpB.z;
      const bl = Math.hypot(bnx, bny, bnz) || 1;
      const fnz = bnz / bl;

      const drawPolyline = (pts: Vec3[]): string => {
        let d = '';
        for (let i = 0; i < pts.length; i++) {
          projectPoint(pts[i], cy, sy, cx, sx, tmpC);
          const sc = (PERSP / (PERSP - tmpC.z)) * SCALE;
          d += (i === 0 ? 'M' : 'L') + `${(tmpC.x * sc).toFixed(1)} ${(-tmpC.y * sc).toFixed(1)}`;
        }
        return d;
      };

      for (let i = 0; i < model.decos.length; i++) {
        const el = decoEls.current[i];
        if (!el) continue;
        const deco = model.decos[i];
        const vis = Math.min(1, Math.max(0, (deco.side * fnz - 0.02) / 0.3));
        el.setAttribute('d', drawPolyline(deco.pts));
        el.setAttribute('opacity', vis.toFixed(2));
      }

      // 高光棱线：位置随光位移动
      const sheen = sheenRef.current;
      if (sheen) {
        const f = Math.min(0.85, Math.max(0.15, 0.5 + s.light.x * 0.35));
        const pts: Vec3[] = model.stations.map((st) => ({
          x: st.cx + f * st.w,
          y: st.y,
          z: st.t * (1 - f) + 0.9,
        }));
        const Hdot = Math.max(0, fnz);
        sheen.setAttribute('d', drawPolyline(pts));
        sheen.setAttribute('opacity', (Math.pow(Hdot, 2) * 0.85).toFixed(2));
      }

      // 刃线辉光
      const flicker = model.broken && !reduced ? 0.72 + 0.28 * Math.sin(s.idle * 9) : 1;
      const glowOpacity = glow.intensity * flicker;
      if (edgeL.current) edgeL.current.setAttribute('d', drawPolyline(model.edges.left));
      if (edgeR.current) edgeR.current.setAttribute('d', drawPolyline(model.edges.right));
      if (edgeGlowL.current) {
        edgeGlowL.current.setAttribute('d', drawPolyline(model.edges.left));
        edgeGlowL.current.setAttribute('opacity', (0.6 * glowOpacity).toFixed(2));
      }
      if (edgeGlowR.current) {
        edgeGlowR.current.setAttribute('d', drawPolyline(model.edges.right));
        edgeGlowR.current.setAttribute('opacity', (0.6 * glowOpacity).toFixed(2));
      }
      if (edgeL.current) edgeL.current.setAttribute('opacity', (0.35 + 0.65 * glowOpacity).toFixed(2));
      if (edgeR.current) edgeR.current.setAttribute('opacity', (0.35 + 0.65 * glowOpacity).toFixed(2));
      if (breakRef.current && model.breakLine) {
        breakRef.current.setAttribute('d', drawPolyline(model.breakLine));
      }
    };

    frameFnRef.current = renderFrame;

    if (reduced) {
      // 减少动态效果：只渲染静态一帧，拖拽时按需重绘
      renderFrame();
      return;
    }

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.idle += dt;
      if (!s.dragging) {
        s.ty = s.baseRy + Math.sin(s.idle * 0.55) * 0.32;
        s.light.x = Math.cos(s.idle * 0.4) * 0.65;
        s.light.y = 0.25 + Math.sin(s.idle * 0.3) * 0.35;
      }
      const k = Math.min(1, dt * 7);
      s.ry += (s.ty - s.ry) * k;
      s.rx += (s.tx - s.rx) * k;
      renderFrame();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, model, glow]);

  const onPointerDown = (e: React.PointerEvent) => {
    const s = stateRef.current;
    s.dragging = true;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const s = stateRef.current;
    const rect = svg.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ly = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    s.light.x = Math.max(-1, Math.min(1, lx));
    s.light.y = Math.max(-1, Math.min(1, ly));
    if (s.dragging) {
      s.ty += (e.clientX - s.lastX) * 0.012;
      s.tx = Math.max(-0.55, Math.min(0.55, s.tx + (e.clientY - s.lastY) * 0.008));
      s.lastX = e.clientX;
      s.lastY = e.clientY;
    }
    if (reducedRef.current) frameFnRef.current();
  };
  const onPointerUp = () => {
    const s = stateRef.current;
    s.dragging = false;
    s.baseRy = s.ty;
  };

  const decoStyle = (kind: string) =>
    kind === 'layer'
      ? { stroke: 'rgba(30,40,52,0.55)', strokeWidth: 0.7 }
      : kind === 'grain'
        ? { stroke: 'rgba(244,246,250,0.8)', strokeWidth: 0.9 }
        : { stroke: 'rgba(24,18,16,0.9)', strokeWidth: 1.1 };

  return (
    <svg
      ref={svgRef}
      viewBox={`${-HALF} ${-HALF} ${VIEW} ${VIEW}`}
      className="w-full h-full select-none cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      role="img"
      aria-label="铸成之剑，可拖拽旋转"
    >
      <defs>
        <filter id="forge-edge-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <radialGradient id="forge-backdrop" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="rgba(212,175,55,0.10)" />
          <stop offset="60%" stopColor="rgba(45,58,74,0.05)" />
          <stop offset="100%" stopColor="rgba(45,58,74,0)" />
        </radialGradient>
      </defs>
      <circle cx="0" cy="0" r="270" fill="url(#forge-backdrop)" />
      <ellipse cx="0" cy="252" rx="150" ry="16" fill="rgba(26,26,26,0.10)" />
      <g stroke="rgba(26,26,26,0.35)" strokeWidth="0.5" strokeLinejoin="round">
        {data.faces.map((_, i) => (
          <path
            key={i}
            ref={(el) => {
              faceEls.current[i] = el;
            }}
          />
        ))}
      </g>
      <g fill="none" strokeLinecap="round">
        {model.decos.map((d, i) => (
          <path
            key={i}
            ref={(el) => {
              decoEls.current[i] = el;
            }}
            {...decoStyle(d.kind)}
          />
        ))}
      </g>
      <path
        ref={sheenRef}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <g fill="none" strokeLinecap="round">
        <path ref={edgeGlowL} filter="url(#forge-edge-blur)" stroke={glow.color} strokeWidth="5" />
        <path ref={edgeGlowR} filter="url(#forge-edge-blur)" stroke={glow.color} strokeWidth="5" />
        <path ref={edgeL} stroke={glow.color} strokeWidth="1.6" />
        <path ref={edgeR} stroke={glow.color} strokeWidth="1.6" />
        {model.breakLine && (
          <path ref={breakRef} stroke="rgba(24,18,16,0.9)" strokeWidth="1.4" />
        )}
      </g>
    </svg>
  );
}
