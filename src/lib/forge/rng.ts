/**
 * 种子驱动的确定性伪随机工具。
 * 纯函数、零依赖、不依赖 React，亦不得使用 Math.random。
 * 同种子必须产生同一序列。
 */

/** 将任意字符串混合为 32 位无符号整数（xmur3 风格）。 */
export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 收尾雪崩，避免短串碰撞过于规律
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  /** 返回 [0, 1) 的浮点伪随机数。 */
  next(): number;
  /** 返回 [min, max] 的整数（闭区间）。 */
  int(min: number, max: number): number;
  /** 返回 [min, max) 的浮点数。 */
  float(min: number, max: number): number;
  /** 从数组中等概率挑一个。 */
  pick<T>(arr: readonly T[]): T;
}

/** mulberry32：小巧、确定性、足够做纹理抖动。 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** 由铸造参数与种子拼出唯一确定的种子数。 */
export function seedFromParts(parts: Array<string | number>): number {
  return hashString(parts.map((p) => String(p)).join('|'));
}
