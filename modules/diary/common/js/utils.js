/**
 * 通用工具函数
 * 包含日志、格式化、LocalStorage 等功能
 */

/**
 * 本地存储管理器
 */
const StorageManager = {
  prefix: 'tools_',  // 工具组统一前缀
  
  /**
   * 保存数据
   * @param {string} key - 键名
   * @param {any} data - 数据（自动 JSON 序列化）
   */
  save(key, data) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('存储失败:', e.message);
      return false;
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
 * 日志工具
 */
const Logger = {
  info(...args) {
    console.log('%c[INFO]', 'color: #4A90D9; font-weight: bold;', ...args);
  },
  
  success(...args) {
    console.log('%c[SUCCESS]', 'color: #51CF66; font-weight: bold;', ...args);
  },
  
  warn(...args) {
    console.warn('%c[WARN]', 'color: #FFD43B; font-weight: bold;', ...args);
  },
  
  error(...args) {
    console.error('%c[ERROR]', 'color: #FF6B6B; font-weight: bold;', ...args);
  }
};

/**
 * 日期格式化工具
 */
const DateUtils = {
  /**
   * 格式化日期为 YYYY-MM-DD
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的日期字符串
   */
  formatDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
  
  /**
   * 格式化时间为 HH:MM
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(date = new Date()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },
  
  /**
   * 格式化完整日期时间
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的日期时间字符串
   */
  formatDateTime(date = new Date()) {
    return `${this.formatDate(date)} ${this.formatTime(date)}`;
  },
  
  /**
   * 获取友好的日期显示
   * @param {string} dateStr - 日期字符串 YYYY-MM-DD
   * @returns {string} 友好显示，如"今天"、"昨天"、"2026年9月10日"
   */
  getFriendlyDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    
    const diff = (today - target) / (1000 * 60 * 60 * 24);
    
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
};

/**
 * Toast 提示
 * @param {string} message - 提示内容
 * @param {number} duration - 显示时长（毫秒）
 */
function showToast(message, duration = 3000) {
  // 移除已存在的 toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // 创建新的 toast
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // 显示动画
  setTimeout(() => toast.classList.add('show'), 10);
  
  // 自动隐藏
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * 防抖函数
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn - 要执行的函数
 * @param {number} interval - 间隔时间（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(fn, interval = 300) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}
