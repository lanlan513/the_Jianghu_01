/**
 * 铸剑参数表：材质、淬火介质、火候、折叠的取值与规则常量。
 * 纯数据与纯函数，不依赖 React。
 */

export type MaterialId = 'xuantie' | 'bintie' | 'qingtong' | 'bailian';
export type QuenchId = 'hanquan' | 'songzhi' | 'shouxue' | 'chenlu';
export type GuardShape = 'square' | 'round' | 'wing' | 'diamond';
export type HandleShape = 'round' | 'octagon' | 'flat' | 'spindle';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  desc: string;
  /** 剑身基础弧度（越大越弯） */
  curvature: number;
  /** 属性修正 */
  hardness: number;
  flexibility: number;
  sharpness: number;
  /** 剑身宽度系数 */
  width: number;
  /** 剑格形制 */
  guard: GuardShape;
  guardName: string;
  /** 剑身材质基色 */
  steel: [number, number, number];
  /** 剑格剑首装具色 */
  fitting: [number, number, number];
}

export interface QuenchDef {
  id: QuenchId;
  name: string;
  desc: string;
  /** 基础纹理线数 */
  grainLines: number;
  sharpness: number;
  /** 剑柄形制 */
  handle: HandleShape;
  handleName: string;
  handleColor: [number, number, number];
  /** 淬火蒸汽色（动画用） */
  steam: string;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  xuantie: {
    id: 'xuantie',
    name: '玄铁',
    desc: '陨星所化，沉凝如墨，性刚而直',
    curvature: 0.015,
    hardness: 24,
    flexibility: -8,
    sharpness: 2,
    width: 1.1,
    guard: 'square',
    guardName: '四方玄格',
    steel: [58, 65, 73],
    fitting: [74, 62, 48],
  },
  bintie: {
    id: 'bintie',
    name: '镔铁',
    desc: '西域精镔，隐有霜纹，刚柔相济',
    curvature: 0.05,
    hardness: 12,
    flexibility: 6,
    sharpness: 6,
    width: 1.0,
    guard: 'round',
    guardName: '满月圆格',
    steel: [107, 118, 131],
    fitting: [140, 116, 66],
  },
  qingtong: {
    id: 'qingtong',
    name: '青铜',
    desc: '古法青铜，色蕴金光，弯若偃月',
    curvature: 0.09,
    hardness: 4,
    flexibility: 12,
    sharpness: 0,
    width: 0.96,
    guard: 'wing',
    guardName: '展翼宽格',
    steel: [138, 122, 79],
    fitting: [150, 128, 70],
  },
  bailian: {
    id: 'bailian',
    name: '百炼精钢',
    desc: '百炼成钢，绕指柔肠，弧光流转',
    curvature: 0.14,
    hardness: 8,
    flexibility: 18,
    sharpness: 10,
    width: 0.9,
    guard: 'diamond',
    guardName: '菱花细格',
    steel: [154, 165, 177],
    fitting: [160, 138, 84],
  },
};

export const QUENCHES: Record<QuenchId, QuenchDef> = {
  hanquan: {
    id: 'hanquan',
    name: '寒泉',
    desc: '深潭寒泉，淬之刃纹清疏',
    grainLines: 3,
    sharpness: 12,
    handle: 'round',
    handleName: '浑圆直柄',
    handleColor: [86, 96, 104],
    steam: 'rgba(168, 200, 224, 0.5)',
  },
  songzhi: {
    id: 'songzhi',
    name: '松脂',
    desc: '松脂缓淬，纹如松鳞层叠',
    grainLines: 5,
    sharpness: 7,
    handle: 'octagon',
    handleName: '八方棱柄',
    handleColor: [110, 82, 54],
    steam: 'rgba(190, 170, 130, 0.5)',
  },
  shouxue: {
    id: 'shouxue',
    name: '兽血',
    desc: '猛兽热血，淬之纹密带煞',
    grainLines: 7,
    sharpness: 10,
    handle: 'flat',
    handleName: '扁方缠柄',
    handleColor: [122, 48, 44],
    steam: 'rgba(200, 90, 80, 0.45)',
  },
  chenlu: {
    id: 'chenlu',
    name: '晨露',
    desc: '黎明清露，淬之纹繁似锦',
    grainLines: 9,
    sharpness: 5,
    handle: 'spindle',
    handleName: '纺锤束柄',
    handleColor: [168, 160, 140],
    steam: 'rgba(220, 224, 214, 0.5)',
  },
};

export const MATERIAL_ORDER: MaterialId[] = ['xuantie', 'bintie', 'qingtong', 'bailian'];
export const QUENCH_ORDER: QuenchId[] = ['hanquan', 'songzhi', 'shouxue', 'chenlu'];

export interface ForgeParams {
  material: MaterialId;
  /** 火候 1..10 */
  heat: number;
  /** 折叠次数 1..12 */
  folds: number;
  quench: QuenchId;
  seed: string;
}

export const HEAT_RANGE = { min: 1, max: 10 } as const;
export const FOLD_RANGE = { min: 1, max: 12 } as const;

/** 过炼阈值：火候与折叠同时过高，剑必折损 */
export const OVERFORGE = { heat: 8, folds: 9 } as const;

export function isOverForged(p: Pick<ForgeParams, 'heat' | 'folds'>): boolean {
  return p.heat >= OVERFORGE.heat && p.folds >= OVERFORGE.folds;
}
