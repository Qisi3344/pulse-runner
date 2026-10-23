// 区段专属环境粒子：一层掠过镜头的氛围点云，行为随区段切换。
// 粒子活在相机前方盒子里按速度相对流动，越界回收到前方——与星野同一套思路。
import { TAU } from './core.js';
import { scene } from './scene.js';
import { SECTORS, sectorIndexAt } from './sectors.js';
import { player, state } from './state.js';

const N = 340;
const BOX = { x: 17, yLow: -7, yHigh: 15, zNear: 9, zFar: -110 };

const geo = new THREE.BufferGeometry();
const pos = new Float32Array(N * 3);
const seeds = [];
for (let i = 0; i < N; i++) {
  pos[i * 3] = (Math.random() * 2 - 1) * BOX.x;
  pos[i * 3 + 1] = BOX.yLow + Math.random() * (BOX.yHigh - BOX.yLow);
  pos[i * 3 + 2] = BOX.zFar + Math.random() * (BOX.zNear - BOX.zFar);
  seeds.push(Math.random() * TAU);
}
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

const mat = new THREE.PointsMaterial({
  size: 0.3, transparent: true, opacity: 0.62,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const points = new THREE.Points(geo, mat);
scene.add(points);

export function animateAmbience(dt, time) {
  const sec = SECTORS[sectorIndexAt(player.dist)];
  mat.color.setHSL(sec.hue, 0.9, 0.62);
  // 相对流动：比玩家慢一截，形成层次；速度越低越接近悬停
  const flow = state.speed * dt * 0.5;
  const arr = geo.attributes.position.array;
  for (let i = 0; i < N; i++) {
    const j = i * 3;
    arr[j + 2] += flow;
    switch (sec.amb) {
      case 'rise':
        arr[j + 1] += dt * 1.4;
        break;
      case 'fall':
        arr[j + 1] -= dt * 2.4;
        break;
      case 'flicker': {
        // 电花：相位到点就瞬移一次
        const phase = (time * 1.6 + seeds[i]) % 1;
        if (phase < dt * 1.6) {
          arr[j] = (Math.random() * 2 - 1) * BOX.x;
          arr[j + 1] = BOX.yLow + Math.random() * (BOX.yHigh - BOX.yLow);
        }
        break;
      }
      default:   // float 浮尘
        arr[j] += Math.sin(time * 0.6 + seeds[i]) * dt * 0.5;
        arr[j + 1] += Math.cos(time * 0.5 + seeds[i]) * dt * 0.35;
    }
    // 回收：落到相机身后或飘出竖直范围 → 送到前方
    if (arr[j + 2] > BOX.zNear || arr[j + 1] < BOX.yLow - 2 || arr[j + 1] > BOX.yHigh + 2) {
      arr[j] = (Math.random() * 2 - 1) * BOX.x;
      arr[j + 1] = BOX.yLow + Math.random() * (BOX.yHigh - BOX.yLow);
      arr[j + 2] = BOX.zFar + Math.random() * 20;
    }
  }
  geo.attributes.position.needsUpdate = true;
}
