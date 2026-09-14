// Vercel Serverless Function - AI 代理接口

module.exports = async (req, res) => {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model } = req.body;
    
    const baseURL = process.env.AI_BASE_URL || 'https://api.xiaomimimo.com/v1';
    const apiKey = process.env.MIMO_API_KEY || process.env.AI_API_KEY;
    const aiModel = model || process.env.AI_MODEL || 'mimo-v2.5';
    
    if (!apiKey) {
      throw new Error('API Key not configured');
    }

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: aiModel,
        messages: messages,
        temperature: 0.8,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'API 返回错误');
    }
    
    if (data.choices && data.choices[0]) {
      return res.status(200).json(data.choices[0].message);
    } else {
      throw new Error('Invalid API Response');
    }

  } catch (error) {
    console.error('❌ AI Call Error:', error.message);
    return res.status(500).json({ error: 'AI 连接失败，请稍后再试' });
  }
};
