import { useEffect, useMemo, useRef, useState } from 'react';
import { SkipForward } from 'lucide-react';
import { MATERIAL_ORDER, QUENCH_ORDER, type ForgeParams } from '@/lib/forge/options';
import { createRng, hashSeed } from '@/lib/forge/rng';

/**
 * 七段铸造动画：选料、熔炼、锻打、折叠、淬火、开刃、出炉。
 * 动画纯属表演，绝不参与数值计算——剑在动画开始前已由纯函数铸成，
 * 跳过与播完得到的是同一把剑。
 * 粒子与绘制只经 requestAnimationFrame 写 canvas/ref，不逐帧 setState；
 * 卸载停帧；遵循系统减少动态效果偏好（直接静态呈现并立即完成）。
 */

const W = 640;
const H = 400;

const STAGES = [
  { id: 'select', name: '选料', verse: '良材可遇不可求', dur: 1.3 },
  { id: 'melt', name: '熔炼', verse: '烈火熔金化铁流', dur: 1.9 },
  { id: 'hammer', name: '锻打', verse: '千锤百炼出精钢', dur: 1.9 },
  { id: 'fold', name: '折叠', verse: '反复折叠积层云', dur: 1.7 },
  { id: 'quench', name: '淬火', verse: '寒泉一淬锋芒现', dur: 1.9 },
  { id: 'edge', name: '开刃', verse: '砥石磨得霜刃开', dur: 1.5 },
  { id: 'reveal', name: '出炉', verse: '宝剑出炉光寒射', dur: 1.7 },
] as const;

const INK = '#2d3a4a';
const CINNABAR = '#c41e3a';
const GOLD = '#d4af37';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  grav: number;
  drag: number;
  grow: number;
}

