/**
 * 主逻辑入口
 * 控制页面交互和状态管理
 */

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  Logger.info('日记帮写应用启动');
  
  // 初始化各个管理器
  // WeatherManager 和 AudioManager 已在各自模块中初始化
  
  // 绑定事件
  bindEvents();
  
  // 检查范本状态
  updateTemplateStatus();
  
  // 开始对话
  await startNewConversation();
});

/**
 * 绑定页面事件
 */
function bindEvents() {
  // 发送按钮
  const sendBtn = document.getElementById('sendBtn');
  const userInput = document.getElementById('userInput');
  
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendMessage);
  }
  
  // 输入框回车发送
  if (userInput) {
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }
  
  // 下载按钮
  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      DiaryManager.downloadDiary();
    });
  }
  
  // 分享按钮
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      DiaryManager.shareDiary();
    });
  }
  
  // 新日记按钮
  const newDiaryBtn = document.getElementById('newDiaryBtn');
  if (newDiaryBtn) {
    newDiaryBtn.addEventListener('click', async () => {
      await startNewConversation();
    });
  }
  
  // 范本上传按钮
  const templateUploadBtn = document.getElementById('templateUploadBtn');
  const templateFileInput = document.getElementById('templateFileInput');
  if (templateUploadBtn && templateFileInput) {
    templateUploadBtn.addEventListener('click', () => {
      templateFileInput.click();
    });
    templateFileInput.addEventListener('change', handleTemplateUpload);
  }
}

// ===== 天气预览状态（第1轮专用） =====
let weatherHoverTimer = null;
let weatherSelected = null;
const WEATHER_PREVIEW_DELAY = 500; // 0.5秒防抖

/**
 * 开始天气预览（0.5s 防抖）
 */
function startWeatherPreview(weather) {
  if (weatherSelected) return; // 已选中时不触发悬停预览
  
  clearTimeout(weatherHoverTimer);
  weatherHoverTimer = setTimeout(() => {
    WeatherManager.setWeather(weather);
    // 仅雨后彩虹预览时播放 BGM
    if (typeof AudioManager !== 'undefined') {
      if (weather === 'rainbow') {
        AudioManager.enableBgm();
      } else {
        AudioManager.disableBgm();
      }
    }
  }, WEATHER_PREVIEW_DELAY);
}

/**
 * 停止天气预览，恢复默认
 */
function stopWeatherPreview() {
  clearTimeout(weatherHoverTimer);
  if (!weatherSelected) {
    // 恢复白色背景，关闭所有效果
    WeatherManager.clearAll();
    if (typeof AudioManager !== 'undefined') {
      AudioManager.disableBgm();
      AudioManager.pauseAmbient();
    }
  }
}

/**
 * 重置天气预览状态
 */
function resetWeatherPreview() {
  clearTimeout(weatherHoverTimer);
  weatherSelected = null;
  // 恢复白色背景
  WeatherManager.clearAll();
  if (typeof AudioManager !== 'undefined') {
    AudioManager.disableBgm();
    AudioManager.pauseAmbient();
  }
}

/**
 * 开始新对话
 */
async function startNewConversation() {
  // 清空聊天区域
  clearChat();
  
  // 隐藏日记展示区域
  const diaryContainer = document.getElementById('diaryContainer');
  if (diaryContainer) {
    diaryContainer.style.display = 'none';
  }
  
  // 隐藏日记生成进度条
  DiaryManager.hideGenProgress();
  
  // 隐藏历史记录视图（防御性）
  const historyContainer = document.getElementById('historyContainer');
  if (historyContainer) {
    historyContainer.style.display = 'none';
  }
  
  // 显示聊天容器
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    chatContainer.style.display = 'flex';
  }
  
  // 重置天气预览状态
  resetWeatherPreview();
  
  // 开始对话
  const result = await DiaryManager.startConversation();
  displayAIResponse(result);
}

/**
 * 清空聊天区域
 */
function clearChat() {
  const chatMessages = document.getElementById('chatMessages');
  const optionsContainer = document.getElementById('optionsContainer');
  
  if (chatMessages) {
    chatMessages.innerHTML = '';
  }
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
  }
}

/**
 * 处理发送消息
 */
