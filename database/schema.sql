-- ==========================================
-- AWS IVS Server - PostgreSQL Schema
-- ==========================================

-- 創建資料庫（如果需要）
-- CREATE DATABASE ivs_live;

-- 連接到資料庫
-- \c ivs_live;

-- ==========================================
-- 1. Stage 配置表
-- ==========================================
CREATE TABLE IF NOT EXISTS stages (
  id SERIAL PRIMARY KEY,
  stage_arn VARCHAR(255) UNIQUE NOT NULL,
  stage_name VARCHAR(100),
  is_master BOOLEAN DEFAULT false,
  max_viewers INTEGER DEFAULT 50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_stage_arn ON stages(stage_arn);
CREATE INDEX IF NOT EXISTS idx_is_master ON stages(is_master);

-- ==========================================
-- 2. 用戶表（可選）
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) UNIQUE NOT NULL,
  username VARCHAR(50),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_id ON users(user_id);

-- ==========================================
-- 3. 觀眾會話記錄表
-- ==========================================
CREATE TABLE IF NOT EXISTS viewer_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  stage_arn VARCHAR(255) NOT NULL,
  participant_id VARCHAR(255),

  -- 時間記錄
  joined_at TIMESTAMP NOT NULL,
  left_at TIMESTAMP,
  watch_duration_seconds INTEGER,

  -- 元數據
  user_agent TEXT,
  ip_address INET,
  country_code VARCHAR(2),

  -- 時間戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_vs_user_id ON viewer_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_vs_stage_arn ON viewer_sessions(stage_arn);
CREATE INDEX IF NOT EXISTS idx_vs_joined_at ON viewer_sessions(joined_at);
CREATE INDEX IF NOT EXISTS idx_vs_left_at ON viewer_sessions(left_at);
CREATE INDEX IF NOT EXISTS idx_vs_user_stage ON viewer_sessions(user_id, stage_arn);

-- ==========================================
-- 4. 觀眾統計快照表（時序數據）
-- ==========================================
CREATE TABLE IF NOT EXISTS viewer_stats_snapshots (
  id SERIAL PRIMARY KEY,
  stage_arn VARCHAR(255) NOT NULL,
  snapshot_time TIMESTAMP NOT NULL,
  viewer_count INTEGER NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_vss_stage_time ON viewer_stats_snapshots(stage_arn, snapshot_time);
CREATE INDEX IF NOT EXISTS idx_vss_snapshot_time ON viewer_stats_snapshots(snapshot_time);

-- ==========================================
-- 5. 更新時間觸發器
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 為 stages 表添加觸發器
DROP TRIGGER IF EXISTS update_stages_updated_at ON stages;
CREATE TRIGGER update_stages_updated_at
  BEFORE UPDATE ON stages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 6. 清理舊數據的函數（可選）
-- ==========================================
CREATE OR REPLACE FUNCTION cleanup_old_snapshots(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM viewer_stats_snapshots
  WHERE snapshot_time < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 7. 常用查詢視圖
-- ==========================================

-- 活躍觀眾視圖（最近 5 分鐘有心跳的觀眾）
CREATE OR REPLACE VIEW active_viewers AS
SELECT
  user_id,
  stage_arn,
  participant_id,
  joined_at,
  EXTRACT(EPOCH FROM (NOW() - joined_at))::INTEGER as duration_seconds
FROM viewer_sessions
WHERE left_at IS NULL
  AND joined_at >= NOW() - INTERVAL '5 minutes';

-- Stage 統計視圖（最近 7 天）
CREATE OR REPLACE VIEW stage_stats_7d AS
SELECT
  stage_arn,
  COUNT(*) as total_views,
  COUNT(DISTINCT user_id) as unique_viewers,
  ROUND(AVG(watch_duration_seconds)) as avg_watch_duration,
  MAX(watch_duration_seconds) as max_watch_duration,
  MIN(joined_at) as first_view,
  MAX(joined_at) as last_view
FROM viewer_sessions
WHERE joined_at >= NOW() - INTERVAL '7 days'
GROUP BY stage_arn;

-- ==========================================
-- 8. 初始數據（可選）
-- ==========================================

-- 插入主 Stage（如果不存在）
-- INSERT INTO stages (stage_arn, stage_name, is_master, max_viewers)
-- VALUES ('arn:aws:ivs:us-east-1:123456789012:stage/xxxxx', 'Master Stage', true, 100)
-- ON CONFLICT (stage_arn) DO NOTHING;

-- ==========================================
-- 9. 權限設置（可選）
-- ==========================================

-- 創建應用程式使用的用戶
-- CREATE USER ivs_app WITH PASSWORD 'your_secure_password';
-- GRANT CONNECT ON DATABASE ivs_live TO ivs_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ivs_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ivs_app;

-- ==========================================
-- 完成
-- ==========================================

-- 顯示所有表
SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
