// 主编排：状态流转、输入、生成、碰撞、区段推进、OVERDRIVE、暂停与主循环。
import { clamp, hueAt } from './core.js';
import { state, player } from './state.js';
import { renderer, camera, scene, stars, resize } from './scene.js';
import { A, sfx, schedule, seq, beatPulseAt, syncBpm } from './audio.js';
import { SEG_PT, SEG_POINTS, rail, pushControlPoint, ensureTubes, tubeIndexFor, resetTrack } from './track.js';
import {
  ship, pushTrail, setTrailHue, laneOffset, obGroup, obstacles, orbs, gates,
  spawnRow, spawnOrb, spawnGate, laneAt, animateEntities, recycleBehind, clearEntities,
  popBurst, animateBurst,
} from './entities.js';
import { SECTOR_LEN, SECTORS, sectorIndexAt, sectorHueAt, planRow, gradeAt } from './sectors.js';
import { animateAmbience } from './ambience.js';
import { ui, bindUi } from './ui.js';

// ================= 生成：按区段配方向前铺内容 =================
function spawnAhead() {
  const P = rail.pts.length - 1;
  const horizonM = player.dist + 170;
  while (state.nextSpawnM < horizonM) {
    const m = state.nextSpawnM;
    const t = m / (P * SEG_PT);
    const tubeIdx = clamp(Math.floor(t * P / SEG_POINTS), 0, rail.tubes.length - 1);
    const seg = rail.tubes[tubeIdx];
    if (!seg || !seg.curve) { state.nextSpawnM += 12; continue; }
    const localT = clamp((t * P - seg.fromIdx) / SEG_POINTS, 0, 1);
    const secIdx = sectorIndexAt(m);
    const plan = planRow(Math.random, secIdx);
    if (plan) {
      for (const l of plan.lanes) spawnRow(localT, l, plan.kind, seg.curve, m);
    } else {
      // 能量串：3~5 颗连排，诱导向安全线走；掉盾时小概率在串中混入护盾回充棱镜
      const lane = Math.floor(Math.random() * 3);
      const n = 3 + Math.floor(Math.random() * 3);
      const heal = state.shields < 3 && Math.random() < 0.05;
      for (let i = 0; i < n; i++) {
        const kind = heal && i === Math.floor(n / 2) ? 'heal' : 'energy';
        spawnOrb(clamp(localT + (i * 5) / (P * SEG_PT), 0, 1), lane, seg.curve, m + i * 5, kind);
      }
    }
    // 区段门：每 800 米一道
    while (state.nextGateM < horizonM) {
      const gt = state.nextGateM / (P * SEG_PT);
      const gIdx = clamp(Math.floor(gt * P / SEG_POINTS), 0, rail.tubes.length - 1);
      const gSeg = rail.tubes[gIdx];
      if (gSeg && gSeg.curve) {
        const gLocal = clamp((gt * P - gSeg.fromIdx) / SEG_POINTS, 0, 1);
        spawnGate(gLocal, gSeg.curve, state.nextGateM, Math.round(state.nextGateM / SECTOR_LEN));
        state.nextGateM += SECTOR_LEN;
      } else break;
    }
    state.nextSpawnM += 14 + Math.random() * 12;
  }
}

// ================= 得分与打击反馈 =================
function scoreMult() { return 1 + Math.floor(state.combo / 5) + (state.overdrive > 0 ? 1 : 0); }

function collect(o) {
  o.taken = true;
  if (o.kind === 'heal') {
    state.shields = Math.min(3, state.shields + 1);
    ui.renderShield();
    sfx.heal();
    popBurst(o.mesh.position, 0x4fff8a);
    ui.showMsg('护盾回充 +1', 800);
    return;
  }
  state.orbsTaken++;
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.score += 100 * scoreMult();
  sfx.pick(state.combo);
  popBurst(o.mesh.position, 0xffe95c);
  if (state.combo >= 10) ui.showMsg('×' + Math.floor(state.combo / 5 + 1) + ' 连击同调！');
}

