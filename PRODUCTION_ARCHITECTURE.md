# 生產環境架構設計

## 🎯 現有問題分析

### ❌ 當前架構的問題

1. **安全性問題**
   - API Key 暴露在前端代碼中
   - 任何人都可以查看瀏覽器源碼獲取密鑰
   - 沒有用戶認證機制

2. **用戶體驗差**
   - 主播需要手動輸入技術參數
   - 需要知道 API Server URL
   - 配置步驟繁瑣

3. **部署困難**
   - 前端需要硬編碼後端地址
   - 無法動態適應不同環境
   - 配置管理混亂

## ✅ 生產環境架構方案

### 方案 1：同源部署（推薦）

```
┌──────────────────────────────────────────────┐
│         單一域名: live.example.com            │
├──────────────────────────────────────────────┤
│                                              │
│  Nginx / CDN (反向代理)                       │
│                                              │
│  ├─ /                → 靜態前端（broadcaster）│
│  ├─ /viewer          → 靜態前端（viewer）     │
│  ├─ /api/*           → API Server (3000)    │
│  └─ /ws              → WebSocket (3000)     │
│                                              │
└──────────────────────────────────────────────┘

優勢：
✅ 同源，無 CORS 問題
✅ API 自動發現（相對路徑 /api）
✅ SSL/TLS 統一管理
✅ 部署簡單
```

