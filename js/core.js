// 通用工具与全局常量。
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// 色相随深度流转：青紫起步 → 品红 → 金
export const hueAt = t => (0.52 + t * 0.018) % 1;
