#!/bin/bash
# AWS EC2 部署腳本

echo "🚀 開始部署到 AWS EC2..."

# 1. 安裝 Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 安裝 Redis
sudo apt-get update
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# 3. 安裝 PM2
sudo npm install -g pm2

# 4. 克隆代碼（或上傳）
# git clone your-repo-url
# cd your-repo

# 5. 安裝依賴
cd api-server
npm install --production

# 6. 編譯 TypeScript
npm run build

# 7. 設定環境變數
cat > .env.local << 'EOF'
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
MASTER_STAGE_ARN=${MASTER_STAGE_ARN}

REDIS_HOST=localhost
REDIS_PORT=6379

API_PORT=3000
API_SECRET_KEY=${API_SECRET_KEY}
NODE_ENV=production
SKIP_AUTH=false
EOF

# 8. 使用 PM2 啟動
pm2 start dist/index.js --name ivs-api
pm2 save
pm2 startup

echo "✅ 部署完成！"
echo "🔍 查看日誌: pm2 logs ivs-api"
echo "📊 查看狀態: pm2 status"