function hitObstacle(o) {
  state.combo = 0;
  state.invuln = 1.2;
  state.shake = 1;
  ui.flash('hit');
  popBurst(o.mesh.position, 0xff2450);
  if (state.overdrive > 0) {
    // 过载中无敌：只击碎障碍不解体护盾
    sfx.crash();
  } else if (state.shields > 0) {
    state.shields--;
    sfx.crash();
    state.speed = Math.max(30, state.speed * 0.75);
  } else {
    die();
  }
  if (o.mesh) { obGroup.remove(o.mesh); o.mesh = null; }
  ui.renderShield();
}

// ================= 区段推进 =================
function checkGate() {
  for (const g of gates) {
    if (g.passed || g.globalM > player.dist) continue;
    g.passed = true;
    // 门序号随距离无限增长，但区段表只有 5 段——索引一律 clamp 到终段「无终超载」
    state.sector = Math.min(g.idx, SECTORS.length - 1);
    const sec = SECTORS[state.sector];
    ui.announceSector(`SECTOR ${String(g.idx + 1).padStart(2, '0')} · ${sec.name}`);
    ui.setSectorTag(`S${g.idx + 1} ${sec.name}`);
    ui.flash('gate');
    sfx.gate();
    camera.fov = 86; camera.updateProjectionMatrix();   // 过门 fov 冲击
    popBurst(ship.position, new THREE.Color().setHSL(sec.hue, 1, 0.6).getHex());
  }
}

// ================= OVERDRIVE =================
function checkOverdrive() {
  if (state.overdrive > 0) {
    state.overdrive -= dtGlobal;
    if (state.overdrive <= 0) {
      state.overdrive = 0;
      ui.showMsg('过载结束 · 同调保持', 700);
    }
    return;
  }
  if (!state.overdriveUsed && state.combo >= 20) {
    state.overdriveUsed = true;
    state.overdrive = 8;
    state.invuln = Math.max(state.invuln, 0.6);
    sfx.overdrive();
    ui.announceSector('⟪ OVERDRIVE ⟫');
    ui.flash('od');
    ui.showMsg('信号过载 · 得分翻倍 · 8 秒', 1400);
    camera.fov = 88; camera.updateProjectionMatrix();
  }
}

// ================= 流程 =================
function setMode(m) {
  state.mode = m;
  document.body.classList.toggle('playing', m === 'play');
}

function reset() {
  resetTrack();
  clearEntities();
  player.tParam = 0; player.lane = 1; player.laneT = 1; player.jumpT = 9; player.dist = 0;
  state.speed = 46; state.score = 0; state.combo = 0; state.shields = 3; state.invuln = 0;
  state.nextSpawnM = 30; state.nextGateM = SECTOR_LEN;
  state.maxCombo = 0; state.nearMisses = 0; state.orbsTaken = 0;
  state.sector = 0; state.overdrive = 0; state.overdriveUsed = false;
  ui.renderShield();
  ui.setOverdrive(false);
  ui.setScore(0); ui.setCombo(0); ui.setSectorTag(`S1 ${SECTORS[0].name}`);
  camera.fov = 78;
}

function start() {
  A.init();
  if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  if (A.ok) { seq.nextBeat = A.ctx.currentTime + 0.1; seq.beat = 0; }
  reset();
  setMode('play');
  ui.hideTitle();
  ui.hideDeath();
  ui.hidePause();
}

