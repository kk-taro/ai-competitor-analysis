// Vercel Serverless Function - 联网搜索 + AI 分析
// 使用 DuckDuckGo 搜索获取最新信息

// 改进的网页内容提取 - 保留更多结构
async function fetchPageContent(url, maxLength = 5000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // 更智能的内容提取
    let text = html
      // 移除脚本和样式
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      // 保留段落和标题结构（转为换行）
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>/gi, '\t')
      .replace(/<\/th>/gi, '\t')
      // 移除所有标签
      .replace(/<[^>]+>/g, '')
      // 清理多余空白
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/[\t ]+/g, ' ')
      .trim();

    // 移除常见的噪音内容
    const noisePatterns = [
      /登录|注册|忘记密码|验证码/g,
      /Cookie|隐私政策|用户协议|法律声明/gi,
      /分享到|收藏|打印|举报/g,
      /上一页|下一页|首页|末页/g,
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g,
    ];

    noisePatterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });

    // 限制长度，保留开头和结尾（通常包含重要信息）
    if (text.length > maxLength) {
      const firstPart = text.substring(0, Math.floor(maxLength * 0.7));
      const lastPart = text.substring(text.length - Math.floor(maxLength * 0.2));
      text = firstPart + '\n\n...[内容省略]...\n\n' + lastPart;
    }

    return text;
  } catch (error) {
    console.error('获取页面内容失败:', url, error.message);
    return null;
  }
}

// 改进的 DuckDuckGo 搜索
async function duckDuckGoSearch(query, maxResults = 3) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`搜索请求失败: ${response.status}`);
    }

    const html = await response.text();

    // 解析搜索结果
    const results = [];
    const resultRegex = /result__a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const snippetRegex = /class="result__snippet"[^>]*>(.*?)<\/a>/g;

    let match;
    let snippetMatch;
    const links = [];
    const titles = [];
    const snippets = [];

    // 提取链接和标题
    while ((match = resultRegex.exec(html)) !== null && links.length < maxResults) {
      let url = match[1];

      // 解码 DuckDuckGo 重定向链接
      if (url.includes('uddg=')) {
        try {
          const encoded = url.match(/uddg=([^&]+)/);
          if (encoded) {
            url = decodeURIComponent(encoded[1]);
          }
        } catch (e) {
          continue;
        }
      }

      // 过滤掉非 HTTP 链接
      if (!url.startsWith('http')) continue;
      // 过滤掉常见的垃圾域名
      if (url.includes('wikipedia.org') || url.includes('zhihu.com/question')) {
        // 保留百科和知乎，但降低优先级
      }

      links.push(url);
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      titles.push(title);
    }

    // 提取摘要
    while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
      const snippet = snippetMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      snippets.push(snippet);
    }

    // 组合结果
    for (let i = 0; i < Math.min(links.length, maxResults); i++) {
      results.push({
        title: titles[i] || '',
        link: links[i] || '',
        snippet: snippets[i] || '',
      });
    }

    return results;
  } catch (error) {
    console.error('搜索错误:', error);
    return [];
  }
}

