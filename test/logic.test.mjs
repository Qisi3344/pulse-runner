// 纯逻辑测试：node test/logic.test.mjs
import assert from 'node:assert/strict';
import { SECTOR_LEN, SECTORS, sectorIndexAt, sectorHueAt, planRow } from '../js/sectors.js';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + ' :: ' + e.message); }
}

// ---- 配置完整性 ----
t('区段表至少 5 段且权重为非负数', () => {
  assert.ok(SECTORS.length >= 5);
  for (const s of SECTORS) {
    for (const k of ['orbW', 'barW', 'lowW', 'sweepW', 'maxBlocked']) {
      assert.equal(typeof s[k], 'number');
      assert.ok(s[k] >= 0);
    }
    assert.ok(s.maxBlocked >= 1 && s.maxBlocked <= 3);
  }
});

// ---- sectorIndexAt ----
t('距离 0 属于第 1 区段', () => assert.equal(sectorIndexAt(0), 0));
t('区段长度边界：SECTOR_LEN-1 仍属第 1 段', () => assert.equal(sectorIndexAt(SECTOR_LEN - 1), 0));
t('跨过 800m 进入第 2 区段', () => assert.equal(sectorIndexAt(SECTOR_LEN), 1));
t('跨过两道门进入第 3 区段', () => assert.equal(sectorIndexAt(SECTOR_LEN * 2 + 1), 2));
t('超出表长后停在最后一区段（不越界）', () => {
  assert.equal(sectorIndexAt(SECTOR_LEN * 99), SECTORS.length - 1);
});

// ---- sectorHueAt ----
t('区段色相始终在 [0,1)', () => {
  for (let m = 0; m < SECTOR_LEN * 12; m += 37) {
    const h = sectorHueAt(m);
    assert.ok(h >= 0 && h < 1, 'hue=' + h + ' at ' + m);
  }
});

// ---- planRow：确定性 rng 下行为可验证 ----
function seqRng(vals) { let i = 0; return () => vals[i++ % vals.length]; }

t('第 1 区段（sweepW=0）永不生成扫描闸', () => {
  // 全部返回 0.999 → 落在最高权重槽；S1 的最高槽不可能是 sweep
  for (let i = 0; i < 200; i++) {
    const plan = planRow(Math.random, 0);
    if (plan) assert.notEqual(plan.kind, 'sweep');
  }
});
t('扫描闸配方永远是单车道', () => {
  for (let i = 0; i < 300; i++) {
    const plan = planRow(Math.random, 2);   // 熔金峡谷：sweepW=16
    if (plan && plan.kind === 'sweep') assert.equal(plan.lanes.length, 1);
  }
});
t('车道数不越过 maxBlocked 且不重复', () => {
  for (let si = 0; si < SECTORS.length; si++) {
    for (let i = 0; i < 400; i++) {
      const plan = planRow(Math.random, si);
      if (!plan) continue;
      assert.ok(plan.lanes.length >= 1, 'lanes 非空');
      assert.ok(plan.lanes.length <= SECTORS[si].maxBlocked, 'len=' + plan.lanes.length + ' max=' + SECTORS[si].maxBlocked);
      assert.deepEqual([...new Set(plan.lanes)].sort(), [...plan.lanes].sort(), 'lanes 去重');
      for (const l of plan.lanes) assert.ok(l >= 0 && l <= 2, 'lane 范围');
    }
  }
});
t('保底可通行：任何一排都不可能封死 3 条车道', () => {
  for (let si = 0; si < SECTORS.length; si++) {
    for (let i = 0; i < 500; i++) {
      const plan = planRow(Math.random, si);
      if (!plan || plan.kind === 'sweep') continue;   // 扫描闸自己会走
      assert.ok(plan.lanes.length < 3, '第' + si + '区段封死：' + plan.lanes);
    }
  }
});
t('确定性 rng 产生确定性计划（回归保护）', () => {
  const a = planRow(seqRng([0.5, 0.5, 0.5]), 1);
  const b = planRow(seqRng([0.5, 0.5, 0.5]), 1);
  assert.deepEqual(a, b);
});
t('空排（能量串槽位）返回 null', () => {
  // rng 恒 0 → r=0 落入 orbW 槽（第一个槽），返回 null
  assert.equal(planRow(() => 0, 0), null);
});

// ---- 分布统计：配方改权重时的回归保护 ----
t('分布统计：各区段 kind 占比与权重一致（±8pp 容差）', () => {
  for (let si = 0; si < SECTORS.length; si++) {
    const s = SECTORS[si];
    const total = s.orbW + s.barW + s.lowW + s.sweepW;
    const N = 6000;
    const count = { bar: 0, low: 0, sweep: 0 };
    for (let i = 0; i < N; i++) {
      const plan = planRow(Math.random, si);
      if (plan) count[plan.kind]++;
    }
    // 条件分布：排除空排后各障碍 kind 的占比
    const denom = count.bar + count.low + count.sweep;
    for (const k of ['bar', 'low', 'sweep']) {
      const expect = s[k + 'W'] / (s.barW + s.lowW + s.sweepW);
      const actual = count[k] / denom;
      assert.ok(
        Math.abs(actual - expect) < 0.08,
        `S${si + 1} ${k}: expect≈${expect.toFixed(2)} actual=${actual.toFixed(2)}`
      );
    }
    // 空排占比
    const orbShare = 1 - denom / N;
    assert.ok(Math.abs(orbShare - s.orbW / total) < 0.03, `S${si + 1} orbShare=${orbShare.toFixed(2)}`);
  }
});
t('S1 完全没有扫描闸（大量采样为零）', () => {
  let sweeps = 0;
  for (let i = 0; i < 4000; i++) {
    const plan = planRow(Math.random, 0);
    if (plan && plan.kind === 'sweep') sweeps++;
  }
  assert.equal(sweeps, 0);
});
t('扫描闸密度随区段递增（S5 > S3 > S2）', () => {
  const rate = si => {
    let n = 0, d = 0;
    for (let i = 0; i < 6000; i++) {
      const plan = planRow(Math.random, si);
      if (plan) { d++; if (plan.kind === 'sweep') n++; }
    }
    return n / d;
  };
  assert.ok(rate(4) > rate(2), `S5=${rate(4).toFixed(2)} S3=${rate(2).toFixed(2)}`);
  assert.ok(rate(2) > rate(1), `S3=${rate(2).toFixed(2)} S2=${rate(1).toFixed(2)}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
