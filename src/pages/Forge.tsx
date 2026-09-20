import { useMemo, useState } from 'react';
import {
  Hammer,
  Flame,
  Layers,
  Droplets,
  Scroll,
  Sparkles,
  RotateCcw,
  Play,
  Fingerprint,
  AlertTriangle,
  Swords,
  Dices,
} from 'lucide-react';
import {
  MATERIALS,
  MATERIAL_ORDER,
  QUENCHES,
  QUENCH_ORDER,
  HEAT_RANGE,
  FOLD_RANGE,
  isOverForged,
  OVERFORGE,
  type ForgeParams,
  type MaterialId,
  type QuenchId,
} from '@/lib/forge/options';
import { forgeSword, edgeGlow, heatLabel, type ForgeResult } from '@/lib/forge/rules';
import ForgeAnimation from '@/components/forge/ForgeAnimation';
import SwordViewer from '@/components/forge/SwordViewer';
import { cn } from '@/lib/utils';

type Phase = 'config' | 'forging' | 'result';

const ATTRIBUTE_LABELS: Record<string, { label: string; color: string }> = {
  sharpness: { label: '锋利', color: 'from-cinnabar-500 to-cinnabar-700' },
  hardness: { label: '硬度', color: 'from-bronze-500 to-bronze-700' },
  flexibility: { label: '柔韧', color: 'from-gold-500 to-gold-700' },
  craftsmanship: { label: '工艺', color: 'from-ink-600 to-ink-800' },
};

const DEFAULT_PARAMS: ForgeParams = {
  material: 'bintie',
  heat: 6,
  folds: 5,
  quench: 'hanquan',
  seed: '青冥炉·壹',
};