function die() {
  setMode('dead');
  deadAt = performance.now();
  ui.setOverdrive(false);
  sfx.boom();
  popBurst(ship.position, 0xff4fd8);
  const score = state.score + Math.floor(player.dist * 2);
  const best = Math.max(score, +(localStorage.getItem('pulse_best') || 0));
  localStorage.setItem('pulse_best', best);
  const sec = SECTORS[Math.min(state.sector, SECTORS.length - 1)];
  ui.showDeath(score, best, {
    dist: player.dist, maxCombo: state.maxCombo, nearMisses: state.nearMisses,
    sectorName: `S${Math.min(state.sector, SECTORS.length - 1) + 1} ${sec.name}`,
    grade: gradeAt(player.dist),
  });
}

// ================= 暂停 =================
function setPause(on) {
  if (on && state.mode === 'play') {
    setMode('pause');
    if (A.ok) A.ctx.suspend();
    ui.showPause();
  } else if (!on && state.mode === 'pause') {
    setMode('play');
    if (A.ok) A.ctx.resume();
    ui.hidePause();
    last = performance.now();   // 暂停期间积累的真实时间不带入 dt
  }
}

// ================= 输入 =================
const keys = {};
let deadAt = 0;
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    setPause(state.mode === 'play');
    return;
  }
  if ((e.code === 'Space' || e.code === 'Enter')) {
    if (state.mode === 'title') { start(); e.preventDefault(); return; }
    if (state.mode === 'dead' && performance.now() - deadAt > 600) { start(); e.preventDefault(); return; }
  }
  if (state.mode !== 'play') return;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') { player.lane = Math.max(0, player.lane - 1); sfx.jump(); }
  if (e.code === 'KeyD' || e.code === 'ArrowRight') { player.lane = Math.min(2, player.lane + 1); sfx.jump(); }
  if (e.code === 'Space') { if (player.jumpT > 0.9) { player.jumpT = 0; sfx.jump(); } e.preventDefault(); }
});
window.addEventListener('keyup', e => (keys[e.code] = false));
window.addEventListener('blur', () => setPause(true));

// 触控：下半屏点击立即变道；上半屏点按跳、向上滑也跳（真滑动检测）
const touchTrack = {};
document.getElementById('touch').addEventListener('touchstart', e => {
  if (state.mode !== 'play') return;
  for (const t of e.changedTouches) {
    touchTrack[t.identifier] = { x: t.clientX, y: t.clientY, swiped: false };
  }
  e.preventDefault();
}, { passive: false });
document.getElementById('touch').addEventListener('touchmove', e => {
  if (state.mode !== 'play') return;
  for (const t of e.changedTouches) {
    const tr = touchTrack[t.identifier];
    if (!tr || tr.swiped) continue;
    if (t.clientY - tr.y < -28 && player.jumpT > 0.9) {   // 上滑超过 28px → 跳
      tr.swiped = true;
      player.jumpT = 0;
      sfx.jump();
    }
  }
  e.preventDefault();
}, { passive: false });
document.getElementById('touch').addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    const tr = touchTrack[t.identifier];
    delete touchTrack[t.identifier];
    if (!tr || state.mode !== 'play') continue;
    if (tr.swiped) continue;
    const startY = tr.y;
    if (startY < window.innerHeight * 0.55) {
      if (player.jumpT > 0.9) { player.jumpT = 0; sfx.jump(); }
    } else if (tr.x < window.innerWidth / 2) {
      player.lane = Math.max(0, player.lane - 1);
      sfx.jump();
    } else {
      player.lane = Math.min(2, player.lane + 1);
      sfx.jump();
    }
  }
});

bindUi({
  onResume: () => setPause(false),
  onRestart: () => { ui.hidePause(); if (A.ok) A.ctx.resume(); start(); },
  onQuit: () => {
    ui.hidePause();
    if (A.ok) A.ctx.resume();
    reset();
    setMode('title');
    ui.showTitle();
  },
});
document.getElementById('btnStart').addEventListener('click', start);
document.getElementById('btnAgain').addEventListener('click', () => { deadAt = 0; start(); });
document.getElementById('btnPause').addEventListener('click', () => setPause(true));

// 基础视场角随速度拉伸：速度感的一半来自视野
function baseFov() { return 78 + (state.speed - 46) / 50 * 6; }

