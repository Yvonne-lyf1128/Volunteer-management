# 志愿者积分管理平台 - 部署指南

## 项目结构
```
volunteer-platform/
├── server.js          # Express 服务器（后端 API）
├── package.json       # 项目依赖
├── data.json          # 数据存储（自动生成）
└── public/
    └── index.html     # 前端页面（志愿者 + 管理员）
```

## 本地运行
```bash
cd volunteer-platform
npm install
node server.js
```
打开浏览器访问 `http://localhost:3000`

## 部署到公网（免费方案）

### 方案一：Railway（推荐，最简单）
1. 注册 https://railway.app（用 GitHub 账号）
2. New Project → Deploy from local folder
3. 选择 `volunteer-platform` 文件夹
4. Railway 自动安装依赖并启动
5. 部署完成后获得公网地址，分享给同学即可

### 方案二：Render
1. 注册 https://render.com
2. New → Web Service
3. 连接 GitHub 仓库，选择项目
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. 部署完成获得公网地址

### 方案三：Vercel + 外部数据库
1. 将项目推到 GitHub
2. 在 Vercel 导入项目
3. 需要额外配置数据库（如 Supabase）

## 使用方式

### 志愿者
1. 打开平台网址
2. 填写姓名 + 学号
3. 添加志愿时长（自动算积分）
4. 兑换奖品
5. 数据实时同步到管理员

### 管理员
1. 点击「管理员后台」
2. 输入密码（默认: admin123）
3. 查看所有志愿者、排行榜、兑换记录
4. 管理奖品、导出数据
5. 修改管理员密码

## 默认管理员密码
`admin123`（首次使用请尽快修改）

## 技术栈
- 后端：Node.js + Express
- 前端：HTML + CSS + JavaScript
- 数据存储：JSON 文件（轻量级，适合小规模使用）
