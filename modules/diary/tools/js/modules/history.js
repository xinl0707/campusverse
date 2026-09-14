/**
 * 历史记录模块
 * 管理已保存的日记，支持查看历史
 */

const HistoryManager = {
  /**
   * 初始化历史记录管理器
   */
  init() {
    this.bindEvents();
    Logger.info('历史记录管理器已初始化');
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    // 打开历史记录
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
      historyBtn.addEventListener('click', () => this.showHistory());
    }

    // 返回
    const historyBackBtn = document.getElementById('historyBackBtn');
    if (historyBackBtn) {
      historyBackBtn.addEventListener('click', () => this.hideHistory());
    }

    // 写第一篇
    const writeFirstBtn = document.getElementById('writeFirstBtn');
    if (writeFirstBtn) {
      writeFirstBtn.addEventListener('click', () => {
        this.hideHistory();
        startNewConversation();
      });
    }
  },

  /**
   * 获取所有日记
   */
  getAllDiaries() {
    return StorageManager.load('diaries') || [];
  },

  /**
   * 显示历史记录
   */
  showHistory() {
    const diaries = this.getAllDiaries();
    const historyContainer = document.getElementById('historyContainer');
    const historyList = document.getElementById('historyList');
    const historyEmpty = document.getElementById('historyEmpty');
    const chatContainer = document.getElementById('chatContainer');
    const diaryContainer = document.getElementById('diaryContainer');

    // 隐藏其他视图
    if (chatContainer) chatContainer.style.display = 'none';
    if (diaryContainer) diaryContainer.style.display = 'none';

    if (diaries.length === 0) {
      // 显示空状态
      if (historyList) historyList.style.display = 'none';
      if (historyEmpty) historyEmpty.style.display = 'block';
    } else {
      // 渲染日记列表
      if (historyEmpty) historyEmpty.style.display = 'none';
      if (historyList) {
        historyList.style.display = 'flex';
        historyList.innerHTML = diaries.map((diary, index) => this.renderHistoryItem(diary, index)).join('');
        
        // 绑定点击事件
        historyList.querySelectorAll('.history-item').forEach((item, index) => {
          item.addEventListener('click', (e) => {
            // 点击按钮时不触发查看
            if (e.target.closest('.history-action-btn')) return;
            this.viewDiary(index);
          });
        });
        
        // 绑定分享按钮
        historyList.querySelectorAll('.share-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            this.shareDiary(idx);
          });
        });
        
        // 绑定删除按钮
        historyList.querySelectorAll('.delete-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            this.confirmDeleteDiary(idx);
          });
        });
      }
    }

    // 显示历史容器
    if (historyContainer) historyContainer.style.display = 'block';
  },

  /**
   * 隐藏历史记录
   */
  hideHistory() {
    const historyContainer = document.getElementById('historyContainer');
    const chatContainer = document.getElementById('chatContainer');

    if (historyContainer) historyContainer.style.display = 'none';
    if (chatContainer) chatContainer.style.display = 'flex';
    
    // 恢复白色背景板
    if (typeof WeatherManager !== 'undefined') {
      WeatherManager.clearAll();
    }
  },

  /**
   * HTML 实体转义
   */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * 渲染历史列表项
   */
  renderHistoryItem(diary, index) {
    const date = diary.date || '';
    // 显示完整日期：XXXX年XX月XX日
    const fullDate = this.formatFullDate(date);
    const title = this._escapeHtml(diary.title || '无标题');
    const content = diary.content || '';
    const preview = this._escapeHtml(content.substring(0, 100) + (content.length > 100 ? '...' : ''));
    const tags = diary.tags || [];

    return `
      <div class="history-item" data-index="${index}">
        <div class="history-item-header">
          <span class="history-item-title">${title}</span>
          <span class="history-item-date">${fullDate}</span>
        </div>
        <div class="history-item-preview">${preview}</div>
        ${tags.length > 0 ? `
          <div class="history-item-tags">
            ${tags.map(tag => `<span class="history-item-tag">#${this._escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
        <div class="history-item-actions">
          <button class="history-action-btn share-btn" data-index="${index}" title="分享日记">🔗 分享</button>
          <button class="history-action-btn delete-btn" data-index="${index}" title="删除日记">️ 删除</button>
        </div>
      </div>
    `;
  },

  /**
   * 格式化完整日期：XXXX年XX月XX日
   */
  formatFullDate(dateStr) {
    if (!dateStr) return '未知日期';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  },

  /**
   * 查看某篇日记
   */
  viewDiary(index) {
    const diaries = this.getAllDiaries();
    const diary = diaries[index];
    
    if (!diary) return;

    // 同步设置当前日记（确保分享/下载操作正确的日记）
    if (typeof DiaryManager !== 'undefined') {
      DiaryManager.currentDiary = diary;
    }

    // 隐藏历史视图
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) historyContainer.style.display = 'none';

    // 切换到日记对应的天气背景
    if (diary.weather && typeof WeatherManager !== 'undefined') {
      WeatherManager.setWeather(diary.weather);
    }

    // 显示日记
    displayDiary(diary);
  },

  /**
   * 确认删除日记
   */
  confirmDeleteDiary(index) {
    const diaries = this.getAllDiaries();
    const diary = diaries[index];
    if (!diary) return;
    
    if (confirm(`确定要永久删除「${diary.title}」吗？\n删除后无法恢复。`)) {
      this.deleteDiary(index);
      showToast('日记已删除');
      // 刷新历史列表
      this.showHistory();
    }
  },

  /**
   * 删除日记
   */
  deleteDiary(index) {
    const diaries = this.getAllDiaries();
    if (index >= 0 && index < diaries.length) {
      diaries.splice(index, 1);
      StorageManager.save('diaries', diaries);
      Logger.success('日记已删除');
      return true;
    }
    return false;
  },

  /**
   * 分享日记为独立 HTML 文件
   */
  shareDiary(index) {
    const diaries = this.getAllDiaries();
    const diary = diaries[index];
    if (!diary) {
      showToast('日记不存在');
      return;
    }
    this._generateShareHtml(diary);
  },

  /**
   * 生成分享 HTML 文件并下载
   */
  _generateShareHtml(diary) {
    const date = diary.date;
    const time = diary.createdAt ? new Date(diary.createdAt) : new Date();
    const timeSuffix = `${String(time.getHours()).padStart(2,'0')}${String(time.getMinutes()).padStart(2,'0')}${String(time.getSeconds()).padStart(2,'0')}`;
    const title = diary.title || '无标题';
    const content = diary.content || '';
    const tags = diary.tags || [];
    const weather = diary.weather || 'sunny';
    const friendlyDate = DateUtils.getFriendlyDate(date);

    // 安全转义函数
    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    // 天气对应的背景渐变
    const weatherBgMap = {
      sunny: 'linear-gradient(135deg, #74b9ff, #0984e3)',
      cloudy: 'linear-gradient(135deg, #a8d8ea, #5b9bd5)',
      rainy: 'linear-gradient(135deg, #b0bec5, #90a4ae)',
      stormy: 'linear-gradient(135deg, #2d3436, #000000)',
      rainbow: 'linear-gradient(135deg, #fd79a8, #fdcb6e, #00b894, #0984e3)'
    };
    const bgGradient = weatherBgMap[weather] || weatherBgMap.sunny;

    const tagsHtml = tags.map(t => `<span style="display:inline-block;padding:4px 14px;background:rgba(255,255,255,0.7);border-radius:20px;font-size:14px;color:#555;margin-right:6px;">#${escapeHtml(t)}</span>`).join('');

    // 将换行符转为 <br>，同时转义 HTML
    const contentHtml = escapeHtml(content).replace(/\n/g, '<br>');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - 日记帮写</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  background: ${bgGradient};
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 40px 20px;
}
.diary-card {
  background: rgba(255,255,255,0.65);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  padding: 40px;
  max-width: 700px;
  width: 100%;
  border: 1px solid rgba(255,255,255,0.3);
  align-self: flex-start;
}
.diary-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid rgba(0,0,0,0.08);
}
.diary-title {
  font-size: 26px;
  color: #2d3436;
  margin-bottom: 12px;
  font-weight: 700;
}
.diary-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.diary-date {
  font-size: 14px;
  color: #636e72;
}
.diary-content {
  font-size: 16px;
  line-height: 1.9;
  color: #2d3436;
  white-space: pre-wrap;
  margin-bottom: 24px;
}
.diary-footer {
  text-align: center;
  font-size: 13px;
  color: #b2bec3;
  padding-top: 16px;
  border-top: 1px solid rgba(0,0,0,0.06);
}
@media (max-width: 600px) {
  .diary-card { padding: 24px; }
  .diary-title { font-size: 22px; }
}
</style>
</head>
<body>
<div class="diary-card">
  <div class="diary-header">
    <h1 class="diary-title">${escapeHtml(title)}</h1>
    <div class="diary-meta">
      <span class="diary-date">📅 ${friendlyDate}</span>
      ${tagsHtml}
    </div>
  </div>
  <div class="diary-content">${contentHtml}</div>
  <div class="diary-footer">由小度帮你写于日记帮写</div>
</div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `日记_${date}_${timeSuffix}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('日记已分享！');
    Logger.success('日记已分享为 HTML');
  }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  HistoryManager.init();
});
