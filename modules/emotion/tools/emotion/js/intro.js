/* ========================================
   开场动画控制器
   控制时间轴、跳过、退场与清理
   ======================================== */

const IntroAnimation = {
  // 动画完整时长（与 CSS 时间轴对齐）
  duration: 3200,
  // 退场动画时长
  exitDuration: 1250,

  _timer: null,
  _done: false,
  _template: null,

  /**
   * 启动开场动画
   */
  start() {
    const overlay = document.getElementById('intro-overlay');
    if (!overlay) return;

    // 缓存结构，便于重播
    if (!this._template) {
      this._template = overlay.outerHTML;
    }

    // 锁定滚动，避免动画期间页面跟着滚动
    document.body.classList.add('intro-locked');

    // 尊重系统的"减少动态效果"设置
    const reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      this.finish(true);
      return;
    }

    // 点击或按键可跳过
    this._skipHandler = () => this.finish();
    overlay.addEventListener('click', this._skipHandler);
    window.addEventListener('keydown', this._skipHandler);
    window.addEventListener('touchstart', this._skipHandler, { passive: true });

    // 自动结束
    this._timer = setTimeout(() => this.finish(), this.duration);
  },

  /**
   * 重播开场动画（测试用）
   */
  replay() {
    const old = document.getElementById('intro-overlay');
    if (old) old.remove();

    if (!this._template) {
      console.warn('开场动画模板不可用，无法重播');
      return false;
    }

    this._done = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    document.body.insertAdjacentHTML('afterbegin', this._template);
    // 强制重排，确保 CSS 动画重新播放
    void document.body.offsetWidth;
    this.start();
    return true;
  },

  /**
   * 结束开场动画
   * @param {boolean} instant - 是否立即移除（不做退场动画）
   */
  finish(instant) {
    if (this._done) return;
    this._done = true;

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    // 解绑交互监听
    const overlay = document.getElementById('intro-overlay');
    if (overlay) {
      if (this._skipHandler) {
        overlay.removeEventListener('click', this._skipHandler);
        window.removeEventListener('keydown', this._skipHandler);
        window.removeEventListener('touchstart', this._skipHandler);
      }
    }

    // 恢复滚动
    document.body.classList.remove('intro-locked');

    if (!overlay) return;

    if (instant) {
      overlay.classList.add('intro-instant-out');
      overlay.remove();
      return;
    }

    // 播放揭幕退场
    overlay.classList.add('intro-leaving');
    setTimeout(() => {
      if (overlay && overlay.parentNode) overlay.remove();
    }, this.exitDuration);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  IntroAnimation.start();
});
