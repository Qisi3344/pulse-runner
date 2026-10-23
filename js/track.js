// 轨道：向前生长的 CatmullRom 样条，每 24 米一个控制点，按 5 点分段成 Tube。
// 身后旧段与旧环回收；接缝发光环随节拍呼吸。
import { TAU, clamp, hueAt } from './core.js';
import { scene } from './scene.js';

export const SEG_PT = 24;             // 控制点间距（米）
export const TUBE_RADIUS = 5.2;
export const SEG_POINTS = 5;          // 每段 Tube 的控制点数

export const rail = {
  pts: [], heading: 0, pitch: 0,
  tubes: [],                          // { mesh, wire, fromIdx, toIdx, curve }
  rings: [],
  tGen: 0,                            // 已生成的控制点数
};

export function pushControlPoint() {
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

export function buildTube(fromIdx, toIdx) {
  const c = new THREE.CatmullRomCurve3(rail.pts.slice(fromIdx, toIdx + 1), false, 'catmullrom', 0.4);
  const hue = hueAt(fromIdx * SEG_PT);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(c, 96, TUBE_RADIUS, 26, false),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.75, 0.055) })
  );
  // 霓虹网格线：同管子的线框叠加
  const wire = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 1, 0.6), wireframe: true, transparent: true, opacity: 0.42 })
  );
  // 接缝处的发光环：随节拍脉动（存进 rail.rings 统一动画）
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(TUBE_RADIUS * 0.985, 0.07, 8, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((hue + 0.08) % 1, 1, 0.62), fog: false, transparent: true, opacity: 0.85 })
  );
  ring.position.copy(rail.pts[fromIdx]);
  ring.lookAt(rail.pts[Math.min(toIdx, rail.pts.length - 1)]);
  scene.add(ring);
  rail.rings.push(ring);
  scene.add(mesh); scene.add(wire);
  rail.tubes.push({ mesh, wire, fromIdx, toIdx });
  return c;
}

export function ensureTubes(playerTParam) {
  const need = Math.floor((rail.pts.length - 1) / SEG_POINTS);
  while (rail.tubes.length < need) {
    const from = rail.tubes.length * SEG_POINTS;
    const to = Math.min(from + SEG_POINTS, rail.pts.length - 1);
    const curve = buildTube(from, to);
    rail.tubes[rail.tubes.length - 1].curve = curve;
  }
  // 身后旧管回收
  const P = rail.pts.length - 1;
  const curIdx = Math.floor(playerTParam * P / SEG_POINTS);
  while (rail.tubes.length > 2 && rail.tubes[0].toIdx < curIdx * SEG_POINTS - 10) {
    const dead = rail.tubes.shift();
    scene.remove(dead.mesh); scene.remove(dead.wire);
    dead.mesh.geometry.dispose();
    dead.mesh.material.dispose(); dead.wire.material.dispose();
    if (rail.rings.length) {
      const ring = rail.rings.shift();
      scene.remove(ring);
      ring.geometry.dispose(); ring.material.dispose();
    }
  }
}

export function tubeIndexFor(tParam) {
  const idx = clamp(Math.floor(tParam * (rail.pts.length - 1) / SEG_POINTS), 0, rail.tubes.length - 1);
  const seg = rail.tubes[idx];
  return seg && seg.curve ? seg : rail.tubes[rail.tubes.length - 1];
}

export function resetTrack() {
  for (const t of rail.tubes) {
    scene.remove(t.mesh); scene.remove(t.wire);
    t.mesh.geometry.dispose();
    t.mesh.material.dispose(); t.wire.material.dispose();
  }
  for (const r of rail.rings) {
    scene.remove(r);
    r.geometry.dispose(); r.material.dispose();
  }
  rail.rings.length = 0;
  rail.tubes = []; rail.pts = [new THREE.Vector3(0, 0, 0)]; rail.heading = 0; rail.pitch = 0; rail.tGen = 1;
  while (rail.tGen < 34) pushControlPoint();
  ensureTubes(0);
}