export default function ForgeAnimation({
  params,
  onComplete,
}: {
  params: ForgeParams;
  onComplete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const stageIdxRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef(0);
  const doneRef = useRef(false);
  const skipRef = useRef<() => void>(() => {});
  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (reduced) {
      // 减少动态效果：不播动画，直接完成
      const id = window.setTimeout(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          onCompleteRef.current();
        }
      }, 50);
      return () => window.clearTimeout(id);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // 动画用随机流也由种子驱动（仅视觉，不参与铸剑数值）
    const rng = createRng(hashSeed(`${params.seed}｜anim`));
    const particles = particlesRef.current;
    particles.length = 0;
    const materialIdx = MATERIAL_ORDER.indexOf(params.material);
    const quench = QUENCH_ORDER.indexOf(params.quench);
    const steamColors = ['168,200,224', '190,170,130', '200,90,80', '220,224,214'];
    const steam = steamColors[quench] ?? steamColors[0];

    const spawn = (p: Partial<Particle>) => {
      if (particles.length > 420) return;
      particles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: GOLD,
        grav: 0,
        drag: 0,
        grow: 0,
        ...p,
      });
    };

    const ink = (alpha: number) => {
      ctx.fillStyle = INK;
      ctx.globalAlpha = alpha;
    };

    const drawStage = (idx: number, t: number) => {
      const ease = (x: number) => x * x * (3 - 2 * x);
      switch (STAGES[idx].id) {
        case 'select': {
          // 四块矿石，中选者泛起金光
          for (let i = 0; i < 4; i++) {
            const ox = 140 + i * 120;
            const oy = 320;
            ink(i === materialIdx ? 0.85 : 0.35);
            ctx.beginPath();
            for (let k = 0; k < 7; k++) {
              const a = (k / 7) * Math.PI * 2;
              const r = 26 + 8 * Math.sin(i * 7 + k * 2.3);
              const px = ox + Math.cos(a) * r;
              const py = oy + Math.sin(a) * r * 0.7;
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            if (i === materialIdx) {
              ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 9);
              ctx.strokeStyle = GOLD;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(ox, oy, 40 + 5 * Math.sin(t * 9), 0, Math.PI * 2);
              ctx.stroke();
              if (rng.next() < 0.3) {
                spawn({
                  x: ox + rng.range(-24, 24),
                  y: oy - 10,
                  vy: rng.range(-30, -12),
                  vx: rng.range(-6, 6),
                  maxLife: rng.range(0.6, 1.1),
                  size: rng.range(1, 2.4),
                  color: GOLD,
                });
              }
            }
          }
          break;
        }
        case 'melt': {
          // 炉膛与火光
          ink(0.8);
          ctx.beginPath();
          ctx.moveTo(240, 360);
          ctx.lineTo(240, 220);
          ctx.quadraticCurveTo(320, 150, 400, 220);
          ctx.lineTo(400, 360);
          ctx.closePath();
          ctx.fill();
          const pulse = 0.75 + 0.25 * Math.sin(t * 14);
          const grad = ctx.createRadialGradient(320, 300, 6, 320, 300, 60);
          grad.addColorStop(0, `rgba(255,214,120,${0.95 * pulse})`);
          grad.addColorStop(0.5, `rgba(230,120,50,${0.7 * pulse})`);
          grad.addColorStop(1, 'rgba(120,40,20,0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(320, 300, 60, 0, Math.PI * 2);
          ctx.fill();
          ink(0.9);
          ctx.beginPath();
          ctx.arc(320, 300, 34, 0, Math.PI, false);
          ctx.fill();
          for (let i = 0; i < 3; i++) {
            if (rng.next() < 0.75) {
              spawn({
                x: 320 + rng.range(-26, 26),
                y: 292,
                vy: rng.range(-70, -30),
                vx: rng.range(-10, 10),
                maxLife: rng.range(0.7, 1.4),
                size: rng.range(1.2, 3),
                color: rng.chance(0.6) ? '#e8862e' : '#f5c04e',
                drag: 0.6,
              });
            }
          }
          break;
        }
        case 'hammer': {
          // 砧上锻打，锤落星火四溅
          ink(0.85);
          ctx.beginPath();
          ctx.moveTo(250, 360);
          ctx.lineTo(270, 320);
          ctx.lineTo(370, 320);
          ctx.lineTo(390, 360);
          ctx.closePath();
          ctx.fill();
          const glowT = 0.6 + 0.4 * Math.sin(t * 6);
          ctx.fillStyle = `rgba(232,134,46,${glowT})`;
          ctx.fillRect(282, 306, 76, 14);
          const strikes = 3;
          const phase = (t * strikes) % 1;
          const hammerY = 190 + 116 * Math.abs(Math.sin(phase * Math.PI));
          const hit = phase > 0.94 || phase < 0.06;
          ctx.save();
          ctx.translate(320, hammerY);
          ctx.rotate(-0.5 + 0.5 * Math.abs(Math.sin(phase * Math.PI)));
          ink(0.9);
          ctx.fillRect(-8, -70, 10, 70);
          ctx.fillRect(-26, -16, 52, 26);
          ctx.restore();
          if (hit && rng.next() < 0.9) {
            for (let i = 0; i < 12; i++) {
              const a = rng.range(-Math.PI, 0);
              const sp = rng.range(60, 200);
              spawn({
                x: 320 + rng.range(-30, 30),
                y: 306,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp * 0.8,
                grav: 340,
                maxLife: rng.range(0.3, 0.8),
                size: rng.range(1, 2.6),
                color: rng.chance(0.5) ? '#f5c04e' : '#e8862e',
              });
            }
          }
          break;
        }
        case 'fold': {
          // 钢坯层层折叠
          const layers = Math.min(16, Math.pow(2, params.folds));
          const squash = ease(Math.min(1, t * 1.2));
          const lh = 14 - 9 * squash;
          const lw = 120 + 60 * squash;
          for (let i = 0; i < layers; i++) {
            const y = 320 - i * (lh + 1.5);
            const wob = Math.sin(i * 1.7 + t * 4) * 3;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(232,134,46,0.85)' : 'rgba(196,80,40,0.85)';
            ctx.globalAlpha = 0.9;
            ctx.fillRect(320 - lw / 2 + wob, y - lh, lw, lh);
          }
          ink(0.5);
          ctx.font = '16px "Noto Serif SC", serif';
          ctx.textAlign = 'center';
          ctx.fillText(`凡 ${Math.pow(2, params.folds)} 层`, 320, 360);
          if (rng.next() < 0.25) {
            spawn({
              x: 320 + rng.range(-70, 70),
              y: 300,
              vy: rng.range(-40, -16),
              vx: rng.range(-8, 8),
              maxLife: rng.range(0.4, 0.9),
              size: rng.range(1, 2.2),
              color: '#f5c04e',
            });
          }
          break;
        }
        case 'quench': {
          // 剑入淬火槽，蒸汽升腾
          ink(0.85);
          ctx.fillRect(220, 300, 200, 70);
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = '#7a8a99';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let x = 224; x <= 416; x += 8) {
            const y = 302 + Math.sin(x * 0.12 + t * 10) * 2.5;
            if (x === 224) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          const bladeY = 120 + 150 * ease(Math.min(1, t * 1.3));
          ctx.globalAlpha = 1;
          const hot = Math.max(0, 1 - t * 1.2);
          ctx.fillStyle = `rgba(${232 - 100 * (1 - hot)},${134 - 60 * (1 - hot)},${46 + 60 * (1 - hot)},1)`;
          ctx.beginPath();
          ctx.moveTo(314, bladeY - 90);
          ctx.lineTo(320, bladeY - 108);
          ctx.lineTo(326, bladeY - 90);
          ctx.lineTo(326, bladeY + 40);
          ctx.lineTo(314, bladeY + 40);
          ctx.closePath();
          ctx.fill();
          if (bladeY + 40 > 300) {
            for (let i = 0; i < 4; i++) {
              if (rng.next() < 0.8) {
                spawn({
                  x: 320 + rng.range(-40, 40),
                  y: 300,
                  vy: rng.range(-50, -22),
                  vx: rng.range(-14, 14),
                  maxLife: rng.range(0.8, 1.6),
                  size: rng.range(3, 7),
                  color: `rgba(${steam},0.55)`,
                  grow: 6,
                  drag: 0.4,
                });
              }
            }
          }
          break;
        }
        case 'edge': {
          // 砥石开刃，火星拖尾
          ink(0.7);
          ctx.beginPath();
          ctx.moveTo(140, 250);
          ctx.lineTo(430, 244);
          ctx.lineTo(430, 252);
          ctx.lineTo(140, 262);
          ctx.closePath();
          ctx.fill();
          const cx = 460;
          const cy = 268;
          ink(0.85);
          ctx.beginPath();
          ctx.arc(cx, cy, 44, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(245,240,230,0.5)';
          ctx.lineWidth = 2;
          for (let k = 0; k < 5; k++) {
            const a = t * 14 + (k * Math.PI * 2) / 5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
            ctx.stroke();
          }
          for (let i = 0; i < 3; i++) {
            if (rng.next() < 0.85) {
              spawn({
                x: 430,
                y: 250,
                vx: rng.range(-160, -60),
                vy: rng.range(-60, 10),
                grav: 260,
                maxLife: rng.range(0.3, 0.7),
                size: rng.range(0.8, 2),
                color: '#f5c04e',
              });
            }
          }
          break;
        }
        case 'reveal': {
          // 出炉：剑影立于炉光之中
          const glowA = Math.min(1, t * 1.6) * (1 - 0.4 * ease(Math.max(0, t - 0.6) / 0.4));
          const grad = ctx.createRadialGradient(320, 210, 10, 320, 210, 170);
          grad.addColorStop(0, `rgba(245,192,78,${0.5 * glowA})`);
          grad.addColorStop(1, 'rgba(245,192,78,0)');
          ctx.fillStyle = grad;
          ctx.globalAlpha = 1;
          ctx.fillRect(150, 40, 340, 340);
          ink(0.92);
          ctx.beginPath();
          ctx.moveTo(313, 90);
          ctx.lineTo(320, 66);
          ctx.lineTo(327, 90);
          ctx.lineTo(327, 300);
          ctx.lineTo(313, 300);
          ctx.closePath();
          ctx.fill();
          ctx.fillRect(296, 300, 48, 10);
          ctx.fillRect(314, 310, 12, 56);
          ctx.beginPath();
          ctx.arc(320, 372, 9, 0, Math.PI * 2);
          ctx.fill();
          if (rng.next() < 0.5) {
            spawn({
              x: 320 + rng.range(-90, 90),
              y: rng.range(80, 200),
              vy: rng.range(8, 26),
              vx: rng.range(-8, 8),
              maxLife: rng.range(1, 2),
              size: rng.range(1, 2.4),
              color: CINNABAR,
            });
          }
          break;
        }
      }
    };

    const total = STAGES.reduce((s, x) => s + x.dur, 0);
    const start = performance.now();
    let last = start;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      cancelAnimationFrame(rafRef.current);
      onCompleteRef.current();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - start) / 1000;
      if (elapsed >= total) {
        finish();
        return;
      }
      let acc = 0;
      let idx = 0;
      for (; idx < STAGES.length; idx++) {
        if (elapsed < acc + STAGES[idx].dur) break;
        acc += STAGES[idx].dur;
      }
      if (idx !== stageIdxRef.current) {
        stageIdxRef.current = idx;
        setStageIndex(idx);
      }
      const t = (elapsed - acc) / STAGES[idx].dur;

      ctx.clearRect(0, 0, W, H);
      drawStage(idx, t);

      // 粒子更新与绘制（全部在 rAF 内写 canvas）
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += p.grav * dt;
        if (p.drag) {
          p.vx *= 1 - p.drag * dt;
          p.vy *= 1 - p.drag * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const k = 1 - p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size + p.grow * (1 - k)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    skipRef.current = finish;
    return () => cancelAnimationFrame(rafRef.current);
  }, [params, reduced]);

  if (reduced) {
    // 减少动态效果：静态呈现七段工序
    return (
      <div className="ink-card p-8">
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAGES.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 font-song text-ink-700">
              <span className="font-brush text-xl text-cinnabar-600">{i + 1}</span>
              {s.name}
            </li>
          ))}
          <li className="flex items-center gap-2 font-song text-gold-600">剑已成</li>
        </ol>
      </div>
    );
  }

  return (
    <div className="ink-card relative overflow-hidden">
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
      <div className="absolute top-4 left-5 pointer-events-none">
        <div
          key={stageIndex}
          className="animate-fade-in-up"
          style={{ animationFillMode: 'forwards' }}
        >
          <div className="font-brush text-4xl text-ink-900 text-shadow-ink">
            {STAGES[stageIndex].name}
          </div>
          <div className="font-song text-sm text-ink-600 mt-1">{STAGES[stageIndex].verse}</div>
        </div>
      </div>
      <button
        onClick={() => skipRef.current()}
        className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink-100/90 border border-ink-200 font-song text-sm text-ink-700 hover:text-cinnabar-600 hover:border-cinnabar-300 transition-colors"
      >
        <SkipForward className="w-4 h-4" />
        跳过
      </button>
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
        {STAGES.map((s, i) => (
          <span
            key={s.id}
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              i < stageIndex ? 'bg-cinnabar-600' : i === stageIndex ? 'bg-gold-500' : 'bg-ink-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
