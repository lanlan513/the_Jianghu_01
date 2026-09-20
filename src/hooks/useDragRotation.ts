import { useEffect, useRef } from 'react';
import { projectBlade, type Projected } from '@/lib/forge/svgGeometry';

/**
 * 出炉后的伪三维拖拽旋转。
 *
 * 严格约定：
 *  - 每帧旋转 / 惯性 / 粒子数据只写入 ref（DOM 属性与变换），绝不 setState；
 *  - 角度变化通过 requestAnimationFrame 直接作用到 svg group；
 *  - 卸载时取消帧、移除监听，彻底停帧。
 *
 * 旋转绕竖直轴：用水平压缩 scaleX=cos(angle) 与明暗模拟立体感；
 * 光源方位固定略偏左前，光位随指针小幅移动，高光因此游走。
 */

export interface DragRotationHandles {
  /** 绑定到可拖拽区域（剑的容器 <div>） */
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** 绑定到需要做投影变换的 <g> */
  bladeGroupRef: React.RefObject<SVGGElement | null>;
  /** 绑定到刃身高光路径/矩形（用于随光位移） */
  highlightRef: React.RefObject<SVGElement | null>;
  /** 绑定到承载整体明暗的元素（filter/opacity 均可） */
  shadeRef: React.RefObject<SVGElement | null>;
  /** 当前角度 ref（弧度） */
  angleRef: React.MutableRefObject<number>;
}

interface UseDragRotationOptions {
  /** 是否处于可交互（出炉）阶段 */
  enabled: boolean;
  reducedMotion: boolean;
  /** 无操作时自动缓转的角速度（弧度/帧）；减少动态效果时自动归零 */
  idleSpin?: number;
}

export function useDragRotation({
  enabled,
  reducedMotion,
  idleSpin = 0.004,
}: UseDragRotationOptions): DragRotationHandles {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const bladeGroupRef = useRef<SVGGElement | null>(null);
  const highlightRef = useRef<SVGElement | null>(null);
  const shadeRef = useRef<SVGElement | null>(null);

  const angleRef = useRef(0);
  const velocityRef = useRef(0);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  // 指针相对容器的光位（-1..1）
  const lightXRef = useRef(-0.25);
  const lightTargetRef = useRef(-0.25);
  const rafRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const stage = stageRef.current;
    if (!stage) return;

    const lightAngle = () => lightXRef.current * 0.9 - 0.35; // 光源略偏左前

    const render = () => {
      if (!aliveRef.current) return;

      if (!draggingRef.current) {
        // 惯性衰减 + 闲置缓转
        if (Math.abs(velocityRef.current) > 0.0002) {
          angleRef.current += velocityRef.current;
          velocityRef.current *= 0.94;
        } else if (!reducedMotion) {
          angleRef.current += idleSpin;
        }
      }
      // 角度不做归一化也可，cos/sin 周期处理

      // 光位平滑追随
      lightXRef.current += (lightTargetRef.current - lightXRef.current) * 0.12;

      const proj: Projected = projectBlade(angleRef.current, lightAngle());
      const g = bladeGroupRef.current;
      if (g) {
        // scaleX 最小保留一点厚度，避免完全消失时穿帮
        const sx = Math.sign(proj.scaleX) * Math.max(0.12, Math.abs(proj.scaleX));
        g.setAttribute('transform', `scale(${f3(sx)} 1)`);
        g.setAttribute('data-facing', String(proj.facing));
      }
      if (highlightRef.current) {
        // 高光沿剑身宽度游走：translateX ∈ [-6, 6]
        const hx = proj.highlight * 6;
        highlightRef.current.setAttribute('transform', `translate(${f3(hx)} 0)`);
        highlightRef.current.setAttribute('opacity', String(f3(0.25 + proj.shade * 0.55)));
      }
      if (shadeRef.current) {
        shadeRef.current.setAttribute('opacity', String(f3(0.6 + proj.shade * 0.4)));
      }

      rafRef.current = requestAnimationFrame(render);
    };

    const onPointerDown = (e: PointerEvent) => {
      draggingRef.current = true;
      lastXRef.current = e.clientX;
      velocityRef.current = 0;
      stage.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      lightTargetRef.current = Math.max(
        -1,
        Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1),
      );
      if (!draggingRef.current) return;
      const dx = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      // 横向位移 -> 绕竖轴转角
      const delta = (dx / rect.width) * Math.PI * 1.4;
      angleRef.current += delta;
      velocityRef.current = delta;
    };
    const onPointerUp = (e: PointerEvent) => {
      draggingRef.current = false;
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch {
        /* 无需处理 */
      }
    };

    if (enabled) {
      stage.addEventListener('pointerdown', onPointerDown);
      stage.addEventListener('pointermove', onPointerMove);
      stage.addEventListener('pointerup', onPointerUp);
      stage.addEventListener('pointercancel', onPointerUp);
      rafRef.current = requestAnimationFrame(render);
    }

    return () => {
      aliveRef.current = false; // 先标记，避免下一帧再次调度
      cancelAnimationFrame(rafRef.current);
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
    };
  }, [enabled, reducedMotion, idleSpin]);

  return { stageRef, bladeGroupRef, highlightRef, shadeRef, angleRef };
}

const f3 = (v: number) => Math.round(v * 1000) / 1000;
