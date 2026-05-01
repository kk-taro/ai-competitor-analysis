# CompetitorSmart 部署指南

## 概述

本项目包含两部分：
1. **Backend** (Railway) - FastAPI + LangGraph Agent
2. **Frontend** (Vercel) - HTML/CSS/JS 单页应用

---

## 第一步：部署后端到 Railway

### 1.1 创建 GitHub 仓库

1. 登录 GitHub (github.com)
2. 点击右上角 **+** → **New repository**
3. 填写仓库名：`competitorsmart-backend`
4. 选择 **Public** 或 **Private**
5. 点击 **Create repository**

### 1.2 上传后端代码

在 `backend` 文件夹中打开终端，执行：

```bash
# 初始化 git
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit - CompetitorSmart backend"

# 添加远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/competitorsmart-backend.git

# 推送
git push -u origin main
```

或者直接用 GitHub 网页上传 `main.py`、`requirements.txt`、`Procfile` 三个文件。

### 1.3 部署到 Railway

1. 登录 railway.app（用 GitHub 账号登录）
2. 点击 **New Project**
3. 选择 **Deploy from GitHub repo**
4. 选择 `competitorsmart-backend` 仓库
5. 点击 **Deploy**
6. 等待部署完成（约 2-3 分钟）

### 1.4 获取域名

部署完成后：
1. 点击项目进入详情页
2. 在 **Settings** → **Domains** 可以看到你的域名
3. 格式如：`competitorsmart-backend.railway.app`
4. 复制这个域名（后面需要用到）

> 💡 提示：Railway 免费额度每月 $5，足够本项目运行。

---

## 第二步：更新前端代码

### 2.1 修改 RAILWAY_URL

打开 `index.html`，找到第 1043 行：

```javascript
const RAILWAY_URL = 'https://YOUR-APP.railway.app';
```

替换为你的实际域名，例如：

```javascript
const RAILWAY_URL = 'https://competitorsmart-backend.railway.app';
```

保存文件。

### 2.2 部署到 Vercel

1. 把修改后的 `index.html` 提交到你的 Vercel 仓库：

```bash
# 在 frontend 目录
git add index.html
git commit -m "Update Railway backend URL"
git push
```

2. Vercel 会自动重新部署

---

## 文件结构说明

```
competitor_vercel前端/
├── backend/              # Railway 后端代码
│   ├── main.py          # FastAPI 主程序
│   ├── requirements.txt # Python 依赖
│   └── Procfile         # Railway 启动配置
├── index.html           # Vercel 前端页面（已配置 Railway URL）
└── DEPLOY_GUIDE.md      # 本指南
```

---

## 环境变量（可选）

如果需要设置环境变量（如 API 密钥），在 Railway 项目中：

1. 进入项目 → **Variables** 标签
2. 点击 **New Variable**
3. 添加变量名和值
4. 点击 **Deploy** 重新部署

---

## 验证部署

1. 访问 Railway 域名测试后端：
   - `https://your-app.railway.app/` 应返回 `{"status": "ok"}`
   - `https://your-app.railway.app/health` 应返回 `{"status": "healthy"}`

2. 访问 Vercel 域名测试完整功能

---

## 故障排查

### Railway 部署失败

- 检查 `requirements.txt` 是否包含所有依赖
- 检查 `Procfile` 格式是否正确（注意大小写）
- 查看 Railway 的 **Deployments** → **Logs** 查看错误信息

### 前端无法连接后端

- 检查 `index.html` 中的 `RAILWAY_URL` 是否正确
- 检查 Railway 域名是否包含 `https://` 前缀
- 浏览器 F12 → Network 查看请求详情

### CORS 错误

后端已配置 `allow_origins=["*"]`，一般不会有 CORS 问题。如仍有问题，检查：
- Railway 部署是否成功
- URL 是否正确

---

## 下一步

部署完成后，你就可以：
1. 访问 Vercel 前端页面
2. 在表单中填入竞品信息和 API Key
3. Agent 会调用 Railway 后端进行实时联网搜索和分析
4. 约 3-5 分钟后生成完整报告

祝你部署顺利！🚀
