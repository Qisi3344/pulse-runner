// UI 层：HUD、标题、暂停菜单、设置、结算。业务回调由 main 注入，本模块只操作 DOM。
import { A, sfx } from './audio.js';
import { state } from './state.js';

const $ = id => document.getElementById(id);
const el = {
  score: $('score'), combo: $('combo'), shield: $('shield'), speed: $('speed'),
  msg: $('msg'), sectorTag: $('sectorTag'), announce: $('announce'), fx: $('fx'),
  overlay: $('overlay'), titleBest: $('titleBest'),
  pause: $('pause'), death: $('death'),
  finalScore: $('finalScore'), bestLine: $('bestLine'), statLine: $('statLine'),
};

export const ui = {
  setScore(v) { el.score.textContent = v.toLocaleString(); },
  setCombo(v) { el.combo.textContent = v > 1 ? 'COMBO ×' + v : ''; },
  setSpeed(v) { el.speed.textContent = '×' + (v / 46).toFixed(1); },
  setSectorTag(name) { el.sectorTag.textContent = name; },
  renderShield() {
    document.querySelectorAll('#shield i').forEach((n, i) => n.classList.toggle('on', i < state.shields));
  },
  showMsg(text, ms = 900) {
    el.msg.textContent = text;
    el.msg.style.opacity = 1;
    clearTimeout(el.msg._t);
    el.msg._t = setTimeout(() => (el.msg.style.opacity = 0), ms);
  },
  // 区段公告：大字浮现再淡出
  announceSector(text) {
    el.announce.textContent = text;
    el.announce.classList.remove('show');
    void el.announce.offsetWidth;   // 重置动画
    el.announce.classList.add('show');
  },
  // 全屏反馈闪：hit 撞击 / gate 过门 / od 过载启动
  flash(name) {
    el.fx.classList.remove('hit', 'gate', 'od');
    void el.fx.offsetWidth;
    el.fx.classList.add(name);
  },
  setOverdrive(on) { document.body.classList.toggle('od', on); },
  showTitle() {
    el.overlay.classList.remove('hide');
    el.death.classList.remove('show');
    el.pause.classList.remove('show');
    const best = +(localStorage.getItem('pulse_best') || 0);
    el.titleBest.textContent = best > 0 ? '最佳纪录 ' + best.toLocaleString() : '尚无纪录 · 去开创';
  },
  hideTitle() { el.overlay.classList.add('hide'); },
  showDeath(score, best, st) {
    el.finalScore.textContent = score.toLocaleString();
    el.bestLine.textContent = (score >= best && score > 0 ? '★ 新纪录！' : '最佳 ' + best.toLocaleString());
    el.statLine.innerHTML =
      `<span>距离 <b>${Math.floor(st.dist)}m</b></span>` +
      `<span>最大连击 <b>×${st.maxCombo}</b></span>` +
      `<span>擦身 <b>${st.nearMisses}</b></span>` +
      `<span>抵达 <b>${st.sectorName}</b></span>` +
      `<span>评级 <b class="grade">${st.grade || 'D'}</b></span>`;
    el.death.classList.add('show');
  },
  hideDeath() { el.death.classList.remove('show'); },
  showPause() { el.pause.classList.add('show'); },
  hidePause() { el.pause.classList.remove('show'); },
};

// 音量滑条：即时生效并持久化
function initVolume() {
  const slider = $('vol');
  slider.value = +(localStorage.getItem('pulse_vol') ?? 0.72);
  const apply = () => {
    const v = +slider.value;
    A.setVolume(v);
    if (A.ok) sfx.uiTick();
  };
  slider.addEventListener('input', apply);
}

// 菜单回调由 main 注入，避免 ui → main 循环依赖
export function bindUi({ onResume, onRestart, onQuit }) {
  $('btnResume').addEventListener('click', () => { sfx.uiTick(); onResume(); });
  $('btnRestart').addEventListener('click', () => { sfx.uiTick(); onRestart(); });
  $('btnQuit').addEventListener('click', () => { sfx.uiTick(); onQuit(); });
  initVolume();
}
