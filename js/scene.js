// 场景基建：渲染器、相机、雾、星野。所有实体模块共享同一个 scene。
import { TAU } from './core.js';

export const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('c'), antialias: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05000e, 0.012);
scene.add(new THREE.AmbientLight(0xffffff, 0.85));

export const camera = new THREE.PerspectiveCamera(78, 1, 0.1, 400);

// 星野：一层永远在远处滚动的点云
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
export const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  color: 0x8fb0ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75,
}));
scene.add(stars);

export function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
