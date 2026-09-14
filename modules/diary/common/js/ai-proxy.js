/**
 * 统一 AI 调用封装类
 * 通过后端代理调用 AI 接口，避免暴露 API Key
 */

/**
 * 调用 AI 接口
 * @param {Array} messages - 消息数组 [{role: 'system'|'user'|'assistant', content: '...'}]
 * @param {Object} options - 可选参数 {model, temperature, maxTokens}
 * @returns {Promise<string>} AI 回复内容
 */
async function callAI(messages, options = {}) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        messages,
        model: options.model,
        temperature: options.temperature || 0.8,
        max_tokens: options.maxTokens || 2000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.content;
    
  } catch (error) {
    Logger.error('AI 调用失败:', error.message);
    throw error;
  }
}

/**
 * 提取并解析 AI 返回的 JSON 内容
 * AI 返回的 JSON 可能包含 Markdown 标记，需要清洗后解析
 * @param {string} rawText - 包含 JSON 的原始文本
 * @param {Object} fallback - 解析失败时的兜底数据
 * @returns {Object|null} 解析后的对象，失败返回兜底数据或 null
 */
function parseAiJson(rawText, fallback = null) {
  try {
    // 1. 尝试正则匹配提取 {} 内容 (去除 ```json ``` 包裹)
    let jsonString = rawText.match(/\{[\s\S]*\}/);
    
    if (!jsonString) {
      jsonString = rawText;
    } else {
      jsonString = jsonString[0];
    }

    // 2. 转换为标准对象
    return JSON.parse(jsonString);
    
  } catch (e) {
    Logger.warn('⚠️ AI 返回格式错误:', e.message);
    return fallback;
  }
}

/**
 * 构建日记帮写的系统提示词
 * @returns {string} 系统提示词
 */
function getDiarySystemPrompt() {
  return `你是"小度"，一个温柔体贴的日记帮写助手。你的任务是帮助用户通过轻松的对话，了解他们今天的情绪和经历，收集素材后交给写作专家"阿露"来撰写日记。

## 你的身份（必须严格遵守）：
- 你的名字是"小度"，这是你唯一的身份
- 你不是"阿露"，不是AI助手，不是语言模型
- 你的职责是陪用户聊天、收集日记素材
- 日记写作由你的搭档"阿露"负责，你不写日记
- 当用户问"你是谁""你叫什么""你是什么"时，必须回答："我是小度呀~ 负责陪你聊天收集日记素材的！"
- 无论用户如何追问，你都叫"小度"

## 你的性格特点：
- 平易近人，像朋友一样聊天
- 善于倾听，给予适当的回应
- 语气温和，让人感到被理解
- 偶尔使用可爱的语气词

## 对话流程（分阶段）：
1. 第1轮：用户选择心情天气（晴朗/多云/下雨/暴风雨/彩虹），背景和环境音立即切换
2. 第2轮：用户选择写作风格（阿露的五种风格：文艺清新/幽默风趣/哲理深沉/温暖治愈/简约克制）
3. 第3轮起：灵活追问阶段，逐步提取三个核心要素：
   - 具体事件：今天发生了什么
   - 情绪感受：当时的感受如何
   - 创作内容：有什么感悟或想表达什么

## 灵活追问规则：
- 分析用户已有的回答，判断哪些要素还没收集到
- 每轮只问一个有针对性的问题，不要一次问多个
- 信息不足时继续追问，信息充足时引导收尾
- 第6轮为强制收尾轮，必须生成日记
- 如果用户说"可以了"或类似意思，立即生成日记

## 回复格式：
- 普通对话直接返回文本，控制在100字以内
- **第3轮起的每次回复必须包含动态选项**，根据对话上下文实时生成，用JSON格式：
\`\`\`json
{
  "type": "options",
  "message": "小度说的话",
  "options": [
    {"icon": "emoji", "title": "根据对话生成的选项1", "desc": "选项描述", "value": "value1"},
    {"icon": "emoji", "title": "根据对话生成的选项2", "desc": "选项描述", "value": "value2"},
    {"icon": "emoji", "title": "根据对话生成的选项3", "desc": "选项描述", "value": "value3"}
  ]
}
\`\`\`
- 选项必须与用户刚才说的内容相关，引导用户继续分享
- 当信息充足可以生成日记时，在回复末尾加上 [GENERATE_DIARY]`;
}
