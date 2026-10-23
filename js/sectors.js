// 区段（SECTOR）配置与行计划：每 800 米一个区段，色相主题、障碍配方、封锁密度递进。
// 本模块只做纯数据与纯函数（输入 rng），方便 node 单测。

export const SECTOR_LEN = 800;

// 权重 w 仅为相对值；maxBlocked 单排最多同时封几条车道；amb 环境粒子行为
export const SECTORS = [
  { name: '青锚起航', en: 'ANCHOR RUN',   hue: 0.52, orbW: 46, barW: 26, lowW: 28, sweepW: 0,  maxBlocked: 1, amb: 'float' },
  { name: '紫晶回廊', en: 'AMETHYST HALL', hue: 0.76, orbW: 40, barW: 26, lowW: 22, sweepW: 12, maxBlocked: 1, amb: 'float' },
  { name: '熔金峡谷', en: 'MOLTEN CANYON', hue: 0.09, orbW: 36, barW: 28, lowW: 20, sweepW: 16, maxBlocked: 2, amb: 'rise' },
  { name: '相位裂隙', en: 'PHASE RIFT',   hue: 0.44, orbW: 32, barW: 30, lowW: 18, sweepW: 20, maxBlocked: 2, amb: 'fall' },
  { name: '无终超载', en: 'TERMINAL LOAD', hue: 0.9,  orbW: 30, barW: 32, lowW: 16, sweepW: 22, maxBlocked: 2, amb: 'flicker' },
];

// 区段序号：0..4，之后停在「无终超载」但色相继续流转
export function sectorIndexAt(dist) {
  const idx = Math.floor(dist / SECTOR_LEN);
  return Math.min(idx, SECTORS.length - 1);
}

// 区段色相：区段基色 + 深度微移，与全局 hueAt 叠加
export function sectorHueAt(dist) {
  const idx = sectorIndexAt(dist);
  const s = SECTORS[idx];
  const local = (dist % SECTOR_LEN) / SECTOR_LEN;
  return (s.hue + local * 0.06) % 1;
}

// 一排障碍的计划：返回 { kind, lanes } 或 null（空排）。
// rng 用注入函数（测试可控）；保证 lanes 非空且不越过 maxBlocked。
export function planRow(rng, sectorIdx) {
  const s = SECTORS[sectorIdx];
  const total = s.orbW + s.barW + s.lowW + s.sweepW;
  let r = rng() * total;
  if (r < s.orbW) return null;                       // 空排（能量串由外层生成）
  r -= s.orbW;
  let kind = 'bar';
  if (r < s.barW) kind = 'bar';
  else { r -= s.barW; kind = r < s.lowW ? 'low' : 'sweep'; }
  const lanes = [];
  const pool = [0, 1, 2];
  const n = 1 + Math.floor(rng() * s.maxBlocked);    // 1..maxBlocked 条
  if (kind === 'sweep') {
    lanes.push(Math.floor(rng() * 3));               // 扫描闸单车道即可，它自己会动
  } else {
    for (let i = 0; i < n && pool.length; i++) {
      lanes.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
  }
  return { kind, lanes };
}
