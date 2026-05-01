# CompetitorSmart 项目历史与架构说明

## 项目概述

CompetitorSmart 是一个 AI 竞品分析 Agent，能够自动联网搜索竞品信息并生成专业的竞争情报报告。

---

## 部署架构

| 组件 | 部署平台 | 仓库 | 功能 |
|------|---------|------|------|
| **前端** | Vercel | `ai-competitor-analysis` | 用户界面、展示报告 |
| **后端** | Railway | `competitorsmart-backend` | API服务、搜索、AI分析 |

---

## 项目演进历史

### 阶段一：纯前端版本（最初）
- **时间**：项目初期
- **架构**：只有前端 HTML/CSS/JS，部署在 Vercel
- **搜索方式**：使用 JavaScript 直接在前端调用 DuckDuckGo 搜索
- **问题**：
  - 浏览器 CORS 限制，搜索经常失败
  - API Key 暴露在客户端
  - 不稳定

### 阶段二：Vercel Serverless Function（改进）
- **时间**：第一次改进
- **架构**：前端 + Vercel API (`api/analyze.js`)
- **搜索方式**：后端使用 DuckDuckGo 搜索
- **文件**：`api/analyze.js`
- **问题**：
  - Vercel Serverless 有执行时间限制（10秒）
  - 生成报告需要 3-5 分钟，超时
  - DuckDuckGo 经常返回 0 结果

### 阶段三：Python 后端 + Railway（当前）
- **时间**：第二次改进
- **架构**：前端(Vercel) + 后端(Railway)
- **技术栈**：
  - 后端：FastAPI + LangGraph + Python
  - 搜索：原 DuckDuckGo，后改为 Tavily
- **文件**：
  - 后端：`backend/main.py`, `requirements.txt`, `Procfile`
  - 前端：`index.html`

---

## 搜索引擎变更记录

### 原方案：DuckDuckGo
```python
# backend/main.py 原始代码
from duckduckgo_search import DDGS
results = list(DDGS().text(query, max_results=5))
```

**问题**：
- Railway 服务器 IP 被 DuckDuckGo 限制
- 返回 0 条结果
- 免费 API 对云服务器不友好

### 现方案：Tavily API
```python
# backend/main.py 当前代码
from tavily import TavilyClient
client = TavilyClient(api_key=tavily_api_key)
response = client.search(query=query, max_results=5)
```

**优点**：
- 专为 AI 设计的搜索 API
- 返回结构化结果
- 稳定可靠

**限制**：
- 需要 API Key
- 每月 1000 次免费额度

---

## 当前项目状态

### ⚠️ 重要说明
**项目目前处于搁置状态**，原因：

1. **Tavily API 需要额外配置**
   - 需要用户自行注册 Tavily 账号
   - 需要在 Railway 设置 `TAVILY_API_KEY` 环境变量

2. **搜索功能受限**
   - 免费额度仅 1000 次/月
   - 超出后需要付费

3. **后端连接问题**
   - Railway 偶尔出现 `ERR_CONNECTION_CLOSED`
   - 可能是网络不稳定或 Tavily API 调用失败

---

## 文件结构

```
ai-competitor-analysis/          # Vercel 前端仓库
├── index.html                    # 主页面（已更新为 Tavily）
├── api/                          # Vercel Serverless（旧版，未使用）
│   └── analyze.js               # 旧版搜索逻辑（DuckDuckGo）
├── competitor_vercel前端/        # 开发目录
│   ├── backend/                 # Railway 后端代码
│   │   ├── main.py             # FastAPI 主程序
│   │   ├── requirements.txt    # Python 依赖
│   │   └── Procfile            # Railway 部署配置
│   └── index.html              # 前端开发文件
└── PROJECT_HISTORY.md          # 本说明文件

competitorsmart-backend/         # Railway 后端仓库
├── main.py                      # FastAPI 主程序（Tavily 搜索）
├── requirements.txt             # Python 依赖
└── Procfile                     # Railway 部署配置
```

---

## 如何恢复项目

### 方案一：使用 Tavily（推荐，但有限额）

1. **注册 Tavily**
   - 访问 https://tavily.com
   - 用 GitHub/Google 登录
   - 获取 API Key

2. **配置 Railway 环境变量**
   ```
   TAVILY_API_KEY=你的APIKey
   ```

3. **重新部署后端**
   - Railway 会自动重新部署

4. **测试**
   - 访问前端页面
   - 填入竞品信息和 AI API Key
   - 点击"开始分析"

### 方案二：使用其他搜索 API

可选替代方案：
- **Serper.dev**：Google Search API，2500次/月免费
- **Bing Web Search API**：微软提供，需信用卡
- **ScrapingBee**：付费代理服务

修改文件：`backend/main.py` 中的 `search_web` 函数

### 方案三：移除实时搜索（最简单）

如果不使用实时搜索，可以直接：
1. 修改 `main.py` 移除搜索功能
2. 让 AI 直接基于知识库生成报告
3. 用户自行提供竞品信息

---

## 关键配置

### 后端环境变量（Railway）
```bash
TAVILY_API_KEY=tvly-...    # 必需：Tavily API Key
PORT=8000                   # 可选：服务端口
```

### 前端配置（Vercel）
```javascript
// index.html 第 1043 行
const RAILWAY_URL = 'https://web-production-4c183.up.railway.app';
```

### AI API 配置（用户输入）
- **API Key**：用户的 OpenAI/Claude/其他 API Key
- **Base URL**：AI 服务地址
- **Model**：模型名称（如 gpt-4o, claude-opus-4-7）

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | HTML5, CSS3, Vanilla JS, Marked.js |
| 后端 | Python, FastAPI, LangGraph |
| 搜索 | Tavily API（原 DuckDuckGo） |
| AI | OpenAI Compatible API |
| 部署 | Vercel（前端）, Railway（后端） |

---

## 版本历史

| 版本 | 时间 | 变更 |
|------|------|------|
| v1.0 | 初期 | 纯前端，DuckDuckGo 搜索 |
| v2.0 | 改进 | Vercel Serverless，仍用 DuckDuckGo |
| v3.0 | 当前 | Railway 后端，改为 Tavily |

---

## 待解决问题

1. [ ] 搜索 API 不稳定（需更换或移除）
2. [ ] Railway 偶尔连接超时
3. [ ] 需要用户自行配置 Tavily API Key
4. [ ] 免费额度限制（1000次/月）

---

**最后更新**：2026年5月1日