async function handleSendMessage() {
  const userInput = document.getElementById('userInput');
  const inputArea = document.getElementById('inputArea');
  
  if (!userInput) return;
  
  const message = userInput.value.trim();
  if (!message) return;
  
  // 显示用户消息
  displayUserMessage(message);
  
  // 清空输入框
  userInput.value = '';
  
  // 隐藏输入区域
  if (inputArea) {
    inputArea.style.display = 'none';
  }
  
  // 显示加载状态
  showLoading();
  
  // 处理用户输入 - 使用工作流
  try {
    // 执行工作流
    const workflowResult = await ConversationWorkflow.execute({
      type: 'input',
      value: message,
      title: message
    });
    
    hideLoading();
    
    // 处理工作流结果
    if (!workflowResult.success) {
      // 工作流失败，显示错误
      showToast(workflowResult.error || '处理失败，请重试');
      Logger.error('工作流失败:', workflowResult);
      return;
    }
    
    const result = workflowResult.data;
    
    if (result.type === 'diary') {
      // 显示生成的日记
      displayDiary(result.diary);
    } else if (result.type === 'force-generate') {
      // 强制生成日记
      const diaryResult = await DiaryManager.generateDiary();
      if (diaryResult.type === 'diary') {
        displayDiary(diaryResult.diary);
      }
    } else {
      // 显示 AI 回复
      displayAIResponse(result);
    }
  } catch (error) {
    hideLoading();
    showToast('AI 暂时休息中，请稍后再试~');
    Logger.error('发送消息失败:', error);
  }
}

/**
 * 处理选项选择
 * @param {Object} option - 选中的选项
 */
async function handleOptionSelect(option) {
  // ===== 第1轮天气双击逻辑 =====
  if (DiaryManager.currentRound === 1 && option.value) {
    if (!weatherSelected) {
      // 第1次点击：锁定选中，预览天气
      weatherSelected = option.value;
      WeatherManager.setWeather(option.value);
      
      // 更新选项卡片视觉
      const cards = document.querySelectorAll('.option-card');
      cards.forEach(card => card.classList.remove('selected'));
      
      // 找到被点击的卡片并添加选中态
      const allCards = document.querySelectorAll('.option-card');
      allCards.forEach(card => {
        const titleEl = card.querySelector('.option-title');
        if (titleEl && titleEl.textContent === option.title) {
          card.classList.add('selected');
        }
      });
      
      // 显示确认提示
      const optionsContainer = document.getElementById('optionsContainer');
      const existingHint = optionsContainer?.querySelector('.weather-confirm-hint');
      if (!existingHint && optionsContainer) {
        const hint = document.createElement('div');
        hint.className = 'weather-confirm-hint';
        hint.textContent = '再次点击确认选择，或点击其他天气切换';
        optionsContainer.appendChild(hint);
      }
      
      return;
    }
    
    if (weatherSelected === option.value) {
      // 第2次点击同一个：确认选择，进入第2轮
      weatherSelected = null;
      // 继续执行下方的正常选择逻辑
    } else {
      // 点击了不同的天气：切换选中
      weatherSelected = option.value;
      WeatherManager.setWeather(option.value);
      // 仅雨后彩虹播放 BGM
      if (typeof AudioManager !== 'undefined') {
        if (option.value === 'rainbow') {
          AudioManager.enableBgm();
        } else {
          AudioManager.disableBgm();
        }
      }
      
      const cards = document.querySelectorAll('.option-card');
      cards.forEach(card => card.classList.remove('selected'));
      
      const allCards = document.querySelectorAll('.option-card');
      allCards.forEach(card => {
        const titleEl = card.querySelector('.option-title');
        if (titleEl && titleEl.textContent === option.title) {
          card.classList.add('selected');
        }
      });
      
      return;
    }
  }
  
  // 如果选择了"其他"，显示输入框让用户自由输入
  if (option.value === 'other') {
    displayUserMessage(option.title);
    
    const optionsContainer = document.getElementById('optionsContainer');
    if (optionsContainer) {
      optionsContainer.innerHTML = '';
    }
    
    const inputArea = document.getElementById('inputArea');
    const userInput = document.getElementById('userInput');
    if (inputArea) {
      inputArea.style.display = 'flex';
      if (userInput) {
        userInput.placeholder = '请输入你想要的风格...';
        userInput.focus();
      }
    }
    return;
  }
  
  // 显示用户选择
  displayUserMessage(option.title);
  
  // 清除选项
  const optionsContainer = document.getElementById('optionsContainer');
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
  }
  
  // 显示加载状态
  showLoading();
  
  // 处理选项 - 使用工作流
  try {
    // 执行工作流
    const workflowResult = await ConversationWorkflow.execute({
      type: 'option',
      value: option.value,
      title: option.title
    });
    
    hideLoading();
    
    // 处理工作流结果
    if (!workflowResult.success) {
      // 工作流失败，显示错误
      showToast(workflowResult.error || '处理失败，请重试');
      Logger.error('工作流失败:', workflowResult);
      return;
    }
    
    const result = workflowResult.data;
    
    if (result.type === 'diary') {
      // 显示生成的日记
      displayDiary(result.diary);
    } else if (result.type === 'force-generate') {
      // 强制生成日记
      const diaryResult = await DiaryManager.generateDiary();
      if (diaryResult.type === 'diary') {
        displayDiary(diaryResult.diary);
      }
    } else {
      // 显示 AI 回复
      displayAIResponse(result);
    }
  } catch (error) {
    hideLoading();
    showToast('AI 暂时休息中，请稍后再试~');
    Logger.error('选项处理失败:', error);
  }
}

