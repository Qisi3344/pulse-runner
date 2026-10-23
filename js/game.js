// 脉冲回廊 PULSE RUNNER —— 纯代码 synthwave 霓虹隧道节奏跑酷。
// 一条不断向前生长的样条轨道，隧道、障碍、能量块、粒子全部程序生成；
// WebAudio 步进音序器合成 synthwave 节拍，障碍与收集随节拍落位。
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ================= 音序器（synthwave：kick / hat / bass / arp） =================
  const A = { ok: false, bpm: 122 };
  A.init = function () {
    if (A.ok) return;
    try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const ctx = A.ctx;
    A.master = ctx.createGain(); A.master.gain.value = 0.72;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 7;
    A.master.connect(comp); comp.connect(ctx.destination);
    // 主延迟：给琶音一点空间感
    A.delay = ctx.createDelay(0.6);
    A.delay.delayTime.value = (60 / A.bpm) * 0.75;
    const dg = ctx.createGain(); dg.gain.value = 0.22;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    A.delay.connect(dlp); dlp.connect(dg); dg.connect(A.master);
    A.ok = true;
  };
  function at(t) { return A.ctx.currentTime + Math.max(0, t); }
  function kick(t) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.13);
    g.gain.setValueAtTime(0.95, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.3);
  }
  function hat(t, open) {
    const src = A.ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = open ? 7000 : 8800;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(open ? 0.16 : 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.16 : 0.045));
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(t); src.stop(t + 0.2);
  }
  function bass(t, midi, dur) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(240, t + dur);
    f.Q.value = 6;
    g.gain.setValueAtTime(0.26, t); g.gain.setValueAtTime(0.26, t + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function arp(t, midi) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'square'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.055, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(A.master); g.connect(A.delay);
    o.start(t); o.stop(t + 0.2);
  }
  const sfx = {
    pick: combo => {
      if (!A.ok) return;
      const t = A.ctx.currentTime;
      const midi = 76 + Math.min(12, combo) * 0.5;
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(A.master); g.connect(A.delay); o.start(t); o.stop(t + 0.2);
    },
    crash: () => {
      if (!A.ok) return;
      const t = A.ctx.currentTime;
      const src = A.ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
      const f = A.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      src.connect(f); f.connect(g); g.connect(A.master); src.start(t); src.stop(t + 0.45);
    },
    boom: () => {
      if (!A.ok) return;
      const t = A.ctx.currentTime;
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(24, t + 1.1);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 1.4);
    },
    jump: () => {
      if (!A.ok) return;
      const t = A.ctx.currentTime;
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.12);
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.2);
    },
  };
  // 16 步音序（Am F C G 的 synthwave 走向）
  const PROG = [45, 41, 48, 43];           // A2 F2 C3 G2 根音
  const ARP_STEPS = [69, 72, 76, 72, 69, 76, 81, 76, 69, 72, 76, 72, 67, 72, 76, 79];
  const seq = { nextBeat: 0, beat: 0, bar: 0 };
  function schedule() {
    if (!A.ok) return;
    const ahead = A.ctx.currentTime + 0.28;
    while (seq.nextBeat < ahead) {
      const t = seq.nextBeat;
      const step = seq.beat % 4, barStep = seq.beat % 16;
      if (step === 0) kick(t);
      if (seq.beat % 2 === 0) hat(t, false); else if (seq.beat % 8 === 3) hat(t, true);
      if (step === 0 || step === 2) bass(t, PROG[Math.floor(seq.beat / 4) % 4] + (step === 2 ? 12 : 0), (60 / A.bpm) * 0.9);
      arp(t, ARP_STEPS[barStep] + 12);
      // 给游戏循环一个节拍脉冲信号（提前通知）
      beatPulseAt.push(t);
      seq.nextBeat += (60 / A.bpm) / 2;      // 八分音符
      seq.beat++;
    }
  }

  // ================= 轨道曲线 =================
  // 一条向前生长的 CatmullRom 样条：控制点每 24 米一个，heading 按段弯折。
  const SEG_PT = 24;             // 控制点间距
  const TUBE_RADIUS = 5.2;
  const rings = [];
  const rail = {
    pts: [], heading: 0, pitch: 0,
    tubes: [],                   // { mesh, wire, fromIdx, toIdx, curve }
    rings: [],
    tGen: 0,                     // 已生成的控制点数
  };
  function pushControlPoint() {
    const r = Math.random();
    if (r < 0.3) rail.heading += (Math.random() < 0.5 ? 1 : -1) * (0.25 + Math.random() * 0.3);
    if (Math.random() < 0.25) rail.pitch = clamp(rail.pitch + (Math.random() - 0.5) * 0.24, -0.35, 0.35);
    rail.pitch *= 0.94;
    const last = rail.pts[rail.pts.length - 1] ?? new THREE.Vector3(0, 0, 0);
    const p = new THREE.Vector3(
      last.x + Math.sin(rail.heading) * Math.cos(rail.pitch) * SEG_PT,
      last.y + Math.sin(rail.pitch) * SEG_PT,
      last.z - Math.cos(rail.heading) * Math.cos(rail.pitch) * SEG_PT
    );
    rail.pts.push(p);
    rail.tGen++;
  }
  const hueAt = t => (0.52 + t * 0.018) % 1;   // 色相从青紫起步随深度流转

  function buildTube(fromIdx, toIdx) {
    const c = new THREE.CatmullRomCurve3(rail.pts.slice(fromIdx, toIdx + 1), false, 'catmullrom', 0.4);
    const geo = new THREE.TubeGeometry(c, 96, TUBE_RADIUS, 26, false);
    const hue = hueAt(fromIdx * SEG_PT);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.75, 0.055) });
    const mesh = new THREE.Mesh(geo, mat);
    // 霓虹网格线：同管子的线框叠加
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(hue, 1, 0.6), wireframe: true, transparent: true, opacity: 0.42,
    }));
    // 接缝处的发光环：随节拍脉动（存进 rings 统一动画）
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(TUBE_RADIUS * 0.985, 0.07, 8, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((hue + 0.08) % 1, 1, 0.62), fog: false, transparent: true, opacity: 0.85 })
    );
    ring.position.copy(rail.pts[fromIdx]);
    ring.lookAt(rail.pts[Math.min(toIdx, rail.pts.length - 1)]);
    scene.add(ring);
    rings.push(ring);
    scene.add(mesh); scene.add(wire);
    rail.tubes.push({ mesh, wire, fromIdx, toIdx });
    return c;
  }

  // ================= 场景与对象池 =================
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, 1, 0.1, 400);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));

  // 星野
  const starGeo = new THREE.BufferGeometry();
  {
    const N = 900, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU, r = 120 + Math.random() * 180;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r * 0.7 + 20;
      pos[i * 3 + 2] = -Math.random() * 500;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8fb0ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75 }));
  scene.add(stars);

  // 玩家飞船（纯几何拼装：锥体机头 + 双翼 + 尾焰）
  const ship = new THREE.Group();
  {
    const neon = (geo, color) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    const body = neon(new THREE.ConeGeometry(0.5, 1.7, 6), 0x00f0ff);
    body.rotation.x = Math.PI / 2;
    ship.add(body);
    for (const s of [-1, 1]) {
      const wing = neon(new THREE.BoxGeometry(1.5, 0.08, 0.7), 0xb96bff);
      wing.position.set(s * 0.8, 0, -0.3);
      wing.rotation.z = s * 0.22;
      ship.add(wing);
      const tip = neon(new THREE.BoxGeometry(0.16, 0.3, 0.5), 0xff4fd8);
      tip.position.set(s * 1.5, 0.08, -0.45);
      ship.add(tip);
    }
    const fin = neon(new THREE.BoxGeometry(0.08, 0.55, 0.7), 0xb96bff);
    fin.position.set(0, 0.4, -0.55);
    ship.add(fin);
  }
  // 尾焰粒子
  const trail = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
    color: 0x66e0ff, size: 0.36, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const TRAIL_N = 90;
  trail.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
  const trailPos = trail.geometry.attributes.position.array;
  let trailHead = 0;
  for (let i = 0; i < TRAIL_N; i++) { trailPos[i * 3 + 1] = -999; }
  scene.add(trail);
  scene.add(ship);

  // 障碍与能量块（对象按轨道 t 存放）
  const obstacles = [];   // { t, lane, kind: 'bar'|'low', mesh }
  const orbs = [];        // { t, lane, mesh, taken }
  const obGroup = new THREE.Group(); scene.add(obGroup);

  function laneOffset(lane) { return (lane - 1) * 2.6; }

  function spawnRow(localT, lane, kind, curve, globalM) {
    const pt = curve.getPointAt(localT);
    const tan = curve.getTangentAt(localT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const binorm = new THREE.Vector3().crossVectors(up, tan).normalize();
    const pos = pt.clone().add(binorm.clone().multiplyScalar(laneOffset(lane)));
    let mesh;
    if (kind === 'bar') {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 2.2, 0.35),
        new THREE.MeshBasicMaterial({ color: 0xff2450, fog: false })
      );
      const wire = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 0.4), new THREE.MeshBasicMaterial({ color: 0xff6f9c, wireframe: true, fog: false }));
      mesh.add(wire);
      mesh.position.copy(pos).add(up.clone().multiplyScalar(1.2));
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.5, 0.35),
        new THREE.MeshBasicMaterial({ color: 0xff2450, fog: false })
      );
      const wire = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 0.4), new THREE.MeshBasicMaterial({ color: 0xff6f9c, wireframe: true, fog: false }));
      mesh.add(wire);
      mesh.position.copy(pos).add(up.clone().multiplyScalar(0.4));
    }
    mesh.lookAt(pos.clone().add(tan));
    obGroup.add(mesh);
    obstacles.push({ localT, lane, kind, mesh, globalM, nearMiss: false });
  }

  function spawnOrb(localT, lane, curve, globalM) {
    const pt = curve.getPointAt(localT);
    const tan = curve.getTangentAt(localT).normalize();
    const binorm = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();
    const pos = pt.clone().add(binorm.clone().multiplyScalar(laneOffset(lane))).add(new THREE.Vector3(0, 1.1, 0));
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshBasicMaterial({ color: 0xffe95c, fog: false }));
    const glow = new THREE.PointLight(0xffe95c, 0.8, 6, 2);
    mesh.add(glow);
    mesh.position.copy(pos);
    obGroup.add(mesh);
    orbs.push({ localT, lane, mesh, taken: false, spin: Math.random() * TAU, globalM });
  }

  // 碎裂粒子（爆一次生成一簇，命中后回收）
  const burst = { active: false, t: 0, pts: null, vel: [] };
  const burstGeo = new THREE.BufferGeometry();
  const BURST_N = 60;
  burstGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_N * 3), 3));
  const burstPoints = new THREE.Points(burstGeo, new THREE.PointsMaterial({
    color: 0xff2450, size: 0.5, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  burstPoints.visible = false;
  scene.add(burstPoints);
  function popBurst(pos, color) {
    const arr = burstGeo.attributes.position.array;
    burst.vel = [];
    for (let i = 0; i < BURST_N; i++) {
      arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
      const a = Math.random() * TAU, b = Math.random() * Math.PI - Math.PI / 2, sp = 4 + Math.random() * 9;
      burst.vel.push(new THREE.Vector3(Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp, Math.sin(a) * Math.cos(b) * sp));
    }
    burstPoints.material.color.set(color);
    burstGeo.attributes.position.needsUpdate = true;
    burst.active = true; burst.t = 0;
    burstPoints.visible = true;
  }

  // ================= 输入 =================
  const player = { lane: 1, laneT: 1, jumpT: 9, tParam: 0, dist: 0 };
  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (state.mode !== 'play') return;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { player.lane = Math.max(0, player.lane - 1); sfx.jump(); }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') { player.lane = Math.min(2, player.lane + 1); sfx.jump(); }
    if (e.code === 'Space') { if (player.jumpT > 0.9) { player.jumpT = 0; sfx.jump(); } e.preventDefault(); }
  });
  window.addEventListener('keyup', e => (keys[e.code] = false));
  document.getElementById('touch').addEventListener('touchstart', e => {
    if (state.mode !== 'play') return;
    const t0 = e.changedTouches[0];
    const h = window.innerHeight;
    if (t0.clientY < h * 0.55 && player.jumpT > 0.9) { player.jumpT = 0; sfx.jump(); return; }
    if (t0.clientX < window.innerWidth / 2) player.lane = Math.max(0, player.lane - 1);
    else player.lane = Math.min(2, player.lane + 1);
    sfx.jump();
    e.preventDefault();
  }, { passive: false });

  // ================= 状态 =================
  const state = { mode: 'title', speed: 46, score: 0, combo: 0, shields: 3, invuln: 0, nextSpawnM: 30, time: 0, shake: 0 };
  const beatPulseAt = [];      // 排定的节拍时刻（audio 时钟）
  let pulse = 0;               // 0..1 节拍脉冲包络

  // 生成节拍内容：按米制距离排布（前方 160 米内），障碍与能量串随「节拍」落位
  function spawnAhead() {
    const P = rail.pts.length - 1;
    const horizonM = player.dist + 170;
    while (state.nextSpawnM < horizonM) {
      const m = state.nextSpawnM;
      const t = m / (P * SEG_PT);                       // 全局曲线参数
      const tubeIdx = clamp(Math.floor(t * P / 5), 0, rail.tubes.length - 1);
      const seg = rail.tubes[tubeIdx];
      if (!seg || !seg.curve) { state.nextSpawnM += 12; continue; }
      const localT = clamp((t * P - seg.fromIdx) / 5, 0, 1);
      const r = Math.random();
      if (r < 0.42) {
        const lane = Math.floor(Math.random() * 3);
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) spawnOrb(clamp(localT + (i * 5) / (P * SEG_PT), 0, 1), lane, seg.curve, m + i * 5);
      } else if (r < 0.78) {
        const kind = Math.random() < 0.5 ? 'bar' : 'low';
        const lanes = [0, 1, 2].filter(l => Math.random() < 0.62);
        if (!lanes.length) lanes.push(Math.floor(Math.random() * 3));
        for (const l of lanes) spawnRow(localT, l, kind, seg.curve, m);
      }
      state.nextSpawnM += 14 + Math.random() * 12;
    }
  }

  function collect(o) {
    o.taken = true;
    obGroup.remove(o.mesh);
    state.combo++;
    state.score += 100 * (1 + Math.floor(state.combo / 5));
    sfx.pick(state.combo);
    popBurst(o.mesh.position, 0xffe95c);
    document.getElementById('msg').textContent = state.combo >= 10 ? '×' + Math.floor(state.combo / 5 + 1) + ' 连击同调！' : '';
    document.getElementById('msg').style.opacity = state.combo >= 10 ? 1 : 0;
    setTimeout(() => (document.getElementById('msg').style.opacity = 0), 900);
  }

  function hitObstacle(o) {
    state.combo = 0;
    state.invuln = 1.2;
    state.shake = 1;
    popBurst(o.mesh.position, 0xff2450);
    if (state.shields > 0) {
      state.shields--;
      sfx.crash();
      state.speed = Math.max(30, state.speed * 0.75);
    } else {
      die();
    }
    obGroup.remove(o.mesh);
    o.mesh = null;
    renderShield();
  }

  function renderShield() {
    document.querySelectorAll('#shield i').forEach((el, i) => el.classList.toggle('on', i < state.shields));
  }

  // ================= 主循环 =================
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    state.time += dt;
    schedule();
    // 节拍脉冲
    if (A.ok) {
      const now2 = A.ctx.currentTime;
      while (beatPulseAt.length && beatPulseAt[0] <= now2) { beatPulseAt.shift(); pulse = 1; }
    }
    pulse = Math.max(0, pulse - dt * 3.4);

    if (state.mode === 'play') {
      // 速度渐升 + BPM 跟随
      state.speed = Math.min(96, state.speed + dt * 1.15);
      if (A.ok) A.bpm = 122 + Math.floor((state.speed - 46) / 50 * 26);
      document.getElementById('speed').textContent = '×' + (state.speed / 46).toFixed(1);
      // 前进：tParam 按弧长推进（控制点间距恒定 → 粗略均匀）
      const P = rail.pts.length - 1;
      const dtT = (state.speed * dt) / (P * SEG_PT);
      player.tParam += dtT;
      player.dist += state.speed * dt;
      player.laneT += (player.lane - player.laneT) * Math.min(1, dt * 12);
      player.jumpT += dt * 1.8;

      // 保证轨道前方足够长（有限生长：玩家参数 + 40 个控制点）
      const targetPts = Math.floor(player.tParam * P) + 40;
      while (rail.pts.length - 1 < Math.max(40, targetPts)) pushControlPoint();
      ensureTubes();
      spawnAhead();

      // 相机与飞船定位：沿当前 Tube 曲线
      const seg = tubeIndexFor(player.tParam);
      if (seg) {
        const curve = seg.curve;
        const localT = clamp((player.tParam * P - seg.fromIdx) / 5, 0, 1);
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
          state.shake = Math.max(0, state.shake - dt * 3);
        }
        camera.position.copy(camPos);
        camera.lookAt(pos.clone().add(tan.clone().multiplyScalar(6)).add(new THREE.Vector3(0, 1.2, 0)));
        // 尾焰
        trailPos[trailHead * 3] = pos.x - tan.x * 1.1;
        trailPos[trailHead * 3 + 1] = pos.y - 0.15;
        trailPos[trailHead * 3 + 2] = pos.z - tan.z * 1.1;
        trailHead = (trailHead + 1) % TRAIL_N;
        trail.geometry.attributes.position.needsUpdate = true;
        trail.material.color.setHSL(hueAt(player.dist), 0.9, 0.65);
      }

      // 碰撞与收集：按全局米数判定（同 Tube 内 localT 定位渲染，比较用米）
      if (seg) {
        localTRef = clamp((player.tParam * (rail.pts.length - 1) - seg.fromIdx) / 5, 0, 1);
        const playerM = player.dist;
        for (const o of obstacles) {
          if (!o.mesh || Math.abs(o.globalM - playerM) > 2.4) continue;
          const laneGap = Math.abs(o.lane - player.laneT);
          const laneHit = laneGap < 0.6;
          const jumpOk = o.kind === 'low' && player.jumpT < 0.62;
          if (laneHit && !jumpOk && state.invuln <= 0) { hitObstacle(o); continue; }
          // 擦身而过：跨过障碍的那一帧贴着边（侧向 0.6~1.1 或同道跳过高杆），奖励手感分
          if (!o.nearMiss && o.globalM < playerM && (laneGap < 1.15 || (jumpOk && laneGap < 0.6))) {
            o.nearMiss = true;
            state.combo++;
            state.score += 150;
            sfx.pick(state.combo);
            const msg = document.getElementById('msg');
            msg.textContent = '擦身而过 +150';
            msg.style.opacity = 1;
            clearTimeout(msg._t);
            msg._t = setTimeout(() => (msg.style.opacity = 0), 700);
          }
        }
        for (const o of orbs) {
          if (o.taken || Math.abs(o.globalM - playerM) > 2.6 || Math.abs(o.lane - player.laneT) > 0.55) continue;
          if (player.jumpT < 0.55) collect(o);
        }
      }
      state.invuln = Math.max(0, state.invuln - dt);

      // 对象回收：身后的障碍/能量块清理（全局米数）
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        if (!o.mesh || o.globalM < player.dist - 14) {
          if (o.mesh) obGroup.remove(o.mesh);
          obstacles.splice(i, 1);
        }
      }
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        if (o.taken || o.globalM < player.dist - 14) {
          if (!o.taken) obGroup.remove(o.mesh);
          orbs.splice(i, 1);
        }
      }

      // HUD
      document.getElementById('score').textContent = (state.score + Math.floor(player.dist * 2)).toLocaleString();
      document.getElementById('combo').textContent = state.combo > 1 ? 'COMBO ×' + state.combo : '';
    }

    // 爆裂粒子推进
    if (burst.active) {
      burst.t += dt;
      const arr = burstGeo.attributes.position.array;
      for (let i = 0; i < BURST_N; i++) {
        arr[i * 3] += burst.vel[i].x * dt;
        arr[i * 3 + 1] += burst.vel[i].y * dt;
        arr[i * 3 + 2] += burst.vel[i].z * dt;
        burst.vel[i].y -= 9 * dt;
      }
      burstGeo.attributes.position.needsUpdate = true;
      burstPoints.material.opacity = Math.max(0, 1 - burst.t / 0.7);
      if (burst.t > 0.7) { burst.active = false; burstPoints.visible = false; }
    }

    // 发光环随节拍呼吸
    const ringScale = 1 + pulse * 0.05;
    for (const ring of rings) {
      ring.scale.setScalar(ringScale);
      ring.material.opacity = 0.45 + pulse * 0.5;
    }
    // 星野与色相流转
    stars.position.z = (state.time * 6) % 500;
    const hue = hueAt(player.dist);
    scene.fog = scene.fog || new THREE.FogExp2(0x05000e, 0.012);
    scene.fog.color.setHSL(0.72 + hue * 0.2 % 1, 0.7, 0.045 + pulse * 0.02);

    requestAnimationFrameAnimationFrameFix();
    renderer.render(scene, camera);
  }
  // 防止重复 rAF 的小封装（保持单一循环）
  function requestAnimationFrameAnimationFrameFix() { /* rAF 在循环顶部已排 */ }

  // Tube 管理：每 5 个控制点一段
  function ensureTubes() {
    const need = Math.floor((rail.pts.length - 1) / 5);
    while (rail.tubes.length < need) {
      const from = rail.tubes.length * 5;
      const to = Math.min(from + 5, rail.pts.length - 1);
      const curve = buildTube(from, to);
      rail.tubes[rail.tubes.length - 1].curve = curve;
    }
    // 身后旧管回收
    const P = rail.pts.length - 1;
    const curIdx = Math.floor(player.tParam * P / 5);
    while (rail.tubes.length > 2 && rail.tubes[0].toIdx < curIdx * 5 - 10) {
      const dead = rail.tubes.shift();
      scene.remove(dead.mesh); scene.remove(dead.wire);
      if (rings.length) scene.remove(rings.shift());
    }
  }
  function tubeIndexFor(tParam) {
    const idx = clamp(Math.floor(tParam * (rail.pts.length - 1) / 5), 0, rail.tubes.length - 1);
    const seg = rail.tubes[idx];
    return seg && seg.curve ? seg : rail.tubes[rail.tubes.length - 1];
  }
  let localTRef = 0;

  // ================= 流程 =================
  function reset() {
    for (const t of rail.tubes) { scene.remove(t.mesh); scene.remove(t.wire); }
    for (const r of rings) scene.remove(r);
    rings.length = 0;
    rail.tubes = []; rail.pts = [new THREE.Vector3(0, 0, 0)]; rail.heading = 0; rail.pitch = 0; rail.tGen = 1;
    while (rail.tGen < 34) pushControlPoint();
    ensureTubes();
    for (const o of obstacles) if (o.mesh) obGroup.remove(o.mesh);
    obstacles.length = 0;
    for (const o of orbs) if (!o.taken) obGroup.remove(o.mesh);
    orbs.length = 0;
    player.tParam = 0; player.lane = 1; player.laneT = 1; player.jumpT = 9; player.dist = 0;
    state.speed = 46; state.score = 0; state.combo = 0; state.shields = 3; state.invuln = 0; state.nextSpawnM = 30;
    localTRef = 0;
    renderShield();
  }
  function start() {
    A.init();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
    if (A.ok) { seq.nextBeat = A.ctx.currentTime + 0.1; seq.beat = 0; }
    reset();
    state.mode = 'play';
    document.getElementById('overlay').classList.add('hide');
    document.getElementById('death').classList.remove('show');
  }
  function die() {
    state.mode = 'dead';
    sfx.boom();
    const score = state.score + Math.floor(player.dist * 2);
    document.getElementById('finalScore').textContent = score.toLocaleString();
    const best = Math.max(score, +(localStorage.getItem('pulse_best') || 0));
    localStorage.setItem('pulse_best', best);
    document.getElementById('bestLine').textContent = '最佳 ' + best.toLocaleString();
    document.getElementById('death').classList.add('show');
  }
  document.getElementById('btnStart').addEventListener('click', start);
  document.getElementById('btnAgain').addEventListener('click', start);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // 标题背景：先铺一段轨道悬停展示
  reset();
  resize();
  requestAnimationFrame(loop);
})();
