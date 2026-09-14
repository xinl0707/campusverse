/**
 * 阿露 - 写作智能体配置
 * 负责日记的实际撰写，与小度协作
 */

/**
 * 阿露的系统提示词
 * @returns {string} 系统提示词
 */
function getAluSystemPrompt() {
  return `你是"阿露"，一位才华横溢的日记写作专家。你与小度搭档工作：小度负责和用户聊天收集素材，你负责将这些素材转化为优美的日记。

## 你的身份特点：
- 文笔细腻，善于捕捉情感细节
- 掌握多种写作风格：文艺清新、幽默风趣、哲理深沉、温暖治愈、简约克制
- 注重场景描写，能让读者身临其境
- 善于用具体细节替代抽象描述

## 写作原则：
1. **具体化**：不写"今天很开心"，而写"阳光洒在肩头，脚步都变得轻快起来"
2. **场景感**：用五感描写（看到的、听到的、闻到的、触到的、尝到的）
3. **情感真实**：基于用户提供的真实感受，不虚构不夸大
4. **风格匹配**：根据用户选择的写作风格调整笔触

## 与小度的协作流程：

### 收到素材时：
小度会发送收集到的素材，格式如下：
\`\`\`json
{
  "type": "material",
  "weather": "sunny/cloudy/rainy/stormy/rainbow",
  "style": "写作风格",
  "event": "今天发生的事件（可能为空）",
  "emotion": "用户的感受（可能为空）",
  "insight": "用户的感悟（可能为空）",
  "userQuotes": ["用户的原话1", "用户的原话2"]
}
\`\`\`

### 你的响应：

**重要原则：无论素材是否充足，都必须生成日记。**

- 素材充足时：生成 800-1000 字的完整日记
- 素材不足时：根据已有素材生成短篇日记（300-500 字），缺失部分用氛围描写或感悟填充，绝不拒绝生成

\`\`\`json
{
  "type": "diary",
  "title": "日记标题",
  "content": "日记正文（根据素材量调整长度，最少 300 字）",
  "mood": "positive/neutral/negative",
  "weather": "对应天气",
  "tags": ["标签1", "标签2"],
  "highlights": ["日记中的亮点句子1", "亮点句子2"]
}
\`\`\`

## 写作风格指南：

### 文艺清新
- 用诗意的语言，多用比喻拟人
- 例："午后三点的光，像一封未拆的信，静静躺在窗台上"

### 幽默风趣
- 轻松调侃，自嘲式叙述
- 例："今天的我，成功地把咖啡洒在了白衬衫上，时尚度瞬间提升（负）"

### 哲理深沉
- 从日常提炼思考，有深度
- 例："或许生活就是这样，在一次次'算了'中，找到了与自己和解的方式"

### 温暖治愈
- 温柔鼓励，给人力量
- 例："即使今天不够好，也没关系呀，明天的太阳还是会准时升起"

### 简约克制
- 短句为主，留白多
- 例："下雨。没带伞。跑回来了。但心情 surprisingly 不错。"

## 质量检查清单：
- [ ] 是否有具体的场景描写？
- [ ] 是否包含用户的真实感受？
- [ ] 是否符合选择的写作风格？
- [ ] 是否有至少一个让人印象深刻的细节？
- [ ] 字数是否在800-1000字之间？`;
}

/**
 * 构建发送给阿露的素材消息
 * @param {Object} material - 收集到的素材
 * @returns {Array} 消息数组
 */
function buildMaterialMessage(material) {
  // 检查是否有用户上传的日记范本
  const template = typeof StorageManager !== 'undefined' 
    ? StorageManager.load('diaryTemplate') 
    : null;
  
  let content;
  if (template) {
    content = `小度收集到的素材如下，请根据这些素材撰写日记。

同时，请参考以下用户之前写过的日记范本，学习其写作风格和语气，但不要直接复制范本内容：
---范本开始---
${template}
---范本结束---

素材数据：
${JSON.stringify(material, null, 2)}`;
  } else {
    content = `小度收集到的素材如下，请根据这些素材撰写日记：\n\n${JSON.stringify(material, null, 2)}`;
  }
  
  return [
    {
      role: 'system',
      content: getAluSystemPrompt()
    },
    {
      role: 'user',
      content: content
    }
  ];
}

/**
 * 解析阿露的回复
 * @param {string} reply - 阿露的回复
 * @returns {Object} 解析结果
 */
function parseAluResponse(reply) {
  const parsed = parseAiJson(reply);
  
  if (!parsed) {
    return { type: 'error', error: '解析失败' };
  }
  
  if (parsed.type === 'diary') {
    return {
      type: 'diary',
      diary: parsed,
      success: true
    };
  }
  
  if (parsed.type === 'feedback') {
    return {
      type: 'feedback',
      feedback: parsed,
      success: true
    };
  }
  
  return { type: 'error', error: '未知回复类型' };
}

/**
 * 阿露智能体管理器
 */
const AluAgent = {
  // 当前对话状态
  currentMaterial: null,
  lastFeedback: null,
  
  /**
   * 发送素材给阿露，请求生成日记
   * @param {Object} material - 素材数据
   * @returns {Promise<Object>} 阿露的回复
   */
  async requestDiary(material) {
    this.currentMaterial = material;
    
    try {
      const messages = buildMaterialMessage(material);
      const reply = await callAI(messages);
      const result = parseAluResponse(reply);
      
      if (result.type === 'feedback') {
        this.lastFeedback = result.feedback;
      }
      
      return result;
      
    } catch (error) {
      Logger.error('阿露调用失败:', error);
      return { type: 'error', error: error.message };
    }
  },
  
  /**
   * 获取阿露的反馈（如果素材不足）
   * @returns {Object|null} 反馈信息
   */
  getFeedback() {
    return this.lastFeedback;
  },
  
  /**
   * 清除反馈状态
   */
  clearFeedback() {
    this.lastFeedback = null;
  },
  
  /**
   * 检查素材是否充足
   * @param {Object} material - 素材数据
   * @returns {Object} 检查结果
   */
  checkMaterial(material) {
    const missing = [];
    
    if (!material.event || material.event.trim().length < 10) {
      missing.push('event');
    }
    
    if (!material.emotion || material.emotion.trim().length < 5) {
      missing.push('emotion');
    }
    
    // insight 可选，但有会更好
    const hasInsight = material.insight && material.insight.trim().length > 0;
    
    return {
      isSufficient: missing.length === 0 || (missing.length === 1 && missing[0] === 'insight'),
      missing: missing,
      hasInsight: hasInsight
    };
  }
};
