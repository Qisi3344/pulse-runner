// 实体：飞船、尾焰、障碍（bar/low/sweep）、能量块、区段门、爆裂粒子。
// 对象按全局米数 globalM 存放，渲染用所在 Tube 的局部参数定位。
import { TAU, clamp } from './core.js';
import { scene } from './scene.js';
import { SEG_PT, SEG_POINTS, TUBE_RADIUS, rail, tubeIndexFor } from './track.js';
import { player } from './state.js';

export function laneOffset(lane) { return (lane - 1) * 2.6; }

// 回收 mesh 时同步释放 GPU 资源（remove 只摘出场景，geometry/material 会一直占显存）
function disposeMesh(mesh) {
  mesh.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      for (const m of Array.isArray(n.material) ? n.material : [n.material]) m.dispose();
    }
  });
}

// ================= 玩家飞船（纯几何拼装） =================
export const ship = new THREE.Group();
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
scene.add(ship);

// 引擎尾焰：环形缓冲点精灵
const trail = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
  color: 0x66e0ff, size: 0.36, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
}));
const TRAIL_N = 90;
trail.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
const trailPos = trail.geometry.attributes.position.array;
let trailHead = 0;
for (let i = 0; i < TRAIL_N; i++) { trailPos[i * 3 + 1] = -999; }
scene.add(trail);

export function pushTrail(pos, tan) {
  trailPos[trailHead * 3] = pos.x - tan.x * 1.1;
  trailPos[trailHead * 3 + 1] = pos.y - 0.15;
  trailPos[trailHead * 3 + 2] = pos.z - tan.z * 1.1;
  trailHead = (trailHead + 1) % TRAIL_N;
  trail.geometry.attributes.position.needsUpdate = true;
}
export function setTrailHue(hue) { trail.material.color.setHSL(hue, 0.9, 0.65); }

// ================= 障碍 / 能量块 / 区段门 =================
export const obstacles = [];   // { globalM, localT, lane, kind: 'bar'|'low'|'sweep', mesh, nearMiss, spd, phase }
export const orbs = [];        // { globalM, localT, lane, mesh, taken }
export const gates = [];       // { globalM, idx, mesh, passed }
export const obGroup = new THREE.Group(); scene.add(obGroup);

function curveFrame(localT, curve) {
  const pt = curve.getPointAt(localT);
  const tan = curve.getTangentAt(localT).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const binorm = new THREE.Vector3().crossVectors(up, tan).normalize();
  return { pt, tan, up, binorm };
}

export function spawnRow(localT, lane, kind, curve, globalM) {
  const { pt, tan, up, binorm } = curveFrame(localT, curve);
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
  } else if (kind === 'low') {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.5, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xff2450, fog: false })
    );
    const wire = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 0.4), new THREE.MeshBasicMaterial({ color: 0xff6f9c, wireframe: true, fog: false }));
    mesh.add(wire);
    mesh.position.copy(pos).add(up.clone().multiplyScalar(0.4));
  } else {
    // 扫描闸：竖杆在车道间往返，读准时机从空档钻过去
    mesh = new THREE.Group();
    const rod = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 2.4, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xff7a1f, fog: false })
    );
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xffc46f, wireframe: true, fog: false }));
    rod.add(wire);
    mesh.add(rod);
    mesh.position.copy(pos).add(up.clone().multiplyScalar(1.3));
  }
  mesh.lookAt(pos.clone().add(tan));
  obGroup.add(mesh);
  obstacles.push({
    globalM, localT, lane, kind, mesh, nearMiss: false,
    spd: 0.9 + Math.random() * 0.7, phase: Math.random() * TAU,
  });
}

export function spawnOrb(localT, lane, curve, globalM, kind = 'energy') {
  const { pt, binorm } = curveFrame(localT, curve);
  const pos = pt.clone().add(binorm.clone().multiplyScalar(laneOffset(lane))).add(new THREE.Vector3(0, 1.1, 0));
  const isHeal = kind === 'heal';
  const mesh = new THREE.Mesh(
    isHeal ? new THREE.BoxGeometry(0.52, 0.52, 0.52) : new THREE.OctahedronGeometry(0.42),
    new THREE.MeshBasicMaterial({ color: isHeal ? 0x4fff8a : 0xffe95c, fog: false })
  );
  const glow = new THREE.PointLight(isHeal ? 0x4fff8a : 0xffe95c, 0.8, 6, 2);
  mesh.add(glow);
  mesh.position.copy(pos);
  obGroup.add(mesh);
  orbs.push({ globalM, localT, lane, mesh, taken: false, spin: Math.random() * TAU, baseY: pos.y, kind });
}

