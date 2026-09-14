/**
 * 通用工具（存储/格式化/提示）
 */
'use strict';

/**
 * 本地存储管理器
 */
const StorageManager = {
  prefix: 'simulator_',  // 模拟器组统一前缀

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
   * 清空所有模拟器组数据
   */
  clear() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(k => localStorage.removeItem(k));
  }
};

/**
 * 数值钳制
 * @param {number} v - 值
 * @param {number} min - 最小
 * @param {number} max - 最大
 */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * HTML 转义（玩家自定义输入渲染前必须经过此函数，防 XSS）
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 截断文本
 */
function truncate(str, len = 30) {
  str = String(str || '');
  return str.length > len ? str.slice(0, len) + '…' : str;
}

/**
 * Toast 轻提示
 * @param {string} message - 提示文字
 * @param {string} type - '' | 'success' | 'error'
 */
function showToast(message, type = '') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast show' + (type ? ' toast-' + type : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('show');
  }, 2600);
}

/**
 * 简易日志
 */
function logInfo(...args) {
  console.log('[模拟器]', ...args);
}