// ================= 主循环 =================
let last = performance.now();
let dtGlobal = 0;
let pulse = 0;
const camTarget = new THREE.Vector3();

function loop(now) {
  requestAnimationFrame(loop);
  try {
    tick(now);
  } catch (err) {
    // rAF 内的异常默认静默：转发到标题，开发期立刻可见
    document.title = 'LOOP ERR: ' + String(err && err.message).slice(0, 120);
    throw err;
  }
}

function tick(now) {
  dtGlobal = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (state.mode === 'pause') return;   // 冻结：不推进也不重排（渲染最后一帧留在画布上）
  state.time += dtGlobal;
  schedule();
  if (A.ok) {
    const now2 = A.ctx.currentTime;
    while (beatPulseAt.length && beatPulseAt[0] <= now2) { beatPulseAt.shift(); pulse = 1; }
  }
  pulse = Math.max(0, pulse - dtGlobal * 3.4);

  if (state.mode === 'title') {
    // 标题机位：悬在回廊内部，沿轨道看延伸进星空的发光环
    scene.fog.density = 0.006;
    const t = state.time;
    camera.position.set(Math.sin(t * 0.11) * 2.2, 2.6 + Math.sin(t * 0.07) * 0.8, 10);
    camera.lookAt(Math.sin(t * 0.06) * 3, 0.8, -80);
    animateEntities(dtGlobal, state.time);
    renderer.render(scene, camera);
    return;
  }
  scene.fog.density = 0.012;

  if (state.mode === 'play') {
    // 速度渐升 + BPM 跟随
    state.speed = Math.min(96, state.speed + dtGlobal * 1.15);
    syncBpm();
    ui.setSpeed(state.speed);

    // 前进：tParam 按弧长推进（控制点间距恒定 → 粗略均匀）
    const P = rail.pts.length - 1;
    const dtT = (state.speed * dtGlobal) / (P * SEG_PT);
    player.tParam += dtT;
    player.dist += state.speed * dtGlobal;
    player.laneT += (player.lane - player.laneT) * Math.min(1, dtGlobal * 12);
    player.jumpT += dtGlobal * 1.8;

    // 保证轨道前方足够长（有限生长：玩家参数 + 40 个控制点）
    const targetPts = Math.floor(player.tParam * P) + 40;
    while (rail.pts.length - 1 < Math.max(40, targetPts)) pushControlPoint();
    ensureTubes(player.tParam);
    spawnAhead();

    // 相机与飞船定位：沿当前 Tube 曲线
    const seg = tubeIndexFor(player.tParam);
    if (seg) {
      const curve = seg.curve;
      const localT = clamp((player.tParam * P - seg.fromIdx) / SEG_POINTS, 0, 1);
      const pt = curve.getPointAt(localT);
      const tan = curve.getTangentAt(localT).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const binorm = new THREE.Vector3().crossVectors(up, tan).normalize();
      const jumpY = player.jumpT < 1 ? Math.sin(player.jumpT * Math.PI) * 1.5 : 0;
      const pos = pt.clone().add(binorm.clone().multiplyScalar(laneOffset(player.laneT)));
      pos.y += 1.05 + jumpY;
      ship.position.copy(pos);
      ship.lookAt(pos.clone().add(tan));
      ship.rotation.z += (player.lane - player.laneT) * -0.55;   // 变道侧倾
      const camPos = pt.clone().add(tan.clone().multiplyScalar(-6.2)).add(binorm.clone().multiplyScalar(laneOffset(player.laneT) * 0.5));
      camPos.y += 3.1 + jumpY * 0.5;
      if (state.shake > 0) {
        camPos.x += (Math.random() - 0.5) * state.shake * 0.5;
        camPos.y += (Math.random() - 0.5) * state.shake * 0.5;
        state.shake = Math.max(0, state.shake - dtGlobal * 3);
      }
      camera.position.copy(camPos);
      camTarget.copy(pos).add(tan.clone().multiplyScalar(6)).add(new THREE.Vector3(0, 1.2, 0));
      camera.lookAt(camTarget);
      // fov 冲击回弹：目标随速度拉伸（过门 / OVERDRIVE 的冲高慢慢回落到基线）
      const target = baseFov();
      if (Math.abs(camera.fov - target) > 0.05) {
        camera.fov = camera.fov > target
          ? Math.max(target, camera.fov - dtGlobal * 26)
          : Math.min(target, camera.fov + dtGlobal * 8);   // 提速时平滑张开
        camera.updateProjectionMatrix();
      }
      pushTrail(pos, tan);
      setTrailHue(sectorHueAt(player.dist));
    }

    // 碰撞与收集：按全局米数判定
    if (seg) {
      const playerM = player.dist;
      for (const o of obstacles) {
        if (!o.mesh || Math.abs(o.globalM - playerM) > 2.4) continue;
        const oLane = laneAt(o, state.time);
        const laneGap = Math.abs(oLane - player.laneT);
        const laneHit = o.kind === 'sweep' ? laneGap < 0.75 : laneGap < 0.6;
        const jumpOk = o.kind === 'low' && player.jumpT < 0.62;
        if (laneHit && !jumpOk && state.invuln <= 0) { hitObstacle(o); continue; }
        // 擦身而过：跨过障碍的那一帧贴着边（侧向 0.6~1.15 或同道跳过低杆），奖励手感分
        if (!o.nearMiss && o.globalM < playerM && (laneGap < 1.15 || (jumpOk && laneGap < 0.6))) {
          o.nearMiss = true;
          state.nearMisses++;
          state.combo++;
          state.maxCombo = Math.max(state.maxCombo, state.combo);
          state.score += 150 * (state.overdrive > 0 ? 2 : 1);
          sfx.pick(state.combo);
          ui.showMsg('擦身而过 +150', 700);
        }
      }
      for (const o of orbs) {
        if (o.taken || Math.abs(o.globalM - playerM) > 2.6 || Math.abs(o.lane - player.laneT) > 0.55) continue;
        if (player.jumpT < 0.55) collect(o);
      }
      checkGate();
      checkOverdrive();
    }
  state.invuln = Math.max(0, state.invuln - dtGlobal);
  ui.setOverdrive(state.overdrive > 0);
  animateEntities(dtGlobal, state.time);
  animateAmbience(dtGlobal, state.time);
  recycleBehind();

    // HUD
    ui.setScore(state.score + Math.floor(player.dist * 2));
    ui.setCombo(state.combo);
  }

  animateBurst(dtGlobal);

  // 发光环随节拍呼吸
  const ringScale = 1 + pulse * 0.05;
  for (const ring of rail.rings) {
    ring.scale.setScalar(ringScale);
    ring.material.opacity = 0.45 + pulse * 0.5;
  }
  // 星野滚动 + 雾色随区段流转（OVERDRIVE 时提亮）
  stars.position.z = (state.time * 6) % 500;
  const hue = sectorHueAt(player.dist);
  const od = state.overdrive > 0;
  scene.fog.color.setHSL((hue + 0.2) % 1, 0.7, (od ? 0.09 : 0.045) + pulse * 0.02);

  renderer.render(scene, camera);
}

// 调试把手：控制台可读改 state / player（?debug=1 才暴露）
if (new URLSearchParams(location.search).has('debug')) {
  window.__pulse = { state, player, SECTOR_LEN, gates, obstacles, orbs };
}

// 标题背景：铺一段轨道悬停展示
try {
  reset();
  resize();
  ui.showTitle();
} catch (err) {
  document.title = 'BOOT ERR: ' + (err && err.stack ? err.stack.split('\n')[0] : err);
}
requestAnimationFrame(loop);