/**
 * 显示用户消息
 * @param {string} message - 消息内容
 */
function displayUserMessage(message) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble user';
  bubble.textContent = message;
  
  chatMessages.appendChild(bubble);
  scrollToBottom();
}

/**
 * 显示 AI 回复
 * @param {Object} response - AI 回复对象
 */
function displayAIResponse(response) {
  const chatMessages = document.getElementById('chatMessages');
  const optionsContainer = document.getElementById('optionsContainer');
  const inputArea = document.getElementById('inputArea');
  
  if (!chatMessages) return;
  
  // 显示 AI 消息
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai';
  bubble.innerHTML = `<div class="ai-name">小度</div>${response.message}`;
  chatMessages.appendChild(bubble);
  
  // 显示选项
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
    
    if (response.options && response.options.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'options-grid';
      
      // 判断是否为第1轮（天气选项）
      const isWeatherRound = DiaryManager.currentRound === 1;
      
      response.options.forEach(option => {
        const card = document.createElement('div');
        card.className = 'option-card';
        card.style.position = 'relative';
        card.innerHTML = `
          <span class="option-icon">${option.icon}</span>
          <div class="option-content">
            <div class="option-title">${option.title}</div>
            <div class="option-desc">${option.desc}</div>
          </div>
          <span class="check-mark">✓</span>
        `;
        
        // 第1轮：绑定天气预览事件
        if (isWeatherRound && option.value) {
          card.addEventListener('mouseenter', () => {
            startWeatherPreview(option.value);
          });
          card.addEventListener('mouseleave', () => {
            stopWeatherPreview();
          });
        }
        
        card.addEventListener('click', () => handleOptionSelect(option));
        grid.appendChild(card);
      });
      
      optionsContainer.appendChild(grid);
      
      // 已选中时显示确认提示
      if (weatherSelected) {
        const hint = document.createElement('div');
        hint.className = 'weather-confirm-hint';
        hint.textContent = '再次点击已选中的天气即可确认，或点击其他天气切换';
        optionsContainer.appendChild(hint);
      }
    }
  }
  
  // 显示输入框
  if (inputArea) {
    inputArea.style.display = response.showInput ? 'flex' : 'none';
  }
  
  scrollToBottom();
}

/**
 * 显示生成的日记
 * @param {Object} diary - 日记数据
 */
function displayDiary(diary) {
  // 日记生成后自动播放 BGM（15% 音量）
  if (typeof AudioManager !== 'undefined') {
    AudioManager.bgm.volume = 0.15;
    AudioManager.enableBgm();
  }
  
  // 隐藏聊天容器
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    chatContainer.style.display = 'none';
  }
  
  // 显示日记容器
  const diaryContainer = document.getElementById('diaryContainer');
  if (diaryContainer) {
    diaryContainer.style.display = 'block';
  }
  
  // 填充日记内容
  const diaryTitle = document.getElementById('diaryTitle');
  const diaryDate = document.getElementById('diaryDate');
  const diaryTags = document.getElementById('diaryTags');
  const diaryContent = document.getElementById('diaryContent');
  
  if (diaryTitle) diaryTitle.textContent = diary.title;
  if (diaryDate) diaryDate.textContent = DateUtils.getFriendlyDate(diary.date);
  
  if (diaryTags) {
    diaryTags.innerHTML = '';
    diary.tags.forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag';
      tagEl.textContent = `#${tag}`;
      diaryTags.appendChild(tagEl);
    });
  }
  
  if (diaryContent) diaryContent.textContent = diary.content;
  
  Logger.success('日记已显示');
}

/**
 * 显示加载状态
 */
function showLoading() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const loading = document.createElement('div');
  loading.className = 'chat-bubble ai loading-bubble';
  loading.id = 'loadingBubble';
  loading.innerHTML = `
    <div class="ai-name">小度</div>
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  chatMessages.appendChild(loading);
  scrollToBottom();
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
  const loading = document.getElementById('loadingBubble');
  if (loading) {
    loading.remove();
  }
}

/**
 * 处理范本文件上传
 */
function handleTemplateUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    // 保存到 localStorage
    StorageManager.save('diaryTemplate', content);
    showToast('范本已上传！阿露将参考你的写作风格');
    Logger.success('日记范本已保存');
    
    // 更新范本状态显示
    updateTemplateStatus();
  };
  reader.readAsText(file);
  
  // 重置 input
  event.target.value = '';
}

/**
 * 更新范本状态显示
 */
function updateTemplateStatus() {
  const templateStatus = document.getElementById('templateStatus');
  if (!templateStatus) return;
  
  const template = StorageManager.load('diaryTemplate');
  if (template) {
    const preview = template.substring(0, 30) + (template.length > 30 ? '...' : '');
    templateStatus.textContent = '✅ 已有范本：' + preview;
    templateStatus.style.display = 'block';
  } else {
    templateStatus.style.display = 'none';
  }
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}
