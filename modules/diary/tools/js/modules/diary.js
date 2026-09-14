/**
 * 日记模块
 * 核心业务逻辑：多轮对话、选项处理、日记生成
 */

const DiaryManager = {
  // 对话状态
  currentRound: 0,
  conversationHistory: [],
  userResponses: [],
  
  // 当前日记数据
  currentDiary: null,
  
  // 第一轮选项（情绪天气）
  round1Options: [
    { icon: '☀️', title: '晴朗', desc: '心情明媚，充满阳光', value: 'sunny' },
    { icon: '⛅', title: '多云', desc: '有些纠结，不太确定', value: 'cloudy' },
    { icon: '🌧️', title: '小雨', desc: '有点伤感，需要安慰', value: 'rainy' },
    { icon: '⛈️', title: '暴风雨', desc: '情绪激烈，需要释放', value: 'stormy' },
    { icon: '🌈', title: '雨后彩虹', desc: '经历困难后看到希望', value: 'rainbow' }
  ],
  
  // 第二轮选项（阿露的写作风格，仅选项）
  round2Options: [
    { icon: '🌿', title: '文艺清新', desc: '诗意语言，比喻拟人', value: 'literary' },
    { icon: '😄', title: '幽默风趣', desc: '轻松调侃，自嘲叙述', value: 'humorous' },
    { icon: '🤔', title: '哲理深沉', desc: '从日常提炼思考', value: 'philosophical' },
    { icon: '🌸', title: '温暖治愈', desc: '温柔鼓励，给人力量', value: 'warm' },
    { icon: '✏️', title: '简约克制', desc: '短句为主，留白多', value: 'minimalist' }
  ],
  
  // 最大轮次（灵活追问，最少3轮，最多6轮）
  maxRounds: 6,
  minRounds: 3,
  
  /**
   * 初始化日记管理器
   */
  init() {
    this.reset();
    Logger.info('日记管理器已初始化');
  },
  
  /**
   * 重置状态
   */
  reset() {
    this.currentRound = 0;
    this.conversationHistory = [{
      role: 'system',
      content: getDiarySystemPrompt()
    }];
    this.userResponses = [];
    this.currentDiary = null;
    this.writingStyle = null;
  },
  
  /**
   * 开始新对话
   */
  async startConversation() {
    this.reset();
    
    // 发送开场消息
    const openingMessage = '你好呀！我是小度，很高兴陪你写日记~ 先选一个符合你现在心情的天气吧！';
    
    this.conversationHistory.push({
      role: 'assistant',
      content: openingMessage
    });
    
    // 显示第一轮选项
    this.currentRound = 1;
    return {
      message: openingMessage,
      options: this.round1Options,
      showInput: false
    };
  },
  
  /**
   * 处理用户选择选项
   * @param {Object} option - 用户选择的选项
   */
  async handleOptionSelect(option) {
    // 记录用户响应
    this.userResponses.push({
      round: this.currentRound,
      type: 'option',
      value: option.value,
      title: option.title
    });
    
    // 根据轮次处理
    return await this.processRound(option);
  },
  
  /**
   * 处理用户输入
   * @param {string} input - 用户输入的文本
   */
  async handleUserInput(input) {
    // 记录用户响应
    this.userResponses.push({
      round: this.currentRound,
      type: 'input',
      value: input
    });
    
    // 根据轮次处理
    return await this.processRound({ value: 'custom', title: input });
  },
  
  /**
   * 处理当前轮次
   * @param {Object} response - 用户的响应
   */
  async processRound(response) {
    const round = this.currentRound;
    
    // 第1轮选择天气后，立即切换背景和环境音
    if (round === 1) {
      WeatherManager.setWeather(response.value);
    }
    
    // 记录写作风格选择
    if (round === 2) {
      this.writingStyle = response.value === 'other' 
        ? (response.title || '自定义') 
        : response.value;
    }
    
    // 用户选择“可以了，生成日记”（灵活追问阶段的收尾选项）
    if (response.value === 'generate' && round >= this.minRounds) {
      this.currentRound++;
      return await this.generateDiary();
    }
    
    try {
      const aiResponse = await this.callAIForRound(round, response);
      
      // 达到最大轮次，强制生成日记
      if (this.currentRound >= this.maxRounds) {
        this.currentRound++;
        return await this.generateDiary();
      }
      
      // AI 判断信息充足，可以生成日记
      if (aiResponse.generateDiary && round >= this.minRounds) {
        this.currentRound++;
        return await this.generateDiary();
      }
      
      return aiResponse;
      
    } catch (error) {
      Logger.error('AI 调用失败:', error);
      return this.getFallbackResponse(round);
      
    } finally {
      // 无论成功失败都递增轮次，防止卡死
      this.currentRound++;
    }
  },
  
  /**
   * 调用 AI 获取当前轮次的回复
   * @param {number} round - 当前轮次
   * @param {Object} response - 用户响应
   */
  async callAIForRound(round, response) {
    // 构建当前轮次的提示
    const roundPrompt = this.getRoundPrompt(round, response);
    
    this.conversationHistory.push({
      role: 'user',
      content: roundPrompt
    });
    
    const aiReply = await callAI(this.conversationHistory);
    
    this.conversationHistory.push({
      role: 'assistant',
      content: aiReply
    });
    
    // 解析 AI 回复
    return this.parseAIResponse(aiReply, round + 1);
  },
  
  /**
   * 获取当前轮次的提示词
   * @param {number} round - 当前轮次
   * @param {Object} response - 用户响应
   */
  getRoundPrompt(round, response) {
    const prompts = {
      1: `用户选择了“${response.title}”作为今天的心情天气。请根据天气氛围，友好地回应，然后询问用户想写一篇什么风格的日记。`,
      2: `用户选择了"${response.title}"的写作风格（阿露的风格）。请友好地回应，然后开始了解今天发生了什么。`
    };
      
    if (prompts[round]) return prompts[round];
      
    // 第3轮起：灵活追问
    if (round >= 3) {
      const collected = this.analyzeCollectedInfo();
        
      if (!collected.hasEvent) {
        return `用户选择了“${response.title}”。请友好地回应，然后引导用户分享今天发生的具体事件。`;
      } else if (!collected.hasEmotion) {
        return `用户分享了：“${response.title}”。请对用户的分享表示理解和共情，然后询问当时的具体感受。`;
      } else if (!collected.hasInsight) {
        return `用户分享了感受：“${response.title}”。请表示理解，然后引导用户思考有什么感悟或想对自己说的话。`;
      } else {
        return `用户说：“${response.title}”。信息已经很充分了，请温暖地总结，并询问是否准备好生成日记。`;
      }
    }
      
    return '';
  },
    
  /**
   * 分析已收集的要素信息
   */
  analyzeCollectedInfo() {
    const responses = this.userResponses;
    return {
      hasEvent: responses.some(r => 
        r.round >= 3 && (r.type === 'input' || r.title?.length > 10)),
      hasEmotion: responses.some(r => 
        r.round >= 3 && r.type === 'input' && 
        /开心|难过|伤心|生气|兴奋|失落|感动|焦虑|紧张|平静|快乐|悲伤|烦躁|幸福/.test(r.value || '')),
      hasInsight: responses.some(r => 
        r.round >= 4 && r.type === 'input' && (r.value || '').length > 20)
    };
  },
  
  /**
   * 解析 AI 回复
   * @param {string} reply - AI 的回复
   * @param {number} nextRound - 下一轮次
   */
  parseAIResponse(reply, nextRound) {
    // 安全检查：确保 reply 是字符串
    if (typeof reply !== 'string') {
      Logger.warn('parseAIResponse 收到非字符串:', typeof reply);
      reply = String(reply || '');
    }
    
    // 检查是否包含日记生成标记
    if (reply.includes('[GENERATE_DIARY]') && this.currentRound >= this.minRounds) {
      const cleanReply = reply.replace('[GENERATE_DIARY]', '').trim();
      return {
        message: cleanReply,
        options: [{ icon: '📖', title: '生成日记', desc: '开始写日记吧', value: 'generate' }],
        showInput: false,
        generateDiary: true
      };
    }
    
    // 尝试解析 JSON
    const parsed = parseAiJson(reply);
    
    if (parsed && parsed.type === 'options') {
      // 优先使用 AI 生成的动态选项
      const aiOptions = parsed.options || [];
      // 第3轮起始终添加"生成日记"选项
      if (nextRound >= this.minRounds) {
        aiOptions.push({ icon: '📖', title: '可以了，生成日记', desc: '开始写日记吧', value: 'generate' });
      }
      return {
        message: parsed.message || reply,
        options: aiOptions.length > 0 ? aiOptions : this.getOptionsForRound(nextRound),
        showInput: nextRound >= this.minRounds,
        generateDiary: false
      };
    }
    
    // 普通文本回复：第3轮起让 AI 生成选项，其他轮次用预定义
    let options = null;
    if (nextRound >= 3) {
      // 第3轮起不再使用预定义选项，改为显示输入框
      options = null;
    } else {
      options = this.getOptionsForRound(nextRound);
    }
    
    return {
      message: reply,
      options: options,
      showInput: nextRound >= this.minRounds,
      generateDiary: false
    };
  },
  
  /**
   * 获取当前轮次的选项
   * @param {number} round - 轮次
   */
  getOptionsForRound(round) {
    if (round === 2) return this.round2Options;
    if (round >= this.minRounds) return this.generateFlexibleOptions();
    return null;
  },
  
  /**
   * 动态生成灵活追问阶段的选项
   * 根据已收集的要素（事件、情绪、创作内容）生成引导选项
   */
  generateFlexibleOptions() {
    const responses = this.userResponses;
    const hasEvent = responses.some(r => 
      r.round >= 3 && (r.type === 'input' || r.title?.length > 10));
    const hasEmotion = responses.some(r => 
      r.round >= 3 && r.type === 'input' && 
      /开心|难过|伤心|生气|兴奋|失落|感动|焦虑|紧张|平静|快乐|悲伤|烦躁|幸福/.test(r.value || ''));
    const hasInsight = responses.some(r => 
      r.round >= 4 && r.type === 'input' && (r.value || '').length > 20);
    
    const options = [];
    
    if (!hasEvent) {
      options.push(
        { icon: '💼', title: '工作上的事', desc: '和同事或任务有关', value: 'work-event' },
        { icon: '👥', title: '和朋友/家人', desc: '社交相关的经历', value: 'social-event' },
        { icon: '🏠', title: '日常琐事', desc: '平凡的一天', value: 'daily-event' }
      );
    } else if (!hasEmotion) {
      options.push(
        { icon: '😊', title: '感觉还不错', desc: '心情比较愉快', value: 'good-mood' },
        { icon: '😔', title: '有点低落', desc: '心情不太好', value: 'low-mood' },
        { icon: '😤', title: '有些烦躁', desc: '遇到了烦心事', value: 'frustrated' },
        { icon: '🤔', title: '心情复杂', desc: '说不清的感受', value: 'complex-mood' }
      );
    } else {
      options.push(
        { icon: '💭', title: '有些感悟', desc: '想分享心得', value: 'insight' },
        { icon: '🎯', title: '学到了东西', desc: '有所收获', value: 'learned' },
        { icon: '🌟', title: '想鼓励自己', desc: '给自己加油', value: 'encourage' }
      );
    }
    
    // 始终提供"可以了"选项（最少3轮后）
    if (this.currentRound >= this.minRounds) {
      options.push(
        { icon: '📖', title: '可以了，生成日记', desc: '开始写日记吧', value: 'generate' }
      );
    }
    
    return options;
  },
  
  /**
   * 生成最终日记 - 通过阿露撰写
   */
  async generateDiary() {
    // 显示进度条
    this.showGenProgress();
    
    // 获取当前时间信息
    const now = new Date();
    const dateStr = DateUtils.formatDate(now);
    const timeStr = DateUtils.formatTime(now);
    const friendlyDate = DateUtils.getFriendlyDate(dateStr);
    
    // 阶段1: 收集素材
    this.updateGenProgress(10, '📋 收集素材...');
    const material = this.collectMaterial();
    material.dateInfo = `${friendlyDate} ${timeStr}`;
    
    // 阶段2: 阿露构思
    this.updateGenProgress(30, '🌸 阿露构思中...');
    await this.delay(800);
    
    try {
      // 阶段3: 撰写日记
      this.updateGenProgress(55, '✍️ 阿露正在撰写...');
      const aluResult = await AluAgent.requestDiary(material);
      
      // 阶段4: 润色
      this.updateGenProgress(90, '✨ 润色中...');
      await this.delay(500);
      
      if (aluResult.type === 'diary' && aluResult.diary) {
        const diary = aluResult.diary;
        this.currentDiary = {
          ...diary,
          date: dateStr,
          createdAt: Date.now()
        };
        
        // 保存日记到本地
        this.saveDiary(this.currentDiary);
        
        // 更新天气
        WeatherManager.setWeather(diary.weather || 'sunny');
        
        // 完成
        this.updateGenProgress(100, '✅ 日记写好了！');
        await this.delay(600);
        this.hideGenProgress();
        
        return {
          type: 'diary',
          diary: this.currentDiary
        };
      }
      
      // 阿露返回非日记结果，用兆底
      Logger.warn('阿露返回了非日记结果:', aluResult);
      this.updateGenProgress(100, '✅ 完成');
      await this.delay(400);
      this.hideGenProgress();
      return this.getFallbackDiary();
      
    } catch (error) {
      Logger.error('日记生成失败:', error);
      this.updateGenProgress(100, '✅ 完成');
      await this.delay(400);
      this.hideGenProgress();
      return this.getFallbackDiary();
    }
  },
  
  /**
   * 进度条辅助方法
   */
  showGenProgress() {
    const el = document.getElementById('genProgress');
    if (el) el.style.display = 'block';
  },
  
  hideGenProgress() {
    const el = document.getElementById('genProgress');
    if (el) el.style.display = 'none';
  },
  
  updateGenProgress(percent, stageText) {
    const fill = document.getElementById('genProgressFill');
    const percentEl = document.getElementById('genProgressPercent');
    const stage = document.getElementById('genProgressStage');
    if (fill) fill.style.width = percent + '%';
    if (percentEl) percentEl.textContent = percent + '%';
    if (stage) stage.textContent = stageText;
  },
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * 收集对话素材，供阿露评估和撰写
   */
  collectMaterial() {
    const responses = this.userResponses;
    const userQuotes = [];
    let eventParts = [];
    let emotionParts = [];
    let insightParts = [];
    
    responses.forEach(r => {
      if (r.round >= 3 && r.type === 'input') {
        userQuotes.push(r.value);
        // 简单分类
        if (/开心|难过|伤心|生气|兴奋|失落|感动|焦虑|紧张|平静|快乐|悲伤|烦躁|幸福|害怕|担心|骄傲/.test(r.value)) {
          emotionParts.push(r.value);
        } else if (r.value.length > 20 && /觉得|感觉|想到|明白|懂得|领悟|感悟|体会|收获/.test(r.value)) {
          insightParts.push(r.value);
        } else {
          eventParts.push(r.value);
        }
      }
    });
    
    return {
      type: 'material',
      weather: responses.find(r => r.round === 1)?.value || 'sunny',
      style: this.writingStyle || 'warm',
      event: eventParts.join('；') || '',
      emotion: emotionParts.join('；') || '',
      insight: insightParts.join('；') || '',
      userQuotes: userQuotes
    };
  },
  
  /**
   * 保存日记到本地存储
   * @param {Object} diary - 日记数据
   */
  saveDiary(diary) {
    const diaries = StorageManager.load('diaries') || [];
    diaries.push(diary);
    StorageManager.save('diaries', diaries);
    Logger.success('日记已保存');
  },
  
  /**
   * 获取兜底回复
   * @param {number} round - 当前轮次
   */
  getFallbackResponse(round) {
    if (round === 1) {
      return {
        message: '好的呢~ 那你想写一篇什么风格的日记呀？',
        options: this.round2Options,
        showInput: false
      };
    }
    
    if (round === 2) {
      return {
        message: '听起来很有意思呢~ 那今天发生了些什么事情呀？',
        options: this.generateFlexibleOptions(),
        showInput: true
      };
    }
    
    // 第3轮起：灵活追问兜底
    const collected = this.analyzeCollectedInfo();
    
    if (!collected.hasEvent) {
      return {
        message: '听起来很有意思呢~ 能再多说一些细节吗？比如当时发生了什么？',
        options: this.generateFlexibleOptions(),
        showInput: true
      };
    } else if (!collected.hasEmotion) {
      return {
        message: '我理解你的感受~ 当时具体是什么感觉呢？',
        options: this.generateFlexibleOptions(),
        showInput: true
      };
    } else if (!collected.hasInsight) {
      return {
        message: '你的感受很真实~ 有什么感悟想记录下来吗？',
        options: this.generateFlexibleOptions(),
        showInput: true
      };
    }
    
    // 信息充足
    return {
      message: '你分享了很多呢~ 准备好生成你的日记了吗？',
      options: [
        { icon: '📖', title: '生成日记', desc: '开始写日记吧', value: 'generate' },
        { icon: '💬', title: '我还想说...', desc: '继续聊聊', value: 'continue' }
      ],
      showInput: true
    };
  },
  
  /**
   * 获取兜底日记
   */
  getFallbackDiary() {
    const diary = {
      type: 'diary',
      title: '今天的日记',
      content: '今天是很特别的一天。虽然小度暂时无法生成完整的日记，但你的每一天都值得被记录。\n\n感谢你的分享，希望明天会更好~',
      mood: 'neutral',
      weather: 'cloudy',
      tags: ['日常'],
      date: DateUtils.formatDate(),
      createdAt: Date.now()
    };
    
    this.currentDiary = diary;
    this.saveDiary(diary);
    
    return {
      type: 'diary',
      diary: diary
    };
  },
  
  /**
   * 下载日记为纯文本文件
   */
  downloadDiary() {
    if (!this.currentDiary) {
      showToast('没有可下载的日记');
      return;
    }
    
    const diary = this.currentDiary;
    const date = diary.date;
    const time = diary.createdAt ? new Date(diary.createdAt) : new Date();
    const timeSuffix = `${String(time.getHours()).padStart(2,'0')}${String(time.getMinutes()).padStart(2,'0')}${String(time.getSeconds()).padStart(2,'0')}`;
    const title = diary.title;
    const content = diary.content;
    const tags = (Array.isArray(diary.tags) ? diary.tags : []).join(' ');
    
    // 构建文本内容（保持原模板）
    const text = `# ${title}

> 📅 ${DateUtils.getFriendlyDate(date)} | 🏷️ ${tags}

---

${content}

---

*由小度帮你写于 ${DateUtils.formatDateTime()}*
`;
    
    // 创建下载
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `日记_${date}_${timeSuffix}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('日记已下载！');
    Logger.success('日记已下载');
  },

  /**
   * 分享当前日记为独立 HTML 文件
   */
  shareDiary() {
    if (!this.currentDiary) {
      showToast('没有可分享的日记');
      return;
    }
    // 委托给 HistoryManager 的生成方法
    if (typeof HistoryManager !== 'undefined') {
      HistoryManager._generateShareHtml(this.currentDiary);
    } else {
      showToast('分享功能不可用');
    }
  },
  
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  DiaryManager.init();
});
