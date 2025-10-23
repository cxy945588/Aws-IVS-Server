# PostgreSQL 整合部署指南

本指南將幫助您快速部署使用 PostgreSQL 的 AWS IVS Server。

---

## 📋 前置需求

- Node.js 18+ 或 20+
- PostgreSQL 12+
- Redis 6+
- AWS 帳號（用於 IVS）

---

## 🚀 快速開始

### 1. 安裝 PostgreSQL

#### 選項 A：使用 Docker（推薦）

```bash
# 啟動 PostgreSQL 容器
docker run -d \
  --name ivs-postgres \
  -e POSTGRES_PASSWORD=your_secure_password \
  -e POSTGRES_DB=ivs_live \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgres:15

# 驗證運行狀態
docker ps | grep ivs-postgres
```

#### 選項 B：原生安裝

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Windows:**
下載並安裝 [PostgreSQL Installer](https://www.postgresql.org/download/windows/)

### 2. 創建資料庫和表

```bash
# 連接到 PostgreSQL
psql -U postgres

# 創建資料庫（如果使用 Docker 則已創建）
CREATE DATABASE ivs_live;

# 退出
\q

# 執行 Schema SQL
psql -U postgres -d ivs_live -f database/schema.sql
```

驗證表是否創建成功：
```bash
psql -U postgres -d ivs_live -c "\dt"
```

應該看到：
```
             List of relations
 Schema |         Name          | Type  |  Owner
--------+-----------------------+-------+----------
 public | stages                | table | postgres
 public | users                 | table | postgres
 public | viewer_sessions       | table | postgres
 public | viewer_stats_snapshots| table | postgres
```

### 3. 配置環境變數

```bash
# 複製環境變數範本
cp .env.example .env

# 編輯 .env 文件
nano .env  # 或使用其他編輯器
```

**重要配置項：**

```env
# PostgreSQL 配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ivs_live
DB_USER=postgres
DB_PASSWORD=your_secure_password  # 改成你的密碼

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                    # 如果有密碼則填寫

# AWS IVS 配置
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
MASTER_STAGE_ARN=arn:aws:ivs:us-east-1:xxx:stage/xxx

# API Server
API_PORT=3000
NODE_ENV=development
```

### 4. 安裝依賴並啟動

```bash
# 進入 API Server 目錄
cd api-server

# 安裝依賴
npm install

# 編譯 TypeScript
npm run build

# 啟動服務
npm start
```

### 5. 驗證部署

#### 檢查 API 健康狀態
```bash
curl http://localhost:3000/api/health
```

預期響應：
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 123.45,
    "services": {
      "redis": "connected",
      "postgres": "connected"
    }
  }
}
```

#### 測試資料庫連接
```bash
# 連接到 PostgreSQL
psql -U postgres -d ivs_live

# 查詢觀看記錄（應該為空）
SELECT COUNT(*) FROM viewer_sessions;
```

---

## 🔧 啟用快照服務

快照服務會定期將 Redis 數據備份到 PostgreSQL。

### 修改 `api-server/src/index.ts`

在文件末尾添加：

```typescript
import { StatsSnapshotService } from './services/StatsSnapshotService';
import { PostgresService } from './services/PostgresService';

// 啟動服務後，初始化 PostgreSQL 和快照服務
async function initializeServices() {
  try {
    // 測試 PostgreSQL 連接
    const postgres = PostgresService.getInstance();
    const isConnected = await postgres.ping();

    if (!isConnected) {
      logger.error('PostgreSQL 連接失敗，請檢查配置');
      return;
    }

    logger.info('✅ PostgreSQL 連接成功');

    // 啟動快照服務
    const snapshotService = StatsSnapshotService.getInstance();
    snapshotService.start();

    logger.info('✅ 統計快照服務已啟動');
  } catch (error: any) {
    logger.error('服務初始化失敗', { error: error.message });
  }
}

// 在 server.listen 之後調用
server.listen(PORT, HOST, () => {
  logger.info(`Server is running on ${HOST}:${PORT}`);

  // 初始化服務
  initializeServices();
});
```

重新編譯並啟動：
```bash
npm run build && npm start
```

---

## 📊 使用 API

### 1. 觀眾加入
```bash
curl -X POST http://localhost:3000/api/viewer/rejoin \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "stageArn": "arn:aws:ivs:...",
    "participantId": "participant123"
  }'
```

### 2. 查詢觀看歷史
```bash
curl http://localhost:3000/api/viewer/history/user123
```

### 3. 查詢 Stage 統計
```bash
curl "http://localhost:3000/api/viewer/stats/arn:aws:ivs:us-east-1:xxx:stage/xxx?days=7"
```

### 4. 查看快照數據
```bash
psql -U postgres -d ivs_live -c "SELECT * FROM viewer_stats_snapshots ORDER BY snapshot_time DESC LIMIT 10;"
```

---

## 🔍 監控與維護

### 查看觀看記錄

```sql
-- 最近 10 筆觀看記錄
SELECT
  user_id,
  stage_arn,
  joined_at,
  left_at,
  watch_duration_seconds
FROM viewer_sessions
ORDER BY joined_at DESC
LIMIT 10;
```

### 查看統計數據

```sql
-- 每個 Stage 的總觀看數
SELECT
  stage_arn,
  COUNT(*) as total_views,
  COUNT(DISTINCT user_id) as unique_viewers,
  AVG(watch_duration_seconds) as avg_duration