export function spawnGate(localT, curve, globalM, idx) {
  const { pt, tan } = curveFrame(localT, curve);
  const mesh = new THREE.Group();
  const hue = (0.52 + idx * 0.14) % 1;
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(TUBE_RADIUS * 1.04, 0.16, 8, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 1, 0.6), fog: false, transparent: true, opacity: 0.95 })
  );
  mesh.add(arch);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(TUBE_RADIUS * 0.92, 0.05, 8, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((hue + 0.1) % 1, 1, 0.7), fog: false, transparent: true, opacity: 0.6 })
  );
  mesh.add(halo);
  mesh.position.copy(pt);
  mesh.lookAt(pt.clone().add(tan));
  obGroup.add(mesh);
  gates.push({ globalM, idx, mesh, arch, halo, passed: false });
}

// 扫描闸的即时车道：横杆在三条车道间往返
export function laneAt(o, time) {
  if (o.kind !== 'sweep') return o.lane;
  return 1 + Math.sin(time * o.spd + o.phase) * 1;
}

// 每帧实体动画：扫描闸移动、能量块旋转浮动、区段门脉动
export function animateEntities(dt, t0) {
  const playerM = player.dist;
  for (const o of obstacles) {
    if (o.kind !== 'sweep' || !o.mesh || Math.abs(o.globalM - playerM) > 90) continue;
    const seg = tubeIndexFor(o.globalM / (rail.pts.length * SEG_PT));
    if (!seg || !seg.curve) continue;
    const P = rail.pts.length - 1;
    const tGlobal = o.globalM / (P * SEG_PT);
    const localT = clamp((tGlobal * P - seg.fromIdx) / SEG_POINTS, 0, 1);
    const { pt, up, binorm } = curveFrame(localT, seg.curve);
    const lane = laneAt(o, t0);
    o.mesh.position.copy(pt).add(binorm.clone().multiplyScalar(laneOffset(lane))).add(up.clone().multiplyScalar(1.3));
  }
  const wobble = t0 * 2.2;
  for (const o of orbs) {
    if (o.taken || Math.abs(o.globalM - playerM) > 90) continue;
    o.mesh.rotation.y += dt * 2.4;
    o.mesh.rotation.x += dt * 1.1;
    o.mesh.position.y = o.baseY + Math.sin(wobble + o.spin) * 0.16;
    const s = 1 + Math.sin(wobble * 1.3 + o.spin) * 0.12;
    o.mesh.scale.setScalar(s);
  }
  for (const g of gates) {
    if (g.passed || Math.abs(g.globalM - playerM) > 200) continue;
    g.arch.rotation.z += dt * 0.6;
    g.halo.rotation.z -= dt * 0.9;
    const s = 1 + Math.sin(t0 * 3 + g.idx) * 0.02;
    g.mesh.scale.setScalar(s);
  }
}

// 身后回收（globalM 落后玩家 14 米以上）
export function recycleBehind() {
  const playerM = player.dist;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (!o.mesh || o.globalM < playerM - 14) {
      if (o.mesh) { obGroup.remove(o.mesh); disposeMesh(o.mesh); }
      obstacles.splice(i, 1);
    }
  }
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    if (o.taken || o.globalM < playerM - 14) {
      if (!o.taken) { obGroup.remove(o.mesh); disposeMesh(o.mesh); }
      orbs.splice(i, 1);
    }
  }
  for (let i = gates.length - 1; i >= 0; i--) {
    const g = gates[i];
    if (g.passed && g.globalM < playerM - 14) {
      obGroup.remove(g.mesh);
      disposeMesh(g.mesh);
      gates.splice(i, 1);
    }
  }
}

export function clearEntities() {
  for (const o of obstacles) if (o.mesh) { obGroup.remove(o.mesh); disposeMesh(o.mesh); }
  obstacles.length = 0;
  for (const o of orbs) if (!o.taken) { obGroup.remove(o.mesh); disposeMesh(o.mesh); }
  orbs.length = 0;
  for (const g of gates) { obGroup.remove(g.mesh); disposeMesh(g.mesh); }
  gates.length = 0;
}

// ================= 爆裂粒子 =================
const burst = { active: false, t: 0, vel: [] };
const burstGeo = new THREE.BufferGeometry();
const BURST_N = 60;
burstGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_N * 3), 3));
const burstPoints = new THREE.Points(burstGeo, new THREE.PointsMaterial({
  color: 0xff2450, size: 0.5, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
}));
burstPoints.visible = false;
scene.add(burstPoints);

export function popBurst(pos, color) {
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

export function animateBurst(dt) {
  if (!burst.active) return;
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
