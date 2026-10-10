// Small deterministic PRNG (mulberry32).
export class Rng {
  constructor(public s: number = (Math.random() * 2 ** 32) >>> 0) {}
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** integer in [a, b] inclusive */
  int(a: number, b: number) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  range(a: number, b: number) {
    return a + this.next() * (b - a);
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(a: readonly T[]): T | undefined {
    return a.length ? a[Math.floor(this.next() * a.length)] : undefined;
  }
  pickWeighted<T>(a: readonly T[], w: (x: T) => number): T | undefined {
    let sum = 0;
    for (const x of a) sum += Math.max(0, w(x));
    if (sum <= 0) return this.pick(a);
    let r = this.next() * sum;
    for (const x of a) {
      r -= Math.max(0, w(x));
      if (r <= 0) return x;
    }
    return a[a.length - 1];
  }
  shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/** Shared random source for non-deterministic gameplay rolls. */
export const rng = new Rng();