FROM viewer_sessions
GROUP BY stage_arn
ORDER BY total_views DESC;
```

### 清理舊數據

```sql
-- 清理 90 天前的快照數據
SELECT cleanup_old_snapshots(90);
```

### 查看資料庫大小

```sql
SELECT
  pg_size_pretty(pg_database_size('ivs_live')) as database_size;
```

---

## 🐳 使用 Docker Compose（推薦）

創建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: ivs-postgres
    environment:
      POSTGRES_DB: ivs_live
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: ivs-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data

  api-server:
    build: ./api-server
    container_name: ivs-api-server
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ivs_live
      DB_USER: postgres
      DB_PASSWORD: your_secure_password
      REDIS_HOST: redis
      REDIS_PORT: 6379
      NODE_ENV: production
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

啟動所有服務：
```bash
docker-compose up -d
```

查看日誌：
```bash
docker-compose logs -f api-server
```

---

## 🔒 生產環境建議

### 1. 使用連接池

已經在 `PostgresService` 中實現：
```typescript
max: 20,  // 最大連接數
min: 2,   // 最小連接數
```

### 2. 啟用 SSL

修改 `.env`：
```env
DB_SSL_ENABLED=true
```

### 3. 定期備份

```bash
# 每日備份腳本
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"

mkdir -p $BACKUP_DIR

# 備份整個資料庫
pg_dump -U postgres -d ivs_live -F c -f "$BACKUP_DIR/ivs_live_$DATE.dump"

# 刪除 30 天前的備份
find $BACKUP_DIR -name "*.dump" -mtime +30 -delete

echo "Backup completed: ivs_live_$DATE.dump"
```

設置 cron job：
```bash
# 每天凌晨 2 點執行
0 2 * * * /path/to/backup.sh
```

### 4. 監控連接池

```bash
# 查看當前連接數
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname='ivs_live';"

# 查看慢查詢
psql -U postgres -d ivs_live -c "SELECT query, calls, total_time, mean_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

---

## ⚡ 性能優化

### 1. 建立索引（已在 schema.sql 中完成）

```sql
CREATE INDEX idx_vs_user_stage ON viewer_sessions(user_id, stage_arn);
CREATE INDEX idx_vs_joined_at ON viewer_sessions(joined_at);
CREATE INDEX idx_vss_stage_time ON viewer_stats_snapshots(stage_arn, snapshot_time);
```

### 2. 定期 VACUUM

```bash
# 每週執行一次
psql -U postgres -d ivs_live -c "VACUUM ANALYZE;"
```

### 3. 調整 PostgreSQL 配置

編輯 `postgresql.conf`：
```conf
# 記憶體設置
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB

# 連接設置
max_connections = 100

# 日誌設置
log_min_duration_statement = 1000  # 記錄慢查詢（>1秒）
```

---

## 🆘 故障排除

### 問題 1：PostgreSQL 連接失敗

```bash
# 檢查 PostgreSQL 是否運行
sudo systemctl status postgresql

# 檢查端口是否開放
netstat -an | grep 5432

# 測試連接
psql -U postgres -h localhost -p 5432
```

### 問題 2：表不存在

```bash
# 重新執行 Schema
psql -U postgres -d ivs_live -f database/schema.sql
```

### 問題 3：連接池耗盡

檢查 `.env` 中的設置：
```env
DB_POOL_MAX=20  # 增加最大連接數
```

查看活躍連接：
```sql
SELECT * FROM pg_stat_activity WHERE datname='ivs_live';
```

---

## 📈 擴展建議

當業務增長時：

1. **< 10,000 觀眾**
   - 單 Server + PostgreSQL (本方案)
   - 成本：$75/月

2. **10,000 - 50,000 觀眾**
   - 升級 Server 規格
   - 啟用 PostgreSQL 讀寫分離
   - 成本：$200/月

3. **> 50,000 觀眾**
   - 多 Server + Load Balancer
   - RDS Multi-AZ
   - ElastiCache 集群
   - 成本：$500/月

---

## 📚 相關文檔

- [PostgreSQL 官方文檔](https://www.postgresql.org/docs/)
- [簡化架構方案](./SIMPLE_ARCHITECTURE.md)
- [成本優化方案](./COST_OPTIMIZATION.md)
- [API 文檔](./API.md)

---

## 💡 常見問題

**Q: 需要同時使用 DynamoDB 嗎？**
A: 不需要！PostgreSQL 已經足夠，除非您的業務規模超過 100,000 觀眾。

**Q: Redis 重啟會丟失數據嗎？**
A: 會丟失即時計數，但每 5 分鐘的快照已保存在 PostgreSQL，可以快速恢復。

**Q: 如何遷移現有數據？**
A: 如果您已有 DynamoDB 數據，可以編寫腳本從 DynamoDB 導出並導入 PostgreSQL。

**Q: 可以使用 MySQL 嗎？**
A: 可以！只需修改 `PostgresService` 使用 `mysql2` 驅動，Schema SQL 需要調整語法。

---

**部署完成！** 🎉

如有問題，請查看日誌或聯繫技術支持。
