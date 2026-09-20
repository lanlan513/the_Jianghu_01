import { useEffect, useMemo, useRef, useState } from 'react';
import type { ForgedSword } from '@/lib/forge/types';
import {
  MATERIALS,
  HEAT_LABELS,
  FOLD_COUNTS,
  QUENCHES,
} from '@/lib/forge/generate';
import { bladeOutlinePath, grainLinePaths, edgeLinePaths, guardPath, gripArt } from '@/lib/forge/svgGeometry';

/**
 * 七段铸造动画：选料 → 熔炼 → 锻打 → 折叠 → 淬火 → 开刃 → 出炉。
 *
 * 铁律：
 *  1. 动画只消费早已由纯函数算好的 ForgedSword，绝不回写任何数值；
 *  2. 每帧粒子 / 进度写入 SVG DOM（ref），不触发 React 重渲染；
 *  3. 可跳过、可重播；跳过与播完，父组件拿到的是同一把剑；
 *  4. 尊重 prefers-reduced-motion：开启时各段近乎瞬切。
 *
 * 粒子的随机散布不用 Math.random，而用「时间 + 粒子序号」的确定性
 * 哈希函数在帧间生成（动画本就不参与数值，这里只是视觉抖动）。
 */

interface Props {
  sword: ForgedSword;
  reducedMotion: boolean;
  onDone: () => void;
}

interface StageDef {
  key: string;
  label: string;
  duration: number;
}

const STAGES: StageDef[] = [
  { key: 'select', label: '选料', duration: 900 },
  { key: 'melt', label: '熔炼', duration: 1500 },
  { key: 'forge', label: '锻打', duration: 1600 },
  { key: 'fold', label: '折叠', duration: 1500 },
  { key: 'quench', label: '淬火', duration: 1400 },
  { key: 'edge', label: '开刃', duration: 1200 },
  { key: 'finish', label: '出炉', duration: 1000 },
];

