/**
 * 本地存储管理器
 * 统一使用 tools_ 前缀，避免命名冲突
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
      console.error("存储失败:", e.message);
      showToast("存储失败，请检查存储空间", "error");
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
      console.error("读取失败:", e.message);
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
 * 消息提示（Toast）
 * @param {string} message - 提示消息
 * @param {string} type - 类型：success/error/warning/info
 * @param {number} duration - 显示时长（毫秒）
 */
function showToast(message, type = 'info', duration = 4000) {
  // 移除已有的 toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  // 创建 toast 元素
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
  `;

  document.body.appendChild(toast);

  // 自动移除
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * 格式化日期
 * @param {Date|string|number} date - 日期
 * @param {string} format - 格式：'YYYY-MM-DD' | 'MM/DD' | 'HH:mm'
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD':
      return `${month}/${day}`;
    case 'HH:mm':
      return `${hours}:${minutes}`;
    case 'MM/DD HH:mm':
      return `${month}/${day} ${hours}:${minutes}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * 格式化时间区间
 * @param {string} timeStr - 时间字符串 "HH:mm"
 * @returns {string} 格式化后的时间
 */
function formatTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const period = hours >= 12 ? '下午' : '上午';
  const displayHours = hours % 12 || 12;
  return `${period}${displayHours}点${minutes}分`;
}

/**
 * 比较两个时间的先后顺序
 * @param {string} time1 - 时间字符串 "HH:mm"
 * @param {string} time2 - 时间字符串 "HH:mm"
 * @returns {number} -1: time1 < time2, 0: equal, 1: time1 > time2
 */
function compareTime(time1, time2) {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  const t1 = h1 * 60 + m1;
  const t2 = h2 * 60 + m2;
  return t1 - t2;
}

/**
 * 生成唯一 ID
 * @returns {string} UUID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(func, wait = 300) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= wait) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
}

/**
 * 深拷贝对象
 * @param {any} obj - 要拷贝的对象
 * @returns {any} 拷贝后的对象
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 验证邮箱格式
 * @param {string} email - 邮箱地址
 * @returns {boolean} 是否有效
 */
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * 验证 URL 格式（支持完整的订阅链接和查询参数）
 * @param {string} url - URL 地址
 * @returns {boolean} 是否有效
 */
function isValidURL(url) {
  // 如果已经有 https://或 http://前缀，直接返回 true
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return true;
  }

  // 尝试添加 http://前缀后再验证
  const urlWithProtocol = url.startsWith('http') ? url : 'http://' + url;
  const regex = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?$/;
  return regex.test(urlWithProtocol);
}

/**
 * 从文件扩展名获取 MIME 类型
 * @param {string} filename - 文件名
 * @returns {string} MIME 类型
 */
function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    ics: 'text/calendar',
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * 下载文件
 * @param {Blob|string} data - 文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME 类型
 */
function downloadFile(data, filename, mimeType = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`文件已下载：${filename}`, 'success');
}

/**
 * 显示模态框
 * @param {string} modalId - 模态框 ID
 */
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * 隐藏模态框
 * @param {string} modalId - 模态框 ID
 */
function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * 加载资源并显示加载动画
 * @param {HTMLImageElement[]} images - 图片元素数组
 */
function preloadImages(...images) {
  images.forEach(img => {
    img.addEventListener('error', () => {
      // 视觉降级：使用渐变背景替代
      img.parentElement.style.backgroundImage = 'none';
    });
  });
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否成功
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制到剪贴板', 'success');
    return true;
  } catch (error) {
    // 降级方案：使用传统的 execCommand
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('已复制到剪贴板', 'success');
      return true;
    } catch (e) {
      showToast('复制失败，请手动复制', 'error');
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

/**
 * 解析查询参数
 * @param {string} urlString - URL 字符串
 * @returns {Object} 参数对象
 */
function parseQueryString(urlString = window.location.search) {
  const params = {};
  const query = urlString.startsWith('?') ? urlString.slice(1) : urlString;
  query.split('&').forEach(param => {
    const [key, value] = param.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  });
  return params;
}

/**
 * 构建查询参数字符串
 * @param {Object} params - 参数字典
 * @returns {string} 查询字符串
 */
function buildQueryString(params) {
  return Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * 检测是否是移动设备
 * @returns {boolean}
 */
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * 获取屏幕宽度
 * @returns {number}
 */
function getScreenWidth() {
  return window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
}

/**
 * 平滑滚动到元素
 * @param {string|HTMLElement} element - 目标元素
 * @param {number} offset - 偏移量
 */
function smoothScrollTo(element, offset = 0) {
  const target = typeof element === 'string' ? document.querySelector(element) : element;
  if (target) {
    const rect = target.getBoundingClientRect();
    const scrollPos = window.scrollY - offset + rect.top;
    window.scrollTo({
      top: scrollPos,
      behavior: 'smooth'
    });
  }
}

// 导出全局对象
window.ToolsUtils = {
  StorageManager,
  showToast,
  formatDate,
  formatTime,
  compareTime,
  generateId,
  debounce,
  throttle,
  deepClone,
  isValidEmail,
  isValidURL,
  getMimeType,
  downloadFile,
  showModal,
  hideModal,
  preloadImages,
  copyToClipboard,
  parseQueryString,
  buildQueryString,
  isMobile,
  getScreenWidth,
  smoothScrollTo
};
