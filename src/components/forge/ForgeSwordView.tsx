import { useMemo } from 'react';
import type { ForgedSword } from '@/lib/forge/types';
import { MATERIALS } from '@/lib/forge/generate';
import {
  bladeOutlinePath,
  grainLinePaths,
  edgeLinePaths,
  guardPath,
  gripArt,
} from '@/lib/forge/svgGeometry';
import { useDragRotation } from '@/hooks/useDragRotation';

/**
 * 出炉后的成品展示：手写 SVG，可拖拽做绕竖轴的伪三维旋转。
 * 每帧的压缩 / 高光 / 明暗由 rAF 直接写入 ref，不经过 React state。
 */

interface Props {
  sword: ForgedSword;
  reducedMotion: boolean;
}

export default function ForgeSwordView({ sword, reducedMotion }: Props) {
  const g = sword.geometry;
  const material = MATERIALS[sword.params.material];

  const paths = useMemo(
    () => ({
      outline: bladeOutlinePath(g),
      grains: grainLinePaths(g),
      edges: edgeLinePaths(g),
      guard: guardPath(g.guardForm),
      grip: gripArt(g.gripForm),
    }),
    [g],
  );

  const { stageRef, bladeGroupRef, highlightRef, shadeRef } = useDragRotation({
    enabled: true,
    reducedMotion,
  });

  const grainColor = material.id === 'wujin' ? '#7c5a1c' : '#2d3a4a';

  return (
    <div
      ref={stageRef}
      className="relative w-full max-w-md mx-auto cursor-grab active:cursor-grabbing touch-none select-none"
      role="img"
      aria-label={`${sword.name}，可拖拽旋转观赏。剑身弧度 ${Math.abs(g.arc).toFixed(1)}，折叠 ${g.grainLineCount} 纹理。`}
    >
      <svg viewBox="-120 -430 240 580" className="w-full h-[440px] overflow-visible">
        {/* 整体明暗层：rAF 改写 opacity */}
        <g ref={shadeRef as React.RefObject<SVGGElement>} opacity="1">
          {/* 外辉光 */}
          <path
            d={paths.outline}
            fill="none"
            stroke={g.glow.color}
            strokeWidth={g.glow.radius}
            style={{ filter: 'blur(4px)', opacity: 0.55 * g.glow.intensity + 0.15 }}
          />

          {/* 可旋转投影组：rAF 改写 transform=scale(sx 1)，剑身与地面投影同步压缩 */}
          <g ref={bladeGroupRef}>
            {/* 地面投影：随朝向压缩的墨色椭圆 */}
            <ellipse cx="0" cy="124" rx="90" ry="12" fill="#2d3a4a" opacity="0.1" />

            <path d={paths.outline} fill={g.bladeColor} stroke={g.edgeColor} strokeWidth="1.2" />

            {/* 刃身高光：一条随光位横移的亮带，被剑身裁剪 */}
            <clipPath id="forge-blade-clip">
              <path d={paths.outline} />
            </clipPath>
            <g clipPath="url(#forge-blade-clip)">
              <rect
                ref={highlightRef as React.RefObject<SVGRectElement>}
                x={-80}
                y={-372}
                width={160}
                height={372}
                fill="url(#forge-highlight-grad)"
                opacity="0.5"
              />
            </g>

            <g>
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

            <path d={paths.edges[0]} fill="none" stroke={g.edgeColor} strokeWidth="1.5" />
            <path d={paths.edges[1]} fill="none" stroke={g.edgeColor} strokeWidth="1.5" />

            {/* 淬火微裂纹 */}
            {g.cracks.map((t, i) => {
              const idx = Math.round(t * (g.bladeLeft.length - 1));
              const pt = g.bladeRight[idx];
              return (
                <path
                  key={i}
                  d={`M ${pt.x} ${pt.y} l -5 2 l 4 3 z`}
                  fill="#1a1a1a"
                  opacity="0.65"
                />
              );
            })}

            <path d={paths.guard} fill="#3d3730" stroke="#1a1a1a" strokeWidth="1" />

            {/* 剑柄 */}
            <path d={paths.grip.grip} fill="#4a3f33" stroke="#1a1a1a" strokeWidth="1" />
            {paths.grip.wraps.map((wd, i) =>
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
            <path d={paths.grip.pommel} fill="#3d3730" stroke="#1a1a1a" strokeWidth="1" />
          </g>
        </g>

        <defs>
          <linearGradient id="forge-highlight-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="text-center font-song text-xs text-ink-500 -mt-2">
        拖拽剑身转动 · 高光随光位游走
      </div>
    </div>
  );
}
