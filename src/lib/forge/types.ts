/**
 * 铸剑台：参数、剑胚属性与几何描述类型。
 * 全部为纯数据，不引用任何 React / DOM 类型。
 */

/** 剑胚材质 */
export type MaterialId = 'qingjin' | 'xantie' | 'hanyu' | 'wujin';

/** 火候档位（1 文火 … 5 烈焰） */
export type HeatLevel = 1 | 2 | 3 | 4 | 5;

/** 淬火介质 */
export type QuenchId = 'water' | 'oil' | 'brine' | 'snow';

/** 折叠次数档位（0 … 4，对应 0、3、8、16、32 折） */
export type FoldLevel = 0 | 1 | 2 | 3 | 4;

export interface ForgeParams {
  material: MaterialId;
  heat: HeatLevel;
  folds: FoldLevel;
  quench: QuenchId;
  /** 用户种子，空串时由参数本身决定（仍是确定的） */
  seed: string;
}

export interface MaterialDef {
  id: MaterialId;
  name: string;
  /** 基底色相（0-360） */
  hue: number;
  /** 基础属性权重 */
  sharpness: number;
  hardness: number;
  flexibility: number;
  /** 材料倾向的剑身弧度，像素（SVG 坐标内） */
  arcBias: number;
  /** 纹理基调：直线纹 / 流水纹 / 卷云纹 / 鱼鳞纹 */
  grainStyle: GrainStyle;
  description: string;
}

export interface QuenchDef {
  id: QuenchId;
  name: string;
  /** 对刃色辉光的色相偏移与强度修正 */
  hueShift: number;
  glowBoost: number;
  /** 对硬度/锋利的微调权重 */
  hardnessMod: number;
  sharpnessMod: number;
  /** 淬火裂纹倾向（0-1） */
  crackRisk: number;
  description: string;
}

export type GrainStyle = 'straight' | 'flow' | 'cloud' | 'scale';

/** 剑格（护手）形制 */
export type GuardForm = 'ruyi' | 'animal' | 'disc' | 'wing';
/** 剑柄形制 */
export type GripForm = 'plainwrap' | 'coilcord' | 'jadeinlay' | 'rivet';

export interface ForgeStats {
  sharpness: number;
  hardness: number;
  flexibility: number;
  craftsmanship: number;
}

/**
 * 过炼折损：火候与折叠同时过高时触发。
 */
export interface Overforge {
  active: boolean;
  /** 0-1，越接近 1 越严重 */
  severity: number;
  /** 折损描述 */
  note: string;
}

/** 单条折叠纹理线（剑身内部） */
export interface GrainLine {
  /** 归一化参数 t ∈ [0,1] 上的若干采样点（x 为宽度方向偏移，y 为沿剑方向） */
  points: Array<{ x: number; y: number }>;
  opacity: number;
  width: number;
}

/** 刃口辉光描述 */
export interface EdgeGlow {
  color: string;
  /** 辉光强度 0-1 */
  intensity: number;
  /** 光晕半径（SVG 单位） */
  radius: number;
}

/** 几何指纹：由几何数据归一化哈希得到，同参数同种子必须完全一致 */
export interface SwordGeometry {
  /** 剑身中轴弧度采样（相对剑柄底端，SVG 坐标，水平方向为 x） */
  spine: Array<{ x: number; y: number }>;
  /** 剑身两侧轮廓路径点（外推的宽度） */
  bladeLeft: Array<{ x: number; y: number }>;
  bladeRight: Array<{ x: number; y: number }>;
  /** 刃尖坐标 */
  tip: { x: number; y: number };
  /** 剑身宽度（靠近剑格处，SVG 单位） */
  baseWidth: number;
  /** 弧度（剑尖相对中轴的横向偏移，带符号） */
  arc: number;
  /** 折叠层数（理论 2^folds，受材质与过炼影响） */
  layers: number;
  /** 实际可见纹理线数 */
  grainLineCount: number;
  grainStyle: GrainStyle;
  grainLines: GrainLine[];
  guardForm: GuardForm;
  gripForm: GripForm;
  /** 淬火可能留下的微裂纹，沿刃口的归一化位置（0=剑格,1=剑尖） */
  cracks: number[];
  glow: EdgeGlow;
  /** 材质主色（hex） */
  bladeColor: string;
  /** 剑刃底色（较亮） */
  edgeColor: string;
}

export interface ForgedSword {
  params: ForgeParams;
  /** 数值种子（参数+用户种子哈希） */
  seedValue: number;
  name: string;
  title: string;
  stats: ForgeStats;
  overforge: Overforge;
  geometry: SwordGeometry;
  /** 属性+几何的综合指纹，十六进制 */
  fingerprint: string;
  forgedAt: string;
}
