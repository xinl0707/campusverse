/**
 * 对话工作流模块
 * 每轮对话的标准流程：校验输入 → 调用AI → 校验结果 → 显示
 */

const ConversationWorkflow = {
  // 工作流状态
  isProcessing: false,
  currentStep: null,
  
  // 阿露集成状态
  aluFeedbackCount: 0,
  aluResult: null,
  lastAluFeedback: null,
  
  /**
   * 执行完整工作流
   * @param {Object} context - 工作流上下文
   * @param {string} context.type - 输入类型 ('input' | 'option')
   * @param {string} context.value - 用户输入值
   * @param {string} context.title - 用户输入标题
   * @returns {Promise<Object>} 工作流结果
   */
  async execute(context) {
    if (this.isProcessing) {
      Logger.warn('工作流正在处理中，请等待');
      return { success: false, error: '处理中，请稍后' };
    }
    
    this.isProcessing = true;
    this.currentStep = 'init';
    this.aluFeedbackCount = 0;
    this.aluResult = null;
    this.lastAluFeedback = null;
    
    try {
      // 步骤1: 校验用户输入
      this.currentStep = 'validate-input';
      const validationResult = this.validateUserInput(context);
      if (!validationResult.valid) {
        Logger.warn('用户输入校验失败:', validationResult.error);
        return { success: false, step: 'validate-input', error: validationResult.error };
      }
      
      // 步骤2: 调用AI模型
      this.currentStep = 'call-ai';
      const aiResult = await this.callAI(context);
      if (!aiResult.success) {
        Logger.warn('AI调用失败:', aiResult.error);
        return { success: false, step: 'call-ai', error: aiResult.error };
      }
      
      // 步骤3: 校验AI结果
      this.currentStep = 'validate-ai';
      const aiValidationResult = this.validateAIResult(aiResult.data);
      if (!aiValidationResult.valid) {
        Logger.warn('AI结果校验失败:', aiValidationResult.error);
        return { success: false, step: 'validate-ai', error: aiValidationResult.error };
      }
      
      // 步骤4: 准备显示数据
      this.currentStep = 'prepare-display';
      const displayData = this.prepareDisplayData(aiResult.data, context);
      
      this.currentStep = 'complete';
      return { success: true, data: displayData };
      
    } catch (error) {
      Logger.error('工作流执行异常:', error);
      return { success: false, step: this.currentStep, error: error.message };
    } finally {
      this.isProcessing = false;
      this.currentStep = null;
    }
  },
  
  /**
   * 步骤1: 校验用户输入
   */
  validateUserInput(context) {
    const { type, value, title } = context;
    
    // 检查必要字段
    if (!type || !value) {
      return { valid: false, error: '输入类型或值缺失' };
    }
    
    // 选项类型校验
    if (type === 'option') {
      if (!title) {
        return { valid: false, error: '选项标题缺失' };
      }
    }
    
    // 文本输入校验
    if (type === 'input') {
      const trimmed = (value || '').trim();
      if (trimmed.length === 0) {
        return { valid: false, error: '输入不能为空' };
      }
      if (trimmed.length > 1000) {
        return { valid: false, error: '输入过长，请控制在1000字以内' };
      }
    }
    
    return { valid: true };
  },
  
  /**
   * 步骤2: 调用AI模型
   */
  async callAI(context) {
    const { type, value, title } = context;
    const round = DiaryManager.currentRound;
      
    try {
      // 构建用户响应对象
      const userResponse = { value, title };
        
      // 记录用户响应
      DiaryManager.userResponses.push({
        round: round,
        type: type,
        value: value,
        title: title
      });
        
      // 第1轮选择天气后，立即切换背景和环境音
      if (round === 1) {
        WeatherManager.setWeather(value);
      }
        
      // 记录写作风格选择
      if (round === 2) {
        DiaryManager.writingStyle = value === 'other' 
          ? (title || '自定义') 
          : value;
      }
        
      // 用户选择“可以了，生成日记”
      if (value === 'generate' && round >= DiaryManager.minRounds) {
        DiaryManager.currentRound++;
        const diaryResult = await DiaryManager.generateDiary();
        return { success: true, data: diaryResult };
      }
        
      // 构建当前轮次的提示
      const roundPrompt = DiaryManager.getRoundPrompt(round, userResponse);
        
      DiaryManager.conversationHistory.push({
        role: 'user',
        content: roundPrompt
      });
        
      // 调用小度AI
      const aiReply = await callAI(DiaryManager.conversationHistory);
        
      DiaryManager.conversationHistory.push({
        role: 'assistant',
        content: aiReply
      });
        
      // 第4轮起：交给阿露评估素材
      if (round >= 3) {
        const aluResult = await this.evaluateWithAlu();
        if (aluResult) {
          // 阿露返回了反馈（素材不足），用小度的口吻转达
          return { success: true, data: this.convertAluFeedback(aluResult) };
        }
        // 阿露已生成日记，直接返回
        if (this.aluResult && this.aluResult.type === 'diary') {
          return { success: true, data: this.aluResult };
        }
      }
        
      return { success: true, data: aiReply };
        
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
    
  /**
   * 调用阿露评估当前素材
   * @returns {Object|null} 阿露的反馈，素材充足时返回 null
   */
  async evaluateWithAlu() {
    const material = DiaryManager.collectMaterial();
      
    // 检查阿露反馈次数
    if (this.aluFeedbackCount >= 2) {
      Logger.info('阿露反馈已达上限，强制生成日记');
      return null;
    }
      
    try {
      const aluResult = await AluAgent.requestDiary(material);
        
      if (aluResult.type === 'feedback') {
        this.aluFeedbackCount++;
        Logger.info(`阿露反馈（第${this.aluFeedbackCount}次）:`, aluResult.feedback);
        return aluResult.feedback;
      }
        
      // 素材充足，阿露已生成日记
      if (aluResult.type === 'diary') {
        this.aluResult = aluResult;
        return null;
      }
        
      return null;
    } catch (error) {
      Logger.error('阿露评估失败:', error);
      return null; // 阿露失败时不阻断流程
    }
  },
    
  /**
   * 将阿露的反馈转换为小度的口吻
   * @param {Object} feedback - 阿露的反馈
   * @returns {Object} 显示数据
   */
  convertAluFeedback(feedback) {
    if (!feedback || !feedback.questions || feedback.questions.length === 0) {
      return {
        message: '让我们再多聊一些吧~',
        options: null,
        showInput: true,
        generateDiary: false
      };
    }
      
    // 取优先级最高的问题，用小度的口吻转达
    const topQuestion = feedback.questions.sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return (priority[a.priority] || 1) - (priority[b.priority] || 1);
    })[0];
      
    let message = topQuestion.question;
      
    // 存储阿露反馈
    this.lastAluFeedback = feedback;
      
    return {
      message: message,
      options: null,
      showInput: true,
      generateDiary: false
    };
  },
  
  /**
   * 步骤3: 校验AI结果
   */
  validateAIResult(aiData) {
    // 检查是否为日记生成结果
    if (aiData && aiData.type === 'diary') {
      if (!aiData.diary || !aiData.diary.content) {
        return { valid: false, error: '日记内容缺失' };
      }
      return { valid: true };
    }
    
    // 检查是否为字符串回复
    if (typeof aiData === 'string') {
      if (aiData.trim().length === 0) {
        return { valid: false, error: 'AI返回为空' };
      }
      return { valid: true };
    }
    
    // 检查是否为解析后的对象
    if (aiData && typeof aiData === 'object') {
      if (!aiData.message && !aiData.options) {
        return { valid: false, error: 'AI返回格式异常' };
      }
      return { valid: true };
    }
    
    return { valid: false, error: 'AI返回类型未知' };
  },
  
  /**
   * 步骤4: 准备显示数据
   */
  prepareDisplayData(aiData, context) {
    const round = DiaryManager.currentRound;
    const nextRound = round + 1;
    
    // 日记生成结果
    if (aiData && aiData.type === 'diary') {
      return aiData;
    }
    
    // 已经是显示就绪对象（如阿露反馈转换结果）
    if (aiData && typeof aiData === 'object' && aiData.message !== undefined) {
      DiaryManager.currentRound++;
      if (DiaryManager.currentRound >= DiaryManager.maxRounds) {
        return { type: 'force-generate' };
      }
      return aiData;
    }
    
    // 解析AI回复
    const parsed = DiaryManager.parseAIResponse(aiData, nextRound);
    
    // 递增轮次
    DiaryManager.currentRound++;
    
    // 达到最大轮次，强制生成日记
    if (DiaryManager.currentRound >= DiaryManager.maxRounds) {
      return { type: 'force-generate' };
    }
    
    return parsed;
  },
  
  /**
   * 获取当前工作流状态
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      currentStep: this.currentStep,
      aluFeedbackCount: this.aluFeedbackCount
    };
  }
};
