// 全局游戏状态：唯一可变数据源，各模块从这里读写，禁止各自私存副本。
export const state = {
  mode: 'title',        // title | play | pause | dead
  speed: 46,
  score: 0,
  combo: 0,
  shields: 3,
  invuln: 0,
  nextSpawnM: 30,
  nextGateM: 800,
  time: 0,
  shake: 0,
  // 本局统计（结算用）
  maxCombo: 0,
  nearMisses: 0,
  orbsTaken: 0,
  // 区段与高潮机制
  sector: 0,
  overdrive: 0,         // >0 时处于过载：剩余秒数
  overdriveUsed: false, // 本局是否已触发过
};

export const player = {
  lane: 1, laneT: 1, jumpT: 9, tParam: 0, dist: 0,
};
