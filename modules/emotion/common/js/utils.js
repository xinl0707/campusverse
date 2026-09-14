/* ========================================
   公共工具函数 - 黑客松项目
   ======================================== */

/**
 * 本地存储管理器
 */
const StorageManager = {
  prefix: 'tools_',

  /**
   * 保存数据
   * @param {string} key - 键名
   * @param {any} data - 数据（自动 JSON 序列化）
   */
  save(key, data) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(data));
    } catch (e) {
      console.error('存储失败:', e.message);
    }
  },

  /**
   * 读取数据
   * @param {string} key - 键名
   * @returns {any|null} 数据（自动 JSON 解析），不存在返回 null
   */
  load(key) {
    try {
      const data = localStorage.getItem(this.prefix + key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('读取失败:', e.message);
      return null;
    }
  },

  /**
   * 删除数据
   * @param {string} key - 键名
   */
  remove(key) {
    localStorage.removeItem(this.prefix + key);
  },

  /**
   * 清空所有工具组数据
   */
  clear() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(k => localStorage.removeItem(k));
  }
};

/**
 * Toast 提示
 * @param {string} message - 提示内容
 * @param {number} duration - 显示时长（毫秒），默认 2000
 */
function showToast(message, duration = 2000) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date|string|number} date - 日期
 * @returns {string}
 */
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期为中文显示
 * @param {Date|string|number} date - 日期
 * @returns {string} 如 "9月10日 周三"
 */
function formatDateCN(date) {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${month}月${day}日 ${weekDays[d.getDay()]}`;
}

/**
 * 获取今天是周几（1-7，周一到周日）
 * @returns {number}
 */
function getWeekDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

/**
 * 获取本周的起止日期（周一到周日）
 * @returns {{ start: string, end: string }}
 */
function getWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: formatDate(start), end: formatDate(end) };
}

/**
 * 生成唯一 ID
 * @param {string} prefix - 前缀
 * @returns {string}
 */
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟毫秒数
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} interval - 间隔毫秒数
 * @returns {Function}
 */
function throttle(fn, interval = 300) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 提取并解析 JSON 内容（清洗 AI 返回的 JSON）
 * @param {string} rawText - 包含 JSON 的原始文本
 * @returns {Object|null} 解析后的对象，失败返回 null
 */
function parseAiJson(rawText) {
  try {
    let jsonString = rawText.match(/\{[\s\S]*\}/);
    if (!jsonString) {
      jsonString = rawText;
    } else {
      jsonString = jsonString[0];
    }
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('⚠️ AI 返回格式错误:', e.message);
    return null;
  }
}

/* ========================================
   模拟日期系统（用于测试）
   ======================================== */

const MockDate = {
  _offsetDays: 0,  // 相对真实日期的偏移天数
  _realNow: Date.now(),

  /**
   * 获取当前模拟时间戳
   */
  now() {
    return this._realNow + this._offsetDays * 24 * 60 * 60 * 1000;
  },

  /**
   * 获取当前模拟 Date 对象
   */
  getDate() {
    return new Date(this.now());
  },

  /**
   * 跳到下一天
   */
  nextDay() {
    this._offsetDays++;
    return this.getDate();
  },

  /**
   * 跳到上一天
   */
  prevDay() {
    this._offsetDays--;
    return this.getDate();
  },

  /**
   * 跳转到指定天数偏移
   * @param {number} days - 偏移天数（正数未来，负数过去）
   */
  jumpTo(days) {
    this._offsetDays = days;
    return this.getDate();
  },

  /**
   * 获取当前偏移天数
   */
  getOffset() {
    return this._offsetDays;
  },

  /**
   * 恢复到真实日期
   */
  reset() {
    this._offsetDays = 0;
    this._realNow = Date.now();
    return this.getDate();
  },

  /**
   * 是否处于测试模式
   */
  isTestMode() {
    return this._offsetDays !== 0;
  }
};

/**
 * 覆盖 formatDate 以使用模拟日期
 * （保持原函数兼容，新增 Mock 版本）
 */
function formatDateMock(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateCNMock(date) {
  const d = date instanceof Date ? date : new Date(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${month}月${day}日 ${weekDays[d.getDay()]}`;
}
