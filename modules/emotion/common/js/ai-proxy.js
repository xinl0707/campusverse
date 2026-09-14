/* ========================================
   AI 代理封装 - 黑客松项目
   统一封装所有 AI 调用
   支持两种模式：
   1. 有后端代理时 → 走 /api/chat（本地开发）
   2. 无后端代理时 → 直接调用 MIMO API（GitHub Pages 等静态部署）
   ======================================== */

/**
 * AI 配置
 */
const AI_CONFIG = {
  apiUrl: 'https://api.xiaomimimo.com/v1/chat/completions',
  apiKey: 'sk-ccgd95ipyzhm1z5zak1lk23byp9w8qm615a0cgaz8ywigdhw',
  model: 'mimo-v2.5',
  temperature: 0.8,
  maxTokens: 2000,
  // 是否有后端代理（自动检测）
  hasProxy: (function () {
    try {
      return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    } catch (e) {
      return false;
    }
  })()
};

/**
 * 统一 AI 调用封装
 * @param {Array} messages - 消息数组 [{role: 'system'|'user'|'assistant', content: '...'}]
 * @param {Object} options - 可选参数
 * @returns {Promise<string>} AI 回复内容
 */
async function callAI(messages, options = {}) {
  try {
    if (AI_CONFIG.hasProxy) {
      // 模式 1：通过后端代理调用
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          model: options.model || AI_CONFIG.model,
          temperature: options.temperature || AI_CONFIG.temperature,
          max_tokens: options.maxTokens || AI_CONFIG.maxTokens
        })
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data.content || '';

    } else {
      // 模式 2：直接调用 MIMO API（静态部署）
      const response = await fetch(AI_CONFIG.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + AI_CONFIG.apiKey
        },
        body: JSON.stringify({
          model: options.model || AI_CONFIG.model,
          messages,
          temperature: options.temperature || AI_CONFIG.temperature,
          max_tokens: options.maxTokens || AI_CONFIG.maxTokens
        })
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      if (data.choices && data.choices[0]) {
        return data.choices[0].message.content;
      }
      throw new Error('Invalid API Response');
    }

  } catch (error) {
    console.error('AI 调用失败:', error.message);
    throw error;
  }
}

/**
 * AI 调用并解析 JSON 返回
 * @param {Array} messages - 消息数组
 * @param {Object} options - 可选参数
 * @returns {Promise<Object|null>}
 */
async function callAIJson(messages, options = {}) {
  const rawText = await callAI(messages, options);
  return parseAiJson(rawText);
}