interface Particle {
  el: SVGElement;
  vx: number;
  vy: number;
  life: number;
  max: number;
  baseOpacity: number;
  grow: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 确定性伪随机（仅用于粒子视觉，与铸剑数值完全隔离）。 */
function visualRand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function ForgeAnimation({ sword, reducedMotion, onDone }: Props) {
  const [stageIdx, setStageIdx] = useState(0);

  const bladeRef = useRef<SVGPathElement | null>(null);
  const glowRef = useRef<SVGPathElement | null>(null);
  const grainsRef = useRef<SVGGElement | null>(null);
  const edgesRef = useRef<SVGGElement | null>(null);
  const guardRef = useRef<SVGPathElement | null>(null);
  const gripWrapRef = useRef<SVGGElement | null>(null);
  const crackRef = useRef<SVGGElement | null>(null);
  const fxRef = useRef<SVGGElement | null>(null);
  const glyphTextRef = useRef<SVGTextElement | null>(null);
  const glyphMarkRef = useRef<SVGPathElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const skipBtnRef = useRef<HTMLButtonElement | null>(null);

  const rafRef = useRef(0);
  const aliveRef = useRef(true);
  const particlesRef = useRef<Particle[]>([]);
  const stageStartRef = useRef(0);
  const stageIdxRef = useRef(0);
  const lastTsRef = useRef(0);
  const emitAccRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const p = sword.params;
  const material = MATERIALS[p.material];
  const quench = QUENCHES[p.quench];
  const g = sword.geometry;

  const paths = useMemo(
    () => ({
      outline: bladeOutlinePath(g),
      grains: grainLinePaths(g),
      edgeL: edgeLinePaths(g)[0],
      edgeR: edgeLinePaths(g)[1],
      guard: guardPath(g.guardForm),
      grip: gripArt(g.gripForm),
    }),
    [g],
  );

  const grainColor = material.id === 'wujin' ? '#7c5a1c' : '#2d3a4a';
  const totalLen = 460;

  /* ----------------------------- 粒子 -------------------------------- */

  const clearParticles = () => {
    particlesRef.current.forEach((pt) => pt.el.remove());
    particlesRef.current = [];
  };

  const spawnParticle = (kind: 'spark' | 'steam' | 'shave' | 'glow') => {
    const layer = fxRef.current;
    if (!layer) return;
    const n = particlesRef.current.length + 1;
    const tickSeed = performance.now();
    const r1 = visualRand(n * 3.7 + tickSeed * 0.0001);
    const r2 = visualRand(n * 9.1 + tickSeed * 0.0002 + 7);

    const el = document.createElementNS(SVG_NS, 'circle');
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let radius = 2;
    let fill = '#d4af37';
    let max = 700;
    let opacity = 0.9;
    let grow = 0;

    if (kind === 'spark') {
      x = (r1 - 0.5) * 80;
      y = -60 - r2 * 200;
      vx = (r1 - 0.5) * 0.08;
      vy = -0.1 - r2 * 0.14;
      radius = 1 + r1 * 2.2;
      fill = p.heat >= 4 ? '#f06c78' : '#e2c056';
      max = 500 + r2 * 400;
    } else if (kind === 'steam') {
      x = (r1 - 0.5) * 70;
      y = 8 + r2 * 26;
      vx = (r1 - 0.5) * 0.04;
      vy = -0.05 - r2 * 0.08;
      radius = 6 + r1 * 12;
      fill = '#f5f0e6';
      opacity = 0.45;
      max = 800 + r2 * 500;
      grow = 0.02;
    } else if (kind === 'shave') {
      x = (r1 > 0.5 ? 1 : -1) * (8 + r2 * 10);
      y = -40 - r1 * 260;
      vx = (r1 - 0.5) * 0.22;
      vy = 0.05 + r2 * 0.08;
      radius = 0.8 + r1 * 1.2;
      fill = '#c9c0ae';
      max = 460;
    } else {
      x = (r1 - 0.5) * 34;
      y = -100 - r2 * 240;
      vx = 0;
      vy = -0.04;
      radius = 3 + r1 * 4;
      fill = g.glow.color;
      opacity = 0.8;
      max = 620;
    }

    el.setAttribute('cx', String(x));
    el.setAttribute('cy', String(y));
    el.setAttribute('r', String(radius));
    el.setAttribute('fill', fill);
    el.setAttribute('opacity', String(opacity));
    layer.appendChild(el);
    particlesRef.current.push({ el, vx, vy, life: 0, max, baseOpacity: opacity, grow });
  };

  const tickParticles = (dt: number) => {
    particlesRef.current = particlesRef.current.filter((pt) => {
      pt.life += dt;
      if (pt.life >= pt.max) {
        pt.el.remove();
        return false;
      }
      const cx = parseFloat(pt.el.getAttribute('cx') || '0') + pt.vx * dt;
      const cy = parseFloat(pt.el.getAttribute('cy') || '0') + pt.vy * dt;
      pt.el.setAttribute('cx', cx.toFixed(2));
      pt.el.setAttribute('cy', cy.toFixed(2));
      if (pt.grow) {
        const r = parseFloat(pt.el.getAttribute('r') || '2') + pt.grow * dt;
        pt.el.setAttribute('r', r.toFixed(2));
      }
      const k = 1 - pt.life / pt.max;
      pt.el.setAttribute('opacity', (pt.baseOpacity * k).toFixed(3));
      return true;
    });
  };

  /* --------------------------- 每段视觉 ------------------------------- */

  const setLayers = (cfg: {
    bladeOpacity: number;
    bladeFill?: string;
    bladeStroke?: string;
    bladeTransform?: string;
    bladeDash?: [number, number];
    grainsOpacity: number;
    grainsTransform?: string;
    edgesOpacity: number;
    edgesDash?: [number, number];
    guardOpacity: number;
    gripOpacity: number;
    glowOpacity: number;
    crackOpacity: number;
  }) => {
    bladeRef.current?.style.setProperty('opacity', String(cfg.bladeOpacity));
    if (cfg.bladeFill) bladeRef.current?.setAttribute('fill', cfg.bladeFill);
    if (cfg.bladeStroke) bladeRef.current?.setAttribute('stroke', cfg.bladeStroke);
    if (cfg.bladeTransform !== undefined)
      bladeRef.current?.setAttribute('transform', cfg.bladeTransform);
    if (cfg.bladeDash)
      bladeRef.current?.setAttribute('stroke-dasharray', `${cfg.bladeDash[0]} ${cfg.bladeDash[1]}`);

    grainsRef.current?.style.setProperty('opacity', String(cfg.grainsOpacity));
    if (cfg.grainsTransform !== undefined)
      grainsRef.current?.setAttribute('transform', cfg.grainsTransform);

    edgesRef.current?.style.setProperty('opacity', String(cfg.edgesOpacity));
    if (cfg.edgesDash)
      edgesRef.current?.setAttribute('stroke-dasharray', `${cfg.edgesDash[0]} ${cfg.edgesDash[1]}`);

    guardRef.current?.style.setProperty('opacity', String(cfg.guardOpacity));
    gripWrapRef.current?.style.setProperty('opacity', String(cfg.gripOpacity));
    glowRef.current?.style.setProperty('opacity', String(cfg.glowOpacity));
    crackRef.current?.style.setProperty('opacity', String(cfg.crackOpacity));
  };

  const applyStage = (idx: number, t: number, dt: number) => {
    tickParticles(dt);

    const heatColor =
      p.heat >= 4 ? '#e44556' : p.heat === 3 ? '#d4693a' : p.heat === 2 ? '#b8763e' : '#8a6a45';

    if (glyphTextRef.current) {
      glyphTextRef.current.textContent = ['料', '熔', '锻', '折', '淬', '刃', '成'][idx];
    }
    if (glyphMarkRef.current) {
      const w = 30 + t * 90;
      const wobble = reducedMotion ? 0 : (Math.sin(t * Math.PI * 14) * 2).toFixed(1);
      glyphMarkRef.current.setAttribute('d', `M -60 60 q ${w.toFixed(0)} ${wobble} ${(w + 40).toFixed(0)} 0`);
      glyphMarkRef.current.setAttribute('opacity', String(0.2 + t * 0.4));
    }

    switch (STAGES[idx].key) {
      case 'select':
        setLayers({
          bladeOpacity: 0,
          grainsOpacity: 0,
          edgesOpacity: 0,
          guardOpacity: 0,
          gripOpacity: 0,
          glowOpacity: 0,
          crackOpacity: 0,
        });
        break;

      case 'melt': {
        const reveal = 40 + t * 90;
        const tremor = reducedMotion ? 0 : Math.sin(t * 40) * 0.6;
        setLayers({
          bladeOpacity: 0.95,
          bladeFill: heatColor,
          bladeStroke: '#f5c66b',
          bladeTransform: `translate(${tremor.toFixed(2)} 0)`,
          bladeDash: [reveal, totalLen],
          grainsOpacity: 0,
          edgesOpacity: 0,
          guardOpacity: 0,
          gripOpacity: 0,
          glowOpacity: 0.25 + t * 0.3,
          crackOpacity: 0,
        });
        if (!reducedMotion) emitAcc(dt, 0.045, 'spark');
        break;
      }

      case 'forge': {
        const reveal = 0.25 + t * 0.75;
        setLayers({
          bladeOpacity: 1,
          bladeFill: g.bladeColor,
          bladeStroke: g.edgeColor,
          bladeTransform: `scale(1 ${reveal.toFixed(3)})`,
          bladeDash: [totalLen, 0],
          grainsOpacity: 0,
          edgesOpacity: 0,
          guardOpacity: 0,
          gripOpacity: 0,
          glowOpacity: 0.2,
          crackOpacity: 0,
        });
        if (!reducedMotion) emitAcc(dt, 0.02, 'spark');
        break;
      }

      case 'fold': {
        const showRatio = p.folds === 0 ? 0.25 : Math.min(0.7, t * 0.7);
        const sway = reducedMotion ? 0 : Math.sin(t * Math.PI * (4 + FOLD_COUNTS[p.folds] * 0.4)) * 3;
        setLayers({
          bladeOpacity: 1,
          bladeTransform: '',
          bladeDash: [totalLen, 0],
          grainsOpacity: showRatio,
          grainsTransform: `translate(${sway.toFixed(2)} 0)`,
          edgesOpacity: 0,
          guardOpacity: 0,
          gripOpacity: 0,
          glowOpacity: 0.2 + t * 0.2,
          crackOpacity: 0,
        });
        break;
      }

      case 'quench': {
        const dip = reducedMotion ? 6 : Math.sin(Math.min(1, t * 1.4) * Math.PI) * 26;
        setLayers({
          bladeOpacity: 1,
          bladeTransform: `translate(0 ${dip.toFixed(2)})`,
          bladeDash: [totalLen, 0],
          grainsOpacity: 0.5,
          grainsTransform: `translate(0 ${dip.toFixed(2)})`,
          edgesOpacity: 0,
          guardOpacity: 0.85,
          gripOpacity: 0.85,
          glowOpacity: 0.25 + t * 0.3,
          crackOpacity: 0,
        });
        if (!reducedMotion) emitAcc(dt, 0.07, 'steam');
        break;
      }

      case 'edge': {
        setLayers({
          bladeOpacity: 1,
          bladeTransform: '',
          bladeDash: [totalLen, 0],
          grainsOpacity: 0.6,
          grainsTransform: '',
          edgesOpacity: 1,
          edgesDash: [t * totalLen, totalLen],
          guardOpacity: 1,
          gripOpacity: 1,
          glowOpacity: 0.35 + t * 0.4,
          crackOpacity: g.cracks.length ? t : 0,
        });
        if (!reducedMotion) emitAcc(dt, 0.03, 'shave');
        break;
      }

      case 'finish': {
        const glowPulse = reducedMotion ? 0.7 : 0.55 + Math.sin(t * Math.PI * 3) * 0.2;
        setLayers({
          bladeOpacity: 1,
          bladeTransform: '',
          bladeDash: [totalLen, 0],
          grainsOpacity: 0.65,
          grainsTransform: '',
          edgesOpacity: 1,
          edgesDash: [totalLen, 0],
          guardOpacity: 1,
          gripOpacity: 1,
          glowOpacity: glowPulse,
          crackOpacity: g.cracks.length ? 1 : 0,
        });
        if (!reducedMotion) emitAcc(dt, 0.035, 'glow');
        break;
      }
    }

    if (progressRef.current) {
      progressRef.current.style.transform = `scaleX(${((idx + t) / STAGES.length).toFixed(4)})`;
    }
  };

  /** 粒子发射节流（按帧累积概率）。 */
  const emitAcc = (dt: number, rate: number, kind: 'spark' | 'steam' | 'shave' | 'glow') => {
    emitAccRef.current += (dt / 16.7) * rate;
    if (emitAccRef.current >= 1) {
      emitAccRef.current = 0;
      spawnParticle(kind);
    }
  };

  /* ----------------------------- 主循环 ------------------------------- */

  useEffect(() => {
    aliveRef.current = true;
    stageStartRef.current = 0;
    lastTsRef.current = 0;
    emitAccRef.current = 0;

    const durationFor = (i: number) =>
      reducedMotion ? Math.min(220, STAGES[i].duration * 0.18) : STAGES[i].duration;

    const finish = () => {
      if (!aliveRef.current) return;
      aliveRef.current = false;
      cancelAnimationFrame(rafRef.current);
      clearParticles();
      onDoneRef.current();
    };

    const tick = (now: number) => {
      if (!aliveRef.current) return;
      if (stageStartRef.current === 0) stageStartRef.current = now;
      if (lastTsRef.current === 0) lastTsRef.current = now;
      const dt = Math.min(48, now - lastTsRef.current);
      lastTsRef.current = now;

      const elapsed = now - stageStartRef.current;
      const dur = durationFor(stageIdxRef.current);
      const t = Math.min(1, elapsed / dur);
      applyStage(stageIdxRef.current, t, dt);

      if (t >= 1) {
        if (stageIdxRef.current >= STAGES.length - 1) {
          finish();
          return;
        }
        stageIdxRef.current += 1;
        stageStartRef.current = now;
        setStageIdx(stageIdxRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const skip = () => {
      if (!aliveRef.current) return;
      // 跳过：直接收尾。数值从未参与动画，剑与播完完全相同。
      finish();
    };

    const btn = skipBtnRef.current;
    btn?.addEventListener('click', skip);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      aliveRef.current = false;
      cancelAnimationFrame(rafRef.current);
      btn?.removeEventListener('click', skip);
      clearParticles();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  return (
    <div className="relative w-full max-w-md mx-auto select-none">
      <div className="flex items-center justify-between mb-3">
        <div className="font-brush text-2xl text-ink-900">
          {STAGES[stageIdx].label}
          <span className="font-song text-sm text-ink-500 ml-3">
            {stageIdx + 1} / {STAGES.length}
          </span>
        </div>
        <button
          ref={skipBtnRef}
          className="font-song text-sm px-4 py-1 border border-ink-300 text-ink-700 hover:bg-ink-200/60 transition-colors"
        >
          跳过 ▸
        </button>
      </div>

      <div className="text-[11px] font-song text-ink-500 mb-1">
        {material.name} · {HEAT_LABELS[p.heat]} · {FOLD_COUNTS[p.folds]} 折 · {quench.name}
      </div>

      <div className="relative h-px bg-ink-200 mb-4">
        <div
          ref={progressRef}
          className="absolute left-0 top-0 h-px origin-left bg-cinnabar-600"
          style={{ width: '100%', transform: 'scaleX(0)' }}
        />
      </div>

      <svg
        viewBox="-110 -420 220 560"
        className="w-full h-[420px] overflow-visible"
        role="img"
        aria-label={`铸造动画：${STAGES[stageIdx].label}`}
      >
        <ellipse cx="0" cy="120" rx="86" ry="12" fill="#2d3a4a" opacity="0.08" />

        <path
          ref={glowRef}
          d={paths.outline}
          fill="none"
          stroke={g.glow.color}
          strokeWidth={g.glow.radius}
          style={{ filter: 'blur(3px)', opacity: 0 }}
        />
        <path
          ref={bladeRef}
          d={paths.outline}
          fill={g.bladeColor}
          stroke={g.edgeColor}
          strokeWidth="1.2"
          style={{ opacity: 0, transformOrigin: '0px 0px' }}
        />

        <g ref={grainsRef} style={{ opacity: 0 }}>
          {paths.grains.map((line, i) => (
            <path
              key={i}
              d={line.d}
              fill="none"
              stroke={grainColor}
              strokeWidth={line.width}
              opacity={line.opacity}
            />
          ))}
        </g>

        <g ref={edgesRef} style={{ opacity: 0 }}>
          <path d={paths.edgeL} fill="none" stroke={g.edgeColor} strokeWidth="1.4" />
          <path d={paths.edgeR} fill="none" stroke={g.edgeColor} strokeWidth="1.4" />
        </g>

        <g ref={crackRef} style={{ opacity: 0 }}>
          {g.cracks.map((t, i) => {
            const idx = Math.round(t * (g.bladeLeft.length - 1));
            const pt = g.bladeRight[idx];
            return (
              <path
                key={i}
                d={`M ${pt.x} ${pt.y} l -5 2 l 4 3`}
                fill="none"
                stroke="#1a1a1a"
                strokeWidth="0.8"
                opacity="0.7"
              />
            );
          })}
        </g>

        <path ref={guardRef} d={paths.guard} fill="#3d3730" stroke="#1a1a1a" strokeWidth="1" style={{ opacity: 0 }} />
        <g ref={gripWrapRef} style={{ opacity: 0 }}>
          <GripSvg d={paths.grip} />
        </g>

        <g ref={fxRef} />

        <g opacity="0.9">
          <text
            ref={glyphTextRef}
            x="0"
            y="92"
            textAnchor="middle"
            className="font-brush"
            fontSize="40"
            fill="#2d3a4a"
            opacity="0.18"
          />
          <path ref={glyphMarkRef} stroke="#c41e3a" strokeWidth="2" fill="none" d="" />
        </g>
      </svg>
    </div>
  );
}

function GripSvg({ d }: { d: ReturnType<typeof gripArt> }) {
  return (
    <>
      <path d={d.grip} fill="#4a3f33" stroke="#1a1a1a" strokeWidth="1" />
      {d.wraps.map((wd, i) =>
        wd.includes('a 1.6') ? (
          <path key={i} d={wd} fill="#c9c0ae" />
        ) : wd.includes('Z') && wd.startsWith('M -3') ? (
          <path key={i} d={wd} fill="#749468" stroke="#2b3728" strokeWidth="0.5" />
        ) : (
          <path
            key={i}
            d={wd}
            fill="none"
            stroke={wd.startsWith('M -6.8') ? '#d4c9b0' : '#8b8680'}
            strokeWidth={wd.startsWith('M -6.8') ? 1.2 : 1.4}
          />
        ),
      )}
      <path d={d.pommel} fill="#3d3730" stroke="#1a1a1a" strokeWidth="1" />
    </>
  );
}
