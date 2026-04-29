// Vercel Serverless Function - 联网搜索 + AI 分析
// 使用 DuckDuckGo 搜索获取最新信息，然后调用 AI 生成报告

export const config = {
  runtime: 'edge',
};

// 简单的 DuckDuckGo 搜索实现
async function duckDuckGoSearch(query, maxResults = 5) {
  try {
    // 使用 DuckDuckGo 的 HTML 版本搜索
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`搜索请求失败: ${response.status}`);
    }

    const html = await response.text();

    // 解析搜索结果
    const results = [];
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;

    let match;
    let snippetMatch;
    const links = [];
    const titles = [];
    const snippets = [];

    // 提取链接和标题
    while ((match = resultRegex.exec(html)) !== null && links.length < maxResults) {
      let url = match[1];
      // 处理 DuckDuckGo 的重定向链接
      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (url.startsWith('/')) {
        url = 'https://duckduckgo.com' + url;
      }

      // 解码 URL
      if (url.includes('uddg=')) {
        const encoded = url.match(/uddg=([^&]+)/);
        if (encoded) {
          url = decodeURIComponent(encoded[1]);
        }
      }

      links.push(url);
      // 清理标题中的 HTML 标签
      const title = match[2].replace(/<[^>]+>/g, '');
      titles.push(title);
    }

    // 提取摘要
    while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
      const snippet = snippetMatch[1].replace(/<[^>]+>/g, '');
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

// 获取网页内容
async function fetchPageContent(url, maxLength = 3000) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000), // 10秒超时
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // 简单的内容提取 - 移除脚本和样式
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 限制长度
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...';
    }

    return text;
  } catch (error) {
    console.error('获取页面内容失败:', url, error);
    return null;
  }
}

// 主处理函数
export default async function handler(request) {
  // 设置 CORS 头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const { competitors, market, apiKey, baseUrl, model } = await request.json();

    if (!competitors || !market || !apiKey || !baseUrl || !model) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 创建流式响应
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // 异步处理搜索和AI调用
    (async () => {
      try {
        // 步骤 1: 发送开始消息
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'status', message: '🔍 正在搜索最新信息...' })}\n\n`)
        );

        // 步骤 2: 执行多个搜索查询
        const searchQueries = [
          `${competitors} ${market} 2026`,
          `${competitors} ${market} 2025`,
          `${competitors} ${market} 最新`,
          `${competitors.split(/[,，、]/)[0]} 产品功能 2026`,
          `${competitors.split(/[,，、]/)[0]} 官网`,
        ];

        let allSearchResults = [];
        for (const query of searchQueries) {
          const results = await duckDuckGoSearch(query, 3);
          allSearchResults = allSearchResults.concat(results);
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: 'progress', query, found: results.length })}\n\n`)
          );
        }

        // 去重
        allSearchResults = allSearchResults.filter(
          (item, index, self) => index === self.findIndex((t) => t.link === item.link)
        ).slice(0, 10);

        // 步骤 3: 获取部分网页内容
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'status', message: '📄 正在抓取网页内容...' })}\n\n`)
        );

        const enrichedResults = [];
        for (const result of allSearchResults.slice(0, 5)) {
          const content = await fetchPageContent(result.link, 2000);
          enrichedResults.push({
            ...result,
            content: content || result.snippet,
          });
        }

        // 步骤 4: 构建搜索上下文
        const searchContext = enrichedResults
          .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.link}\n内容: ${r.content}\n`)
          .join('\n---\n');

        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'status', message: '🤖 正在生成报告...' })}\n\n`)
        );

        // 步骤 5: 调用 AI 生成报告
        const systemPrompt = `你是一名专业的竞争情报分析师。

分析基于以下6个核心PM技能框架：

## 【竞品分析核心原则】
1. 从「竞争替代」开始——如果你的产品不存在，客户会做什么
2. 理解行业经济学——真正的竞争优势需要深入理解底层行业经济关系
3. 从外部视角出发——始终从客户、市场或竞争对手视角出发
4. 包括「模拟」替代——包括传统、非数字的替代方案
5. 竞争包括所有变通方案——客户用来解决问题的任何变通方案或替代品

## 【产品定位分析框架】
1. 定位先于一切——定位决定了营销的所有其他方面
2. 传播的真正标准——确保接收者理解、记住并能复述
3. 品牌是预期设置——为用户设置正确的期望

## 【结构化竞品报告框架】

报告格式要求：
- 以 "# 竞品调研报告：{市场}" 开头
- 必须包含以下11个章节：
  ## 一、报告概述（Executive Summary）
  ## 二、市场与赛道分析（Market Context）（含市场规模、增速、竞争格局、趋势判断，≥3条要点）
  ## 三、竞品选择与分层（Competitive Landscape）
  ## 四、核心能力拆解（Product Capability Analysis）（每个竞品用###单独列，含9个字段：产品定位、核心功能、技术特点、定价策略、用户规模、更新节奏、分发渠道、商业模式、近期动态）
  ## 五、商业模式分析（Monetization）（含收费方式、客单价、付费转化路径，≥3条要点）
  ## 六、增长与分发策略（Growth Strategy）
  ## 七、用户与场景分析（User & Use Case）
  ## 八、优劣势对比（SWOT / 对比矩阵）（每个竞品各列：优势≥3、劣势≥3、机会≥2、威胁≥2）
  ## 九、关键差异与壁垒（Moat Analysis）
  ## 十、机会点与策略建议（Opportunities）（≥3条可执行建议）
  ## 十一、数据附录（Appendix）
- 使用表格对比关键数据
- 总字数不少于4000字
- 每个判断有数据或事实支撑`;

        const userMsg = `请对以下竞争对手进行全面分析，生成专业竞争情报报告：

**竞争对手：** ${competitors}
**市场/产品类别：** ${market}
**地理范围：** 中国市场为主

## 实时搜索获取的最新信息：

以下是通过 DuckDuckGo 搜索获取的最新网页信息，请基于这些信息以及你的知识进行分析：

${searchContext}

---

**重要提示：**
- 请优先使用上述搜索到的最新信息（2025-2026年）
- 如果搜索结果信息不足，请明确说明并基于你的知识补充
- 对于具体数据（用户数、收入、融资额等），如果能找到明确来源请标注，否则请说明是估算
- 报告中的趋势判断需要有数据支撑

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
            max_tokens: 16384,
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter((l) => l.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ type: 'content', content })}\n\n`)
                  );
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }

        // 发送完成信号
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (error) {
        console.error('处理错误:', error);
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`)
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('请求处理错误:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
