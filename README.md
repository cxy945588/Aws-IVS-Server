# AWS IVS Real-time 大规模直播系统

🎥 支持大规模观众的 AWS IVS Real-time 直播解决方案

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![AWS IVS](https://img.shields.io/badge/AWS-IVS-orange)](https://aws.amazon.com/ivs/)

## 🌟 特性

- ✅ **自动 Stage 扩展** - 根据观众数自动创建/删除 Stage
- ✅ **智能观众分配** - 自动分配观众到最优 Stage
- ✅ **多 Stage 推流** - 主播同时推流到所有 Stage
- ✅ **实时监控** - WebSocket 实时同步 Stage 状态
- ✅ **完整 Web 界面** - 开箱即用的主播和观众端
- ✅ **生产就绪** - 完善的部署文档和脚本

## 📊 系统架构

```
主播 Web 界面（AWS IVS Web Broadcast SDK）
  │
  ├─→ Stage-0 (0-50 观众)
  ├─→ Stage-1 (51-100 观众)
  ├─→ Stage-2 (101-150 观众)
  └─→ Stage-N (自动扩展)
       ↓
   观众自动分配
```

### 核心组件

1. **API Server** - Node.js/Express 后端
   - Token 生成和管理
   - Stage 自动扩展
   - 观众智能分配
   - WebSocket 实时通信

2. **Web Frontend** - 纯静态 HTML/JS
   - 主播推流界面
   - 观众观看界面
   - 实时状态显示

3. **Redis** - 缓存和状态管理
   - 观众计数
   - Stage 信息
   - 实时数据

## 🚀 快速开始

### 前置要求

- Node.js 18.x 或更高
- Redis 6.x 或更高
- AWS 账号（具有 IVS 权限）
- 至少一个已创建的 IVS Stage

### 一键部署

```bash
# 克隆仓库
git clone <repository-url>
cd Aws-IVS-Server

# 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

脚本会自动：
- ✅ 检查系统要求
- ✅ 安装 Redis（如需要）
- ✅ 安装项目依赖
- ✅ 生成配置文件
- ✅ 启动服务

### 手动部署

#### 1. 安装 Redis

```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis

# macOS
brew install redis
brew services start redis
```

#### 2. 配置 API Server

```bash
cd api-server

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 编辑 .env，配置：
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - MASTER_STAGE_ARN
# - API_SECRET_KEY
nano .env

# 构建
npm run build

# 启动
npm start
```

#### 3. 部署 Web 前端

```bash
cd web-frontend

# 使用 Python HTTP Server（测试）
python3 -m http.server 8000

# 或部署到 Nginx（生产）
sudo cp -r . /var/www/ivs-frontend
```

#### 4. 访问系统

- **API Server**: http://localhost:3000
- **主播端**: http://localhost:8000/broadcaster/
- **观众端**: http://localhost:8000/viewer/

## 📖 文档

| 文档 | 说明 |
|------|------|
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | 完整部署指南（开发/生产环境） |
| [PRODUCTION_READY_ARCHITECTURE.md](./PRODUCTION_READY_ARCHITECTURE.md) | 生产架构设计说明 |
| [MEDIA_SERVER_INTEGRATION.md](./MEDIA_SERVER_INTEGRATION.md) | Media Server 集成方案（高级） |

## 🎯 使用流程

### 主播端

1. 打开主播界面
2. 配置 API Server URL 和 API Key
3. 点击"开始推流"
4. 系统自动获取所有 Stage 的 Token
5. 使用 AWS IVS SDK 同时推流到所有 Stage

### 观众端

1. 打开观众界面
2. 配置 API Server URL 和 API Key
3. 点击"加入直播"
4. 系统自动分配到观众数最少的 Stage
5. 开始观看

## 🔧 API 端点

### Token 管理

```bash
# 生成单个观众 Token（自动分配最优 Stage）
POST /api/token/viewer
{
  "userId": "viewer-001"
}

# 生成所有 Stage 的主播 Token
POST /api/token/publisher-all
{
  "userId": "broadcaster-001"
}

# 生成单个主播 Token
POST /api/token/publisher
{
  "userId": "broadcaster-001"
}
```

### Stage 管理

```bash
# 获取所有活跃 Stage
GET /api/stage

# 获取 Stage 详情
GET /api/stage/:stageArn
```

### 统计数据

```bash
# 获取总体统计
GET /api/stats

# 获取实时观众数
GET /api/stats/viewers
```

## ⚙️ 配置

### 环境变量

```env
# AWS 配置
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
MASTER_STAGE_ARN=arn:aws:ivs:...

# API Server
API_PORT=3000
API_SECRET_KEY=<32位随机字符串>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Stage 扩展
MAX_VIEWERS_PER_STAGE=50
SCALE_UP_THRESHOLD=45
SCALE_DOWN_THRESHOLD=5
```

### 生成 API Secret Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📊 监控

### 健康检查

```bash
curl http://localhost:3000/health
```

### 实时统计

```bash
curl -H "x-api-key: YOUR_KEY" http://localhost:3000/api/stats
```

### 日志

```bash
# PM2
pm2 logs ivs-api-server

# Systemd
sudo journalctl -u ivs-api-server -f

# 开发环境
npm run dev
```

## 🔐 安全性

- ✅ API Key 认证
- ✅ Token 过期机制
- ✅ Redis 密码保护
- ✅ HTTPS/WSS 支持（生产环境）
- ✅ CORS 配置
- ✅ Rate Limiting

## 📈 性能优化

### API Server

- 使用 Redis 缓存
- 连接池管理
- 请求超时控制
- 错误重试机制

### Stage 扩展

- 智能阈值设置
- 暖机期保护
- 观众数平衡

### 前端

- 静态资源 CDN
- 代码压缩
- 懒加载

## 🐛 故障排查

### API Server 无法启动

```bash
# 检查端口占用
sudo lsof -i :3000

# 检查 Redis 连接
redis-cli ping

# 查看日志
pm2 logs ivs-api-server
```

### Token 生成失败

```bash
# 验证 AWS 凭证
aws sts get-caller-identity

# 检查 Stage ARN
echo $MASTER_STAGE_ARN

# 测试 API
curl -X POST http://localhost:3000/api/token/viewer \
  -H "x-api-key: YOUR_KEY" \
  -d '{"userId":"test"}'
```

### 观众无法连接

1. 检查主播是否在线
2. 验证 Stage 是否存在
3. 查看观众数是否超限
4. 检查 Token 是否过期

## 🛣️ 路线图

- [ ] 实时聊天功能
- [ ] 录制和回放
- [ ] 数据分析Dashboard
- [ ] 多区域部署支持
- [ ] Docker 容器化
- [ ] Kubernetes 支持

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🆘 支持

- 📖 查看[文档](./DEPLOYMENT_GUIDE.md)
- 🐛 提交 Issue
- 💬 加入讨论

## 🎉 鸣谢

- [AWS IVS](https://aws.amazon.com/ivs/) - 实时音视频服务
- [AWS IVS Web Broadcast SDK](https://github.com/aws/amazon-ivs-web-broadcast) - 官方 SDK

---

**Made with ❤️ for AWS IVS**

🤖 *Generated with [Claude Code](https://claude.com/claude-code)*
