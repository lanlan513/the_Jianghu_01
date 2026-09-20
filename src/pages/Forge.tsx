import { useMemo, useState } from 'react';
import { Hammer, RotateCcw, Sparkles } from 'lucide-react';
import {
  MATERIALS,
  QUENCHES,
  FOLD_COUNTS,
  HEAT_LABELS,
  forgeSword,
} from '@/lib/forge/generate';
import type {
  FoldLevel,
  ForgedSword,
  ForgeParams,
  HeatLevel,
  MaterialId,
  QuenchId,
} from '@/lib/forge/types';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import ForgeAnimation from '@/components/forge/ForgeAnimation';
import ForgeSwordView from '@/components/forge/ForgeSwordView';
import { cn } from '@/lib/utils';

/**
 * 铸剑台页面。
 *
 * 数值与几何在点击「开炉铸剑」的一刻由纯函数 forgeSword 一次性确定；
 * 之后无论播完还是跳过动画，展示的都是同一把 ForgedSword。
 * 「重铸一炉」会回到选料并可再次播放动画（参数与种子不变 → 同一把剑）。
 */

type Phase = 'config' | 'animating' | 'done';

const FOLD_LAYER_LABEL = ['单材', '八层', '二百余层', '六千余层', '2³² 层'];

export default function Forge() {
  const reducedMotion = useReducedMotion();

  const [material, setMaterial] = useState<MaterialId>('qingjin');
  const [heat, setHeat] = useState<HeatLevel>(3);
  const [folds, setFolds] = useState<FoldLevel>(2);
  const [quench, setQuench] = useState<QuenchId>('water');
  const [seedInput, setSeedInput] = useState('');
  const [phase, setPhase] = useState<Phase>('config');
  const [castToken, setCastToken] = useState(0);
  const [history, setHistory] = useState<ForgedSword[]>([]);

  const params: ForgeParams = useMemo(
    () => ({ material, heat, folds, quench, seed: seedInput }),
    [material, heat, folds, quench, seedInput],
  );

  const [frozenParams, setFrozenParams] = useState<ForgeParams | null>(null);

  // 铸剑真源：开炉瞬间冻结参数并由纯函数计算，此后动画/跳过/重播都用同一把剑
  const sword = useMemo<ForgedSword | null>(() => {
    if (phase === 'config' || !frozenParams) return null;
    return forgeSword(frozenParams);
    // castToken 是「再次开炉」的显式触发，刻意保留为依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, castToken, frozenParams]);

  const startForge = () => {
    setFrozenParams(params);
    setCastToken((t) => t + 1);
    setPhase('animating');
  };
  const replay = () => setPhase('animating');
  const backToConfig = () => setPhase('config');

  const onForgeDone = () => {
    setPhase('done');
    if (sword) {
      setHistory((h) => {
        if (h.some((s) => s.fingerprint === sword.fingerprint)) return h;
        return [sword, ...h].slice(0, 5);
      });
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="container mx-auto px-4 max-w-6xl">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <Hammer className="w-5 h-5 text-cinnabar-600" />
            <span className="text-gold-600 font-song text-sm tracking-widest">
              手工百炼 · 一炉一剑
            </span>
            <Hammer className="w-5 h-5 text-cinnabar-600 -scale-x-100" />
          </div>
          <h1 className="font-brush text-5xl md:text-6xl text-ink-900 text-shadow-ink mb-3">
            铸剑台
          </h1>
          <p className="font-song text-ink-600 max-w-2xl mx-auto">
            选剑胚、定火候、施折叠、择淬火——剑之弧度、层数、纹理、辉光与柄格形制，
            皆由此四事与炉号种子推演而成，无半分假借图样。
          </p>
        </header>

        {phase === 'config' && (
          <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
            <div className="scroll-container p-6 md:p-10 space-y-10">
              {/* 剑胚材质 */}
              <Section title="一、选剑胚" hint="定色相、骨相与纹理基调">
                <div className="grid sm:grid-cols-2 gap-3">
                  {Object.values(MATERIALS).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMaterial(m.id)}
                      className={cn(
                        'text-left p-4 border transition-all',
                        material === m.id
                          ? 'border-cinnabar-600 bg-cinnabar-50/60 shadow-brush'
                          : 'border-ink-200 bg-ink-50 hover:border-ink-400',
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-brush text-2xl text-ink-900">{m.name}</span>
                        <span
                          className="w-5 h-5 rounded-full border border-ink-300"
                          style={{ background: m.hue !== undefined ? `hsl(${m.hue} 45% 45%)` : undefined }}
                        />
                      </div>
                      <p className="font-song text-xs text-ink-600 leading-relaxed">
                        {m.description}
                      </p>
                    </button>
                  ))}
                </div>
              </Section>

              {/* 火候 */}
              <Section title="二、定火候" hint="火盛则刃张而弧生，过燥则伤身">
                <div className="flex gap-2 flex-wrap">
                  {([1, 2, 3, 4, 5] as HeatLevel[]).map((lv) => (
                    <button
                      key={lv}
                      onClick={() => setHeat(lv)}
                      className={cn(
                        'flex-1 min-w-[72px] py-3 border font-song transition-all',
                        heat === lv
                          ? 'border-cinnabar-600 text-cinnabar-700 bg-cinnabar-50'
                          : 'border-ink-200 text-ink-600 hover:border-ink-400 bg-ink-50',
                      )}
                    >
                      <span className="block font-brush text-xl">{HEAT_LABELS[lv]}</span>
                      <span className="text-[10px] text-ink-400">{lv} 档</span>
                    </button>
                  ))}
                </div>
              </Section>

              {/* 折叠次数 */}
              <Section title="三、施折叠" hint="折叠愈多，层数与纹理愈繁；与烈火同施恐过炼">
                <div className="flex gap-2 flex-wrap">
                  {FOLD_COUNTS.map((fc, i) => (
                    <button
                      key={fc}
                      onClick={() => setFolds(i as FoldLevel)}
                      className={cn(
                        'flex-1 min-w-[64px] py-3 border font-song transition-all',
                        folds === i
                          ? 'border-gold-600 text-gold-700 bg-gold-50'
                          : 'border-ink-200 text-ink-600 hover:border-ink-400 bg-ink-50',
                      )}
                    >
                      <span className="block font-brush text-xl">{fc === 0 ? '不折' : `${fc}折`}</span>
                      <span className="text-[10px] text-ink-400">{FOLD_LAYER_LABEL[i]}</span>
                    </button>
                  ))}
                </div>
                <OverforgeHint heat={heat} folds={folds} />
              </Section>

              {/* 淬火介质 */}
              <Section title="四、择淬火" hint="介质移刃色、改辉光，亦定裂纹之险">
                <div className="grid sm:grid-cols-2 gap-3">
                  {Object.values(QUENCHES).map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setQuench(q.id)}
                      className={cn(
                        'text-left p-4 border transition-all',
                        quench === q.id
                          ? 'border-bronze-600 bg-bronze-50/60 shadow-gold'
                          : 'border-ink-200 bg-ink-50 hover:border-ink-400',
                      )}
                    >
                      <div className="font-brush text-2xl text-ink-900 mb-1">{q.name}</div>
                      <p className="font-song text-xs text-ink-600 leading-relaxed">
                        {q.description}
                      </p>
                    </button>
                  ))}
                </div>
              </Section>

              {/* 种子 */}
              <Section title="炉号（种子）" hint="留空则由参数而定；同参同号，所铸必同">
                <input
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  placeholder="例如：甲子年·雪夜"
                  className="w-full bg-ink-50 border border-ink-200 px-4 py-3 font-song text-ink-800 focus:border-cinnabar-600 outline-none"
                />
              </Section>
            </div>

            {/* 侧栏：预览与开炉 */}
            <aside className="space-y-4 lg:sticky lg:top-24">
              <div className="ink-card p-6">
                <h3 className="font-brush text-2xl text-ink-900 mb-4">配料单</h3>
                <dl className="font-song text-sm text-ink-700 space-y-2">
                  <Row k="剑胚" v={MATERIALS[material].name} />
                  <Row k="火候" v={`${HEAT_LABELS[heat]}（${heat} 档）`} />
                  <Row k="折叠" v={folds === 0 ? '不折叠' : `${FOLD_COUNTS[folds]} 折`} />
                  <Row k="淬火" v={QUENCHES[quench].name} />
                  <Row k="炉号" v={seedInput.trim() || '（随缘，由参数定）'} />
                </dl>
                <button
                  onClick={startForge}
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cinnabar-600 to-cinnabar-700 text-ink-100 font-song shadow-brush hover:shadow-ink-hover transition-all hover:-translate-y-0.5"
                >
                  <Sparkles className="w-4 h-4" />
                  开炉铸剑
                </button>
              </div>

              {history.length > 0 && (
                <div className="ink-card p-6">
                  <h3 className="font-brush text-xl text-ink-900 mb-3">炉前五剑</h3>
                  <ul className="font-song text-sm text-ink-600 space-y-2">
                    {history.map((s) => (
                      <li key={s.fingerprint} className="flex items-center justify-between gap-2">
                        <span className="text-ink-800">
                          {s.name}
                          {s.overforge.active && (
                            <em className="not-italic text-cinnabar-700 text-xs ml-1">过炼</em>
                          )}
                        </span>
                        <span className="font-mono text-[10px] text-ink-400">{s.fingerprint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        )}

        {phase === 'animating' && sword && (
          <div className="max-w-2xl mx-auto">
            <ForgeAnimation sword={sword} reducedMotion={reducedMotion} onDone={onForgeDone} />
          </div>
        )}

        {phase === 'done' && sword && (
          <ResultPanel
            sword={sword}
            reducedMotion={reducedMotion}
            onReplay={replay}
            onBack={backToConfig}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------ 子件 -------------------------------- */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-brush text-2xl text-ink-900">{title}</h2>
        {hint && <span className="font-song text-xs text-ink-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-ink-200 pb-2">
      <dt className="text-ink-500">{k}</dt>
      <dd className="text-ink-800 text-right">{v}</dd>
    </div>
  );
}

function OverforgeHint({ heat, folds }: { heat: number; folds: number }) {
  const danger = heat >= 4 && folds >= 3;
  if (!danger) return null;
  const severe = heat >= 5 && folds >= 4;
  return (
    <p className="mt-3 font-song text-xs text-cinnabar-700 bg-cinnabar-50 border border-cinnabar-200 px-3 py-2">
      ⚠ {severe ? '烈焰与三十二折同施，必有崩裂之虞（过炼折损）。' : '火候已高、折叠亦频，恐触发过炼折损。'}
    </p>
  );
}

function ResultPanel({
  sword,
  reducedMotion,
  onReplay,
  onBack,
}: {
  sword: ForgedSword;
  reducedMotion: boolean;
  onReplay: () => void;
  onBack: () => void;
}) {
  const g = sword.geometry;
  const attrItems: Array<[string, number, string]> = [
    ['锋利', sword.stats.sharpness, 'from-cinnabar-500 to-cinnabar-700'],
    ['硬度', sword.stats.hardness, 'from-bronze-500 to-bronze-700'],
    ['柔韧', sword.stats.flexibility, 'from-gold-500 to-gold-700'],
    ['工艺', sword.stats.craftsmanship, 'from-ink-600 to-ink-800'],
  ];

  const grainName: Record<string, string> = {
    straight: '直纹',
    flow: '流水纹',
    cloud: '卷云纹',
    scale: '鱼鳞纹',
  };
  const guardName: Record<string, string> = {
    ruyi: '如意云头格',
    animal: '兽吻格',
    disc: '圆盘格',
    wing: '展翼格',
  };
  const gripName: Record<string, string> = {
    plainwrap: '素布缠柄',
    coilcord: '绳纹缠柄',
    jadeinlay: '嵌玉柄',
    rivet: '铆钉柄',
  };

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-8 items-start">
      <div className="ink-card p-4">
        <ForgeSwordView sword={sword} reducedMotion={reducedMotion} />
      </div>

      <div className="space-y-6">
        <div className="scroll-container p-6 md:p-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="seal-stamp text-xs">{sword.title}</span>
            {sword.overforge.active && (
              <span className="font-song text-xs text-cinnabar-700 border border-cinnabar-300 px-2 py-0.5">
                过炼折损
              </span>
            )}
          </div>
          <h2 className="font-brush text-5xl text-ink-900 mb-4">{sword.name}</h2>

          {sword.overforge.active && (
            <p className="font-song text-sm text-cinnabar-800 bg-cinnabar-50 border-l-4 border-cinnabar-600 px-4 py-3 mb-4">
              {sword.overforge.note}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 font-song text-sm mb-6">
            <Meta k="剑身弧度" v={`${Math.abs(g.arc).toFixed(1)} 单位${g.arc === 0 ? '（端直）' : g.arc < 0 ? '（左弧）' : '（右弧）'}`} />
            <Meta k="折叠层数" v={formatLayers(g.layers)} />
            <Meta k="纹理线数" v={`${g.grainLineCount} 线 · ${grainName[g.grainStyle]}`} />
            <Meta k="剑格形制" v={guardName[g.guardForm]} />
            <Meta k="剑柄形制" v={gripName[g.gripForm]} />
            <Meta k="刃色辉光" v={`${Math.round(g.glow.intensity * 100)}%`} swatch={g.glow.color} />
            <Meta k="淬火裂纹" v={g.cracks.length ? `${g.cracks.length} 处微瑕` : '完莹无疵'} />
            <Meta k="剑脊宽" v={`${g.baseWidth} 单位`} />
          </div>

          <div className="space-y-3">
            {attrItems.map(([label, value, grad]) => (
              <div key={label}>
                <div className="flex justify-between font-song text-sm text-ink-600 mb-1">
                  <span>{label}</span>
                  <span className="font-brush text-base text-ink-800">{value}</span>
                </div>
                <div className="sword-attribute-bar">
                  <div
                    className={cn('sword-attribute-bar-fill bg-gradient-to-r', grad)}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-dashed border-ink-300 font-mono text-[11px] text-ink-500 break-all">
            几何指纹：{sword.fingerprint}
            <span className="font-song text-ink-400 ml-2">
              （同参数·同种子必复现）
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onReplay}
            className="inline-flex items-center gap-2 px-6 py-3 bg-ink-50 border-2 border-ink-800 text-ink-800 font-song hover:bg-ink-100 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            重播铸剑
          </button>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cinnabar-600 to-cinnabar-700 text-ink-100 font-song shadow-brush hover:shadow-ink-hover transition-all"
          >
            <Hammer className="w-4 h-4" />
            另铸新剑
          </button>
        </div>
      </div>
    </div>
  );
}

function Meta({ k, v, swatch }: { k: string; v: string; swatch?: string }) {
  return (
    <div className="border-b border-dashed border-ink-200 pb-2">
      <div className="text-ink-500 text-xs">{k}</div>
      <div className="text-ink-800 flex items-center gap-2">
        {swatch && <span className="w-3 h-3 rounded-full border border-ink-300" style={{ background: swatch }} />}
        {v}
      </div>
    </div>
  );
}

function formatLayers(layers: number): string {
  if (layers >= 1e8) return `${layers.toExponential(0)} 层`;
  return `${layers} 层`;
}