export default function Forge() {
  const [params, setParams] = useState<ForgeParams>(DEFAULT_PARAMS);
  const [phase, setPhase] = useState<Phase>('config');
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [animKey, setAnimKey] = useState(0);

  // 过炼风险预警：纯函数，随参数即时算出
  const risky = isOverForged(params);
  const previewGlow = useMemo(
    () => edgeGlow(params.heat, risky),
    [params.heat, risky],
  );

  const startForge = (next: ForgeParams) => {
    // 剑在动画开始前即由纯函数铸成；跳过与播完，得同一把剑
    setResult(forgeSword(next));
    setAnimKey((k) => k + 1);
    setPhase('forging');
  };

  const reseed = () => {
    setParams((p) => ({ ...p, seed: `炉${Date.now().toString(36)}` }));
  };

  return (
    <div className="min-h-screen pt-16">
      <div className="container mx-auto px-4 py-10">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-gold-500" />
            <span className="text-gold-600 font-song text-sm tracking-widest">
              千锤百炼 · 一剑一界
            </span>
            <Sparkles className="w-4 h-4 text-gold-500" />
          </div>
          <h1 className="font-brush text-5xl md:text-6xl text-ink-900 text-shadow-ink">铸剑台</h1>
          <p className="font-song text-ink-600 mt-3">
            择材、掌火、折叠、淬水——同参同种，必得同剑；剑形剑纹，皆由数生。
          </p>
        </header>

        {phase === 'config' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="lg:col-span-2 space-y-8">
              <section className="ink-card p-6">
                <div className="flex items-center gap-3 mb-5">
                  <Swords className="w-5 h-5 text-cinnabar-600" />
                  <h2 className="font-brush text-2xl text-ink-900">一 · 择剑胚材质</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {MATERIAL_ORDER.map((id: MaterialId) => {
                    const m = MATERIALS[id];
                    const active = params.material === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setParams((p) => ({ ...p, material: id }))}
                        className={cn(
                          'p-4 text-left border transition-all duration-300',
                          active
                            ? 'border-cinnabar-500 bg-cinnabar-50 shadow-brush'
                            : 'border-ink-200 bg-ink-50 hover:border-ink-400',
                        )}
                      >
                        <div className="font-brush text-xl text-ink-900">{m.name}</div>
                        <div className="font-song text-xs text-ink-500 mt-1 leading-relaxed">
                          {m.desc}
                        </div>
                        <div className="font-song text-xs text-bronze-600 mt-2">
                          弧度 {(m.curvature * 100).toFixed(0)} · {m.guardName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="ink-card p-6">
                <div className="flex items-center gap-3 mb-5">
                  <Flame className="w-5 h-5 text-cinnabar-600" />
                  <h2 className="font-brush text-2xl text-ink-900">二 · 掌炉温火候</h2>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={HEAT_RANGE.min}
                    max={HEAT_RANGE.max}
                    value={params.heat}
                    onChange={(e) => setParams((p) => ({ ...p, heat: Number(e.target.value) }))}
                    className="flex-1 accent-cinnabar-600"
                    aria-label="火候"
                  />
                  <span className="font-brush text-2xl text-cinnabar-600 w-10 text-center">
                    {params.heat}
                  </span>
                </div>
                <div className="flex justify-between font-song text-xs text-ink-500 mt-2">
                  <span>文火</span>
                  <span className="text-gold-600">{heatLabel(params.heat)}</span>
                  <span>极焰</span>
                </div>
                <div className="mt-3 flex items-center gap-2 font-song text-xs text-ink-500">
                  <span>刃色辉光</span>
                  <span
                    className="inline-block w-8 h-3 rounded-full"
                    style={{
                      backgroundColor: previewGlow.color,
                      boxShadow: `0 0 ${6 + previewGlow.intensity * 10}px ${previewGlow.color}`,
                    }}
                  />
                  <span>{previewGlow.label}</span>
                </div>
              </section>

              <section className="ink-card p-6">
                <div className="flex items-center gap-3 mb-5">
                  <Layers className="w-5 h-5 text-cinnabar-600" />
                  <h2 className="font-brush text-2xl text-ink-900">三 · 定折叠次数</h2>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={FOLD_RANGE.min}
                    max={FOLD_RANGE.max}
                    value={params.folds}
                    onChange={(e) => setParams((p) => ({ ...p, folds: Number(e.target.value) }))}
                    className="flex-1 accent-cinnabar-600"
                    aria-label="折叠次数"
                  />
                  <span className="font-brush text-2xl text-cinnabar-600 w-10 text-center">
                    {params.folds}
                  </span>
                </div>
                <p className="font-song text-xs text-ink-500 mt-2">
                  折叠 {params.folds} 次，凡 {Math.pow(2, params.folds).toLocaleString()} 层
                </p>
              </section>

              <section className="ink-card p-6">
                <div className="flex items-center gap-3 mb-5">
                  <Droplets className="w-5 h-5 text-cinnabar-600" />
                  <h2 className="font-brush text-2xl text-ink-900">四 · 取淬火介质</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {QUENCH_ORDER.map((id: QuenchId) => {
                    const q = QUENCHES[id];
                    const active = params.quench === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setParams((p) => ({ ...p, quench: id }))}
                        className={cn(
                          'p-4 text-left border transition-all duration-300',
                          active
                            ? 'border-cinnabar-500 bg-cinnabar-50 shadow-brush'
                            : 'border-ink-200 bg-ink-50 hover:border-ink-400',
                        )}
                      >
                        <div className="font-brush text-xl text-ink-900">{q.name}</div>
                        <div className="font-song text-xs text-ink-500 mt-1 leading-relaxed">
                          {q.desc}
                        </div>
                        <div className="font-song text-xs text-bronze-600 mt-2">
                          纹理 {q.grainLines} 线 · {q.handleName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="ink-card p-6">
                <div className="flex items-center gap-3 mb-5">
                  <Scroll className="w-5 h-5 text-cinnabar-600" />
                  <h2 className="font-brush text-2xl text-ink-900">五 · 铸剑种子</h2>
                </div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={params.seed}
                    onChange={(e) => setParams((p) => ({ ...p, seed: e.target.value }))}
                    className="flex-1 px-4 py-2 bg-ink-50 border border-ink-200 font-song text-ink-800 focus:outline-none focus:border-cinnabar-500"
                    placeholder="炉号铭文，如：青冥炉·壹"
                  />
                  <button
                    onClick={reseed}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-ink-100 border border-ink-200 font-song text-sm text-ink-700 hover:border-gold-400 hover:text-gold-600 transition-colors"
                  >
                    <Dices className="w-4 h-4" />
                    换一炉
                  </button>
                </div>
                <p className="font-song text-xs text-ink-500 mt-2">
                  同参同种，所铸之剑分毫不差；异种则另起炉烟。
                </p>
              </section>
            </div>

            <aside className="space-y-6">
              <div className="ink-card p-6 sticky top-24">
                <h3 className="font-brush text-2xl text-ink-900 mb-4">铸剑方略</h3>
                <dl className="space-y-3 font-song text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">剑胚</dt>
                    <dd className="text-ink-800">{MATERIALS[params.material].name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">火候</dt>
                    <dd className="text-ink-800">
                      {params.heat} · {heatLabel(params.heat)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">折叠</dt>
                    <dd className="text-ink-800">
                      {params.folds} 次 · {Math.pow(2, params.folds).toLocaleString()} 层
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">淬火</dt>
                    <dd className="text-ink-800">{QUENCHES[params.quench].name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">剑格</dt>
                    <dd className="text-ink-800">{MATERIALS[params.material].guardName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">剑柄</dt>
                    <dd className="text-ink-800">{QUENCHES[params.quench].handleName}</dd>
                  </div>
                </dl>

                {risky && (
                  <div className="mt-5 p-3 border border-cinnabar-300 bg-cinnabar-50 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-cinnabar-600 shrink-0 mt-0.5" />
                    <p className="font-song text-xs text-cinnabar-700 leading-relaxed">
                      火候逾{OVERFORGE.heat}而折叠过{OVERFORGE.folds - 1}，刚柔两竭，
                      恐有过炼折损之险。
                    </p>
                  </div>
                )}

                <button
                  onClick={() => startForge(params)}
                  className="ink-ripple mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cinnabar-600 to-cinnabar-700 text-ink-100 font-song shadow-brush hover:shadow-ink-hover transition-all duration-300 hover:-translate-y-0.5"
                >
                  <Hammer className="w-5 h-5" />
                  开炉铸剑
                </button>
              </div>
            </aside>
          </div>
        )}

        {phase === 'forging' && (
          <div className="max-w-3xl mx-auto">
            <ForgeAnimation
              key={animKey}
              params={params}
              onComplete={() => setPhase('result')}
            />
          </div>
        )}

        {phase === 'result' && result && (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="ink-card p-4 relative">
                <div className="aspect-square">
                  <SwordViewer model={result.model} glow={result.glow} />
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center font-song text-xs text-ink-500 pointer-events-none">
                  按住拖拽 · 旋转赏剑；移指所至 · 高光随行
                </p>
                {result.broken && (
                  <div className="absolute top-4 left-4 seal-stamp">过炼折损</div>
                )}
              </div>

              <div className="space-y-6">
                <div className="ink-card p-6">
                  <span className="seal-stamp mb-3 inline-block">{result.alias}</span>
                  <h2 className="font-brush text-5xl text-ink-900 text-shadow-ink">
                    {result.name}
                  </h2>
                  <p className="font-song text-ink-600 leading-loose mt-4">{result.lore}</p>
                  <div className="mt-4 pt-4 border-t border-ink-200 flex items-center gap-2 font-song text-xs text-ink-500">
                    <Fingerprint className="w-4 h-4 text-gold-600" />
                    剑纹指纹
                    <span className="font-mono text-ink-700 tracking-widest">
                      {result.fingerprint}
                    </span>
                  </div>
                </div>

                <div className="ink-card p-6">
                  <h3 className="font-brush text-2xl text-ink-900 mb-5">剑之属性</h3>
                  <div className="space-y-4">
                    {Object.entries(result.attributes).map(([key, value]) => {
                      const attr = ATTRIBUTE_LABELS[key];
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-song text-sm text-ink-600">{attr.label}</span>
                            <span className="font-brush text-lg text-ink-800">{value}</span>
                          </div>
                          <div className="sword-attribute-bar h-3">
                            <div
                              className={cn(
                                'sword-attribute-bar-fill h-full bg-gradient-to-r',
                                attr.color,
                              )}
                              style={{ width: `${value}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="ink-card p-6">
                  <h3 className="font-brush text-2xl text-ink-900 mb-4">锻铸之数</h3>
                  <div className="grid grid-cols-2 gap-3 font-song text-sm">
                    <div className="p-3 bg-ink-50 border border-ink-200">
                      <div className="text-ink-500 text-xs">折叠层数</div>
                      <div className="font-brush text-xl text-ink-800">
                        {result.stats.layers.toLocaleString()} 层
                      </div>
                    </div>
                    <div className="p-3 bg-ink-50 border border-ink-200">
                      <div className="text-ink-500 text-xs">纹理线数</div>
                      <div className="font-brush text-xl text-ink-800">
                        {result.stats.grainLines} 线
                      </div>
                    </div>
                    <div className="p-3 bg-ink-50 border border-ink-200">
                      <div className="text-ink-500 text-xs">剑身弧度</div>
                      <div className="font-brush text-xl text-ink-800">
                        {(result.stats.curvature * 100).toFixed(1)}
                      </div>
                    </div>
                    <div className="p-3 bg-ink-50 border border-ink-200">
                      <div className="text-ink-500 text-xs">刃色辉光</div>
                      <div className="font-brush text-xl text-ink-800 flex items-center gap-2">
                        <span
                          className="inline-block w-4 h-4 rounded-full"
                          style={{
                            backgroundColor: result.glow.color,
                            boxShadow: `0 0 8px ${result.glow.color}`,
                          }}
                        />
                        {result.glow.label}
                      </div>
                    </div>
                    <div className="p-3 bg-ink-50 border border-ink-200">
                      <div className="text-ink-500 text-xs">剑格</div>
                      <div className="font-brush text-xl text-ink-800">{result.stats.guardName}</div>
                    </div>
                    <div className="p-3 bg-ink-50 border border-ink-200">
                      <div className="text-ink-500 text-xs">剑柄</div>
                      <div className="font-brush text-xl text-ink-800">
                        {result.stats.handleName}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => setPhase('config')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-100 border border-ink-200 font-song text-sm text-ink-700 hover:border-cinnabar-400 hover:text-cinnabar-600 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    回炉重铸
                  </button>
                  <button
                    onClick={() => {
                      setAnimKey((k) => k + 1);
                      setPhase('forging');
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-100 border border-ink-200 font-song text-sm text-ink-700 hover:border-gold-400 hover:text-gold-600 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    重播出炉
                  </button>
                  <button
                    onClick={() => {
                      const next = { ...params, seed: `炉${Date.now().toString(36)}` };
                      setParams(next);
                      startForge(next);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cinnabar-600 to-cinnabar-700 text-ink-100 font-song text-sm shadow-brush hover:shadow-ink-hover transition-all"
                  >
                    <Dices className="w-4 h-4" />
                    换种再铸
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