#### Nginx 配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name live.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 前端靜態文件 - 主播端
    location / {
        root /var/www/broadcaster;
        try_files $uri $uri/ /index.html;
    }

    # 前端靜態文件 - 觀眾端
    location /viewer {
        alias /var/www/viewer;
        try_files $uri $uri/ /viewer/index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://localhost:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 方案 2：前後端分離部署

```
┌─────────────────────┐      ┌──────────────────────┐
│   前端 (CDN)        │      │   後端 (API Server)   │
│   app.example.com   │─────>│   api.example.com    │
│                     │      │                      │
│   - Cloudflare      │      │   - EC2 / ECS        │
│   - AWS CloudFront  │      │   - Load Balancer    │
│   - Vercel          │      │   - Auto Scaling     │
└─────────────────────┘      └──────────────────────┘

配置：
- 前端環境變數：VITE_API_URL=https://api.example.com
- 後端 CORS：允許 https://app.example.com
- 使用 JWT/Session 認證
```

### 方案 3：完全集成（最簡單）

```
API Server 同時提供：
- 靜態文件服務（前端頁面）
- REST API
- WebSocket

優勢：
✅ 部署最簡單
✅ 單一容器/進程
✅ 配置最少

劣勢：
❌ 擴展性較差
❌ 前端更新需要重啟後端
```

## 🔐 認證機制設計

### 選項 1：Session-Based Auth（推薦）

```typescript
// 後端：登入端點
POST /api/auth/login
Body: { username, password }
Response: Set-Cookie: session_id=xxx; HttpOnly; Secure

// 前端：自動攜帶 Cookie
fetch('/api/broadcaster/stages', {
  credentials: 'include'
})

// 後端：驗證中間件
app.use((req, res, next) => {
  const sessionId = req.cookies.session_id;
  if (validateSession(sessionId)) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});
```

### 選項 2：JWT Token

```typescript
// 後端：登入端點
POST /api/auth/login
Response: { token: "eyJhbGc..." }

// 前端：存儲在 localStorage
localStorage.setItem('auth_token', token);

// 前端：每次請求攜帶
fetch('/api/broadcaster/stages', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

### 選項 3：OAuth2（企業級）

```
使用第三方認證：
- Google OAuth
- GitHub OAuth
- Auth0
- AWS Cognito

優勢：
✅ 無需管理密碼
✅ 支持 SSO
✅ 安全性高
```

## 📦 環境配置管理

### 前端配置（使用構建時環境變數）

**開發環境 (.env.development):**
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

**生產環境 (.env.production):**
```env
VITE_API_URL=https://live.example.com
VITE_WS_URL=wss://live.example.com
```

**前端代碼:**
```javascript
// config.js
const config = {
  apiUrl: import.meta.env.VITE_API_URL || '/api',
  wsUrl: import.meta.env.VITE_WS_URL || '/ws'
};

// 使用
fetch(`${config.apiUrl}/broadcaster/stages`)
```

### 後端配置

```env
# .env
NODE_ENV=production
API_PORT=3000

# AWS
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
MASTER_STAGE_ARN=xxx

# 認證
SESSION_SECRET=your-random-secret-here
JWT_SECRET=your-jwt-secret-here

# CORS (生產環境)
CORS_ORIGINS=https://live.example.com

# Redis
REDIS_URL=redis://localhost:6379

# 資料庫
DB_URL=postgresql://user:pass@localhost:5432/ivs_live
```

## 🚀 部署方案

### Docker Compose（推薦用於測試/小型部署）

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./web-frontend:/var/www
      - ./ssl:/etc/ssl
    depends_on:
      - api-server

  api-server:
    build: ./api-server
    environment:
      - NODE_ENV=production
      - API_PORT=3000
    env_file:
      - .env
    depends_on:
      - redis
      - postgres

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ivs_live
      POSTGRES_USER: ivs
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  redis-data:
  postgres-data:
```

### Kubernetes（大型部署）

```yaml
# api-server deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ivs-api-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ivs-api-server
  template:
    metadata:
      labels:
        app: ivs-api-server
    spec:
      containers:
      - name: api-server
        image: your-registry/ivs-api-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: ivs-secrets
---
# Service
apiVersion: v1
kind: Service
metadata:
  name: ivs-api-service
spec:
  selector:
    app: ivs-api-server
  ports:
  - port: 80
    targetPort: 3000
---
# Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ivs-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - live.example.com
    secretName: ivs-tls
  rules:
  - host: live.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: ivs-api-service
            port:
              number: 80
```

## 🎨 前端改進建議

### 移除手動配置

**之前（不好）：**
```html
<input type="text" id="apiServer" placeholder="輸入 API Server URL">
<input type="password" id="apiKey" placeholder="輸入 API Key">
```

**之後（好）：**
```javascript
// 自動檢測 API 地址
const API_BASE_URL = window.location.origin;

// 或使用構建時配置
const API_BASE_URL = import.meta.env.VITE_API_URL || window.location.origin;

// 認證通過登入流程
async function login(username, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // 自動處理 Cookie
    body: JSON.stringify({ username, password })
  });
  return response.ok;
}
```

### 簡化主播端界面

```html
<!-- 登入頁面 -->
<div id="login-page">
  <h1>主播登入</h1>
  <input type="text" placeholder="用戶名" id="username">
  <input type="password" placeholder="密碼" id="password">
  <button onclick="login()">登入</button>
</div>

<!-- 直播頁面（登入後自動顯示） -->
<div id="broadcast-page" style="display:none">
  <video id="preview"></video>
  <button onclick="startBroadcast()">開始直播</button>
  <button onclick="stopBroadcast()">停止直播</button>
  <!-- 狀態自動顯示，無需手動配置 -->
</div>
```

## 📋 實施優先級

### Phase 1：基礎安全（立即實施）
- [ ] 移除前端 API Key 輸入
- [ ] 使用環境變數配置 API URL
- [ ] 添加基礎認證（用戶名/密碼）
- [ ] 配置 HTTPS

### Phase 2：生產部署（1週內）
- [ ] 設置 Nginx 反向代理
- [ ] 配置 SSL 證書
- [ ] 實現 Session-based auth
- [ ] 添加用戶管理

### Phase 3：優化體驗（2週內）
- [ ] 重新設計主播端 UI
- [ ] 添加直播間管理
- [ ] 實現多主播支持
- [ ] 添加觀眾互動功能

### Phase 4：企業級（1個月內）
- [ ] OAuth2 集成
- [ ] CDN 加速
- [ ] 監控和告警
- [ ] 自動擴展

## 🎯 推薦方案

**對於你的項目，我推薦：**

1. **短期（這週）**：
   - 使用 Nginx 反向代理實現同源部署
   - 移除前端 API Key，使用 Session auth
   - 簡化主播端界面

2. **中期（下週）**：
   - Docker Compose 打包部署
   - 添加用戶管理系統
   - 完善認證流程

3. **長期（下個月）**：
   - Kubernetes 部署（如果需要）
   - CDN 加速前端
   - 企業級監控

要我開始實現這個改進的架構嗎？