// Vercel Serverless Function 处理器
module.exports = async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { competitors, market, apiKey, baseUrl, model } = req.body;

    if (!competitors || !market || !apiKey || !baseUrl || !model) {
      res.status(400).json({ error: 'Missing required parameters' });
      return;
    }

    // 设置 SSE 头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // 步骤 1: 执行搜索（减少查询数量以节省时间）
    sendEvent({ type: 'status', message: '🔍 正在搜索最新信息...' });

    const searchQueries = [
      `${competitors} ${market} 2026`,
      `${competitors} ${market} 官网 功能`,
    ];

    let allSearchResults = [];
    for (const query of searchQueries) {
      const results = await duckDuckGoSearch(query, 3);
      allSearchResults = allSearchResults.concat(results);
      sendEvent({ type: 'progress', query, found: results.length });
    }

    // 去重
    allSearchResults = allSearchResults.filter(
      (item, index, self) => index === self.findIndex((t) => t.link === item.link)
    ).slice(0, 6);

    if (allSearchResults.length === 0) {
      sendEvent({ type: 'error', message: '搜索未返回结果，请检查竞品名称和网络连接' });
      res.end();
      return;
    }

    // 步骤 2: 获取网页内容（只抓前3个）
    sendEvent({ type: 'status', message: '📄 正在抓取网页内容...' });

    const enrichedResults = [];
    for (let i = 0; i < Math.min(allSearchResults.length, 3); i++) {
      const result = allSearchResults[i];
      sendEvent({ type: 'status', message: `📄 正在抓取: ${result.title.substring(0, 30)}...` });

      const content = await fetchPageContent(result.link, 4000);
      enrichedResults.push({
        ...result,
        content: content || result.snippet,
      });
    }

    // 步骤 3: 构建搜索上下文（格式化得更好）
    const searchContext = enrichedResults
      .map((r, i) => {
        const content = r.content ? r.content.substring(0, 3000) : r.snippet;
        return `[搜索结果 ${i + 1}]\n标题: ${r.title}\n来源: ${r.link}\n内容摘要:\n${content}\n`;
      })
      .join('\n' + '='.repeat(50) + '\n');

    sendEvent({ type: 'status', message: '🤖 正在生成报告...' });

    // 步骤 4: 调用 AI（改进的 prompt）
    const systemPrompt = `你是一名专业的竞争情报分析师。请基于提供的搜索信息生成完整的竞品分析报告。

## 重要提示
1. 搜索信息可能不完整或有缺失，请基于你掌握的知识补充完整
2. 如果某个数据在搜索结果中找不到，请明确标注为"基于公开资料估算"或"未公开"
3. 不要编造具体数字，不确定的地方写"具体数据未公开"
4. 保持报告结构完整，即使某些章节信息有限也要写出分析框架

## 报告结构（必须严格遵守）
一、报告概述 - 300字左右的摘要
二、市场与赛道分析 - 市场规模、竞争格局
三、竞品选择与分层 - 选择逻辑和分层
四、核心能力拆解 - 每个竞品详细分析（产品定位、核心功能、技术特点、定价策略、用户规模、更新节奏、分发渠道、商业模式、近期动态）
五、商业模式分析 - 收费方式、客单价等
六、增长与分发策略
七、用户与场景分析
八、优劣势对比 - SWOT分析
九、关键差异与壁垒
十、机会点与策略建议
十一、数据附录

## 格式要求
- 使用标准 Markdown 格式
- 多用表格展示对比数据
- 每个章节用 ## 标题
- 总字数不少于 3000 字
- 不要输出星号分隔线（***）
- 保持内容连贯，不要出现明显截断`;

    const userMsg = `请对以下竞争对手进行全面分析：

**竞争对手：** ${competitors}
**市场/产品类别：** ${market}
**地理范围：** 中国市场为主

## 实时搜索获取的最新信息（截至 2026 年）：

${searchContext}

---

**分析要求：**
1. 基于上述搜索结果，结合你的知识生成完整报告
2. 如果搜索信息不完整，请明确说明并补充你的知识
3. 对于不确定的数据，标注"估算"或"未公开"
4. 确保报告结构完整、内容连贯、格式规范
5. 使用表格对比关键数据
6. 不要输出过多星号或分隔符

请直接输出完整报告。`;

    // 调用 AI API
    const apiUrl = baseUrl.endsWith('/') ? baseUrl + 'chat/completions' : baseUrl + '/chat/completions';

    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 12000,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      const error = await aiResponse.text();
      throw new Error(`AI API 错误: ${error}`);
    }

    // 转发 AI 流式响应
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              sendEvent({ type: 'content', content });
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 处理缓冲区中剩余的内容
    if (buffer.startsWith('data: ')) {
      try {
        const data = buffer.slice(6);
        if (data !== '[DONE]') {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            sendEvent({ type: 'content', content });
          }
        }
      } catch (e) {
        // 忽略
      }
    }

    // 发送完成信号
    sendEvent({ type: 'done' });
    res.end();

  } catch (error) {
    console.error('处理错误:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
};
