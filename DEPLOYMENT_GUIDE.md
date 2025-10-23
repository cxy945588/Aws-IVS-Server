# AWS IVS Real-time 生产环境部署指南

## 🎯 系统概览

这是一个完整的 AWS IVS Real-time 直播系统，支持大规模观众（通过自动 Stage 扩展）。

### 架构组件

1. **API Server** - 核心后端服务
2. **Web Frontend** - 主播和观众界面
3. **Redis** - 缓存和状态管理
4. **AWS IVS** - 实时音视频服务

## 📋 前置要求

### 软件要求
- Node.js 20.x
- Redis 6.x+
- Git

### AWS 要求
- AWS 账号
- IAM 用户（具有 IVS 权限）
- 至少一个已创建的 IVS Stage（主 Stage）

### 域名和 SSL（生产环境）
- 已备案的域名
- SSL 证书

## 🚀 快速部署（开发环境）

### 1. 克隆代码

```bash
git clone <repository-url>
cd Aws-IVS-Server
```

### 2. 安装 Redis

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis

# macOS
brew install redis
brew services start redis

# 验证
redis-cli ping  # 应返回 PONG
```

### 3. 配置 API Server

```bash
cd api-server

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 编辑 .env
nano .env
```

**必须配置的环境变量**：

```env
# AWS 配置
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
MASTER_STAGE_ARN=arn:aws:ivs:us-east-1:...

# API Server
API_PORT=3000
API_SECRET_KEY=<生成一个 32 字符的随机密钥>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# 环境
NODE_ENV=development
```

**生成 API Secret Key**：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. 启动 API Server

```bash
# 开发环境
npm run dev

# 生产环境
npm run build
npm start
```

访问 http://localhost:3000/health 验证启动成功。

### 5. 部署 Web 前端

Web 前端是纯静态文件，可以部署到任何 Web 服务器。

#### 方法 A: 使用 Python HTTP Server（测试）

```bash
cd web-frontend
python3 -m http.server 8000
```

访问：
- 主播端: http://localhost:8000/broadcaster/
- 观众端: http://localhost:8000/viewer/

#### 方法 B: 使用 Nginx（推荐）

```bash
# 安装 Nginx
sudo apt install nginx

# 复制文件
sudo cp -r web-frontend /var/www/ivs-frontend

# 配置 Nginx
sudo nano /etc/nginx/sites-available/ivs-frontend
```

Nginx 配置文件：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/ivs-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # 如果需要代理 API Server
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/ivs-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🔧 生产环境部署

### 1. 服务器配置

#### 推荐规格（AWS EC2）

- **API Server**: t3.medium (2 vCPU, 4 GB RAM)
- **Redis**: ElastiCache (cache.t3.small)
- **Web Frontend**: S3 + CloudFront

#### 安全组配置

```
API Server:
- Inbound: 3000 (HTTP) - 仅允许 Web Server IP
- Outbound: All

Web Server:
- Inbound: 80 (HTTP), 443 (HTTPS)
- Outbound: All
```

### 2. API Server 生产部署

#### 使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
cd api-server
pm2 start npm --name "ivs-api-server" -- start

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs ivs-api-server
```

#### 使用 Systemd

创建 `/etc/systemd/system/ivs-api-server.service`：

```ini
[Unit]
Description=AWS IVS API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/Aws-IVS-Server/api-server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl start ivs-api-server
sudo systemctl enable ivs-api-server
sudo systemctl status ivs-api-server
```

### 3. 配置 SSL（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 4. 配置 CloudWatch 监控

```bash
# 安装 CloudWatch Agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb

# 配置
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

### 5. Web 前端部署到 S3 + CloudFront

```bash
# 安装 AWS CLI
pip3 install awscli

# 上传到 S3
aws s3 sync web-frontend s3://your-bucket-name --acl public-read

# 创建 CloudFront 分发
aws cloudfront create-distribution \
  --origin-domain-name your-bucket-name.s3.amazonaws.com \
  --default-root-object index.html
```

## 🔐 安全配置

### 1. API Key 管理

```bash
# 定期轮换 API Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 更新 .env
# 重启 API Server
```

### 2. Redis 安全

```bash
# 编辑 Redis 配置
sudo nano /etc/redis/redis.conf

# 设置密码
requirepass your-strong-password

# 绑定本地
bind 127.0.0.1

# 重启 Redis
sudo systemctl restart redis
```

### 3. 防火墙配置

```bash
# Ubuntu UFW
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 📊 监控和日志

### 1. API Server 日志

```bash
# PM2
pm2 logs ivs-api-server

# Systemd
sudo journalctl -u ivs-api-server -f
```

### 2. Nginx 日志

```bash
# 访问日志
sudo tail -f /var/log/nginx/access.log

# 错误日志
sudo tail -f /var/log/nginx/error.log
```

### 3. 性能监控

```bash
# 系统资源
htop

# 网络连接
sudo netstat -tlnp

# Redis 监控
redis-cli INFO
redis-cli MONITOR
```

## 🧪 测试部署

### 1. API Server 健康检查

```bash
curl http://localhost:3000/health
# 应返回: {"status":"healthy", ...}
```

### 2. Token 生成测试

```bash
curl -X POST http://localhost:3000/api/token/viewer \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"userId":"test-viewer-001"}'
```

### 3. 批量 Token 测试

```bash
curl -X POST http://localhost:3000/api/token/publisher-all \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"userId":"test-broadcaster-001"}'
```

### 4. Web 界面测试

1. 打开主播端: http://your-domain.com/broadcaster/
2. 配置 API Server URL 和 API Key
3. 点击"开始推流"
4. 打开观众端: http://your-domain.com/viewer/
5. 点击"加入直播"

## 🔄 更新和维护

### 更新代码

```bash
# 拉取最新代码
git pull origin main

# 重新构建
cd api-server
npm install
npm run build

# 重启服务
pm2 restart ivs-api-server

# 或
sudo systemctl restart ivs-api-server
```

### 数据库清理

```bash
# 清除过期的 Redis 数据
redis-cli FLUSHDB

# 重置观众计数
redis-cli DEL "ivs:prod:total_viewers"
```

### 备份

```bash
# Redis 备份
redis-cli SAVE
cp /var/lib/redis/dump.rdb /backup/redis-$(date +%Y%m%d).rdb

# 代码备份
tar -czf /backup/ivs-server-$(date +%Y%m%d).tar.gz /var/www/Aws-IVS-Server
```

## 🐛 故障排查

### API Server 无法启动

1. 检查端口占用: `sudo lsof -i :3000`
2. 检查日志: `pm2 logs ivs-api-server`
3. 验证环境变量: `cat .env`
4. 检查 Redis 连接: `redis-cli ping`

### Redis 连接失败

1. 检查 Redis 状态: `sudo systemctl status redis`
2. 检查配置: `cat /etc/redis/redis.conf`
3. 测试连接: `redis-cli ping`

### Token 生成失败

1. 验证 AWS 凭证
2. 检查 IAM 权限
3. 确认 Stage ARN 正确
4. 查看 API Server 日志

### 观众无法连接

1. 检查主播是否在线
2. 验证 Stage 是否存在
3. 检查观众数是否超限
4. 查看 API Server 日志

## 📚 参考文档

- [AWS IVS Real-time 文档](https://docs.aws.amazon.com/ivs/latest/RealTimeAPIReference/)
- [AWS IVS Web Broadcast SDK](https://github.com/aws/amazon-ivs-web-broadcast)
- [项目 README](./README.md)
- [架构说明](./PRODUCTION_READY_ARCHITECTURE.md)

## 🆘 技术支持

如遇问题，请：
1. 查看项目 Issues
2. 提交新 Issue 附带详细日志
3. 联系开发团队

---

**部署愉快！** 🎉
