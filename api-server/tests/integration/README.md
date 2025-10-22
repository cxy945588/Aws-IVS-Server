# AWS IVS 服务器集成测试

完整的集成测试套件，用于测试 Redis 和 API 端点功能。

## 📋 测试范围

### 1. 环境检查测试
- ✅ 环境变量配置检查
- ✅ Redis 连接测试
- ✅ 服务器健康检查

### 2. Redis 服务测试
- ✅ 观众计数增减测试
- ✅ 观众心跳和 TTL 测试
- ✅ Stage 统计测试
- ✅ 并发操作测试

### 3. API 端点测试
- ✅ `POST /api/viewer/rejoin` - 观众加入
- ✅ `POST /api/viewer/heartbeat` - 观众心跳
- ✅ `GET /api/viewer/list/:stageArn` - 获取观众列表
- ✅ `GET /api/viewer/duration` - 获取观看时长
- ✅ `POST /api/viewer/leave` - 观众离开
- ✅ 参数校验测试

### 4. 压力测试（可选）
- ✅ 并发观众加入测试（100 观众）
- ✅ 高频心跳测试（50 req/s）
- ✅ 大量观众同时离开测试（100 观众）

## 🚀 快速开始

### 方式一：使用 Node.js 运行（推荐）

最简单的方法，不需要 TypeScript：

```bash
# 1. 确保服务器正在运行
npm run dev

# 2. 在另一个终端运行测试
node tests/integration/run-tests.js
```

### 方式二：使用 npm script 运行

```bash
# 添加到 package.json scripts
npm run test:integration
```

在 `package.json` 中添加：
```json
{
  "scripts": {
    "test:integration": "node tests/integration/run-tests.js"
  }
}
```

### 方式三：使用 TypeScript 运行

如果你想运行 TypeScript 版本的测试（包含更详细的测试）：

```bash
# 安装 ts-node（如果还没安装）
npm install -D ts-node

# 运行 TypeScript 测试
npx ts-node tests/integration/run-tests.ts
```

## ⚙️ 配置

### 环境变量

创建 `.env` 文件或设置以下环境变量：

```bash
# 服务器配置
TEST_BASE_URL=http://localhost:3000

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# 测试数据
TEST_STAGE_ARN=arn:aws:ivs:us-west-2:123456789012:stage/abcdEFGHijkl

# 测试选项
SKIP_STRESS_TESTS=false  # 设置为 true 跳过压力测试
TEST_VERBOSE=false       # 设置为 true 显示详细日志
```

### 默认配置

如果不设置环境变量，测试将使用以下默认值：

| 配置项 | 默认值 |
|--------|--------|
| 服务器地址 | `http://localhost:3000` |
| Redis 主机 | `localhost` |
| Redis 端口 | `6379` |
| Stage ARN | `arn:aws:ivs:us-west-2:123456789012:stage/abcdEFGHijkl` |

## 📊 测试输出示例

```
╔══════════════════════════════════════════════════════════╗
║          AWS IVS 服务器集成测试套件                      ║
║          测试范围：Redis + API 端点                      ║
╚══════════════════════════════════════════════════════════╝

测试配置:
  服务器: http://localhost:3000
  Redis: localhost:6379
  Stage ARN: arn:aws:ivs:us-west-2:123456789012:stage/abcdEFGHijkl
  跳过压力测试: false

=== 1. 环境检查测试 ===

✓ 服务器健康检查 (45ms)

=== 2. API 端点测试 ===

✓ POST /api/viewer/rejoin - 观众加入 (123ms)
✓ POST /api/viewer/heartbeat - 观众心跳 (45ms)
✓ GET /api/viewer/list/:stageArn - 获取观众列表 (67ms)
✓ GET /api/viewer/duration - 获取观看时长 (52ms)
✓ POST /api/viewer/leave - 观众离开 (48ms)
✓ POST /api/viewer/rejoin - 参数校验 (25ms)

=== 3. 压力测试 ===

✓ 并发观众加入测试 (50 观众) (1245ms)

╔══════════════════════════════════════════════════════════╗
║                      测试总结                             ║
╚══════════════════════════════════════════════════════════╝

──────────────────────────────────────────────────────────
总计: 8 测试
✓ 通过: 8
✗ 失败: 0
总耗时: 1650ms (1.65s)
──────────────────────────────────────────────────────────

成功率: 100.00%

🎉 所有测试通过！
```

## 🎯 常见用法

### 只运行基本测试（跳过压力测试）

```bash
SKIP_STRESS_TESTS=true node tests/integration/run-tests.js
```

### 测试特定服务器

```bash
TEST_BASE_URL=http://your-server.com:3000 node tests/integration/run-tests.js
```

### 测试生产环境

```bash
# 创建 .env.production
TEST_BASE_URL=https://api.yourserver.com
REDIS_HOST=your-redis.cloud
REDIS_PORT=6379
REDIS_PASSWORD=your-password
TEST_STAGE_ARN=arn:aws:ivs:us-west-2:YOUR_ACCOUNT:stage/YOUR_STAGE

# 运行测试
node -r dotenv/config tests/integration/run-tests.js dotenv_config_path=.env.production
```

## 🐛 故障排查

### 测试失败：连接被拒绝

**问题**：`Error: connect ECONNREFUSED 127.0.0.1:3000`

**解决方案**：
1. 确保服务器正在运行：`npm run dev`
2. 检查服务器端口是否正确
3. 检查防火墙设置

### Redis 连接失败

**问题**：`Error: Redis connection failed`

**解决方案**：
1. 确保 Redis 正在运行：`redis-cli ping`
2. 检查 Redis 配置：`REDIS_HOST`、`REDIS_PORT`
3. 检查 Redis 密码（如果有）

### 压力测试超时

**问题**：压力测试时间过长或超时

**解决方案**：
1. 跳过压力测试：`SKIP_STRESS_TESTS=true`
2. 增加服务器资源
3. 调整压力测试参数（修改 `test-config.ts`）

## 📝 测试文件说明

```
tests/integration/
├── README.md                    # 本文档
├── test-config.ts              # 测试配置（TypeScript）
├── 01-environment-test.ts      # 环境检查测试
├── 02-redis-test.ts            # Redis 服务测试
├── 03-api-test.ts              # API 端点测试
├── 04-stress-test.ts           # 压力测试
├── run-tests.ts                # 主测试脚本（TypeScript）
└── run-tests.js                # 主测试脚本（JavaScript，推荐）
```

## 🔧 自定义测试

### 添加新的测试用例

编辑 `run-tests.js`，添加新的测试：

```javascript
await test('你的测试名称', async () => {
  const response = await fetch(`${BASE_URL}/your/endpoint`);
  if (!response.ok) {
    throw new Error('测试失败原因');
  }
  // 验证逻辑...
});
```

### 修改测试配置

编辑 `test-config.ts` 修改压力测试参数：

```typescript
stress: {
  concurrentViewers: 100,      // 并发观众数
  requestsPerSecond: 50,       // 每秒请求数
  durationSeconds: 30,         // 测试持续时间
},
```

## 📈 持续集成（CI/CD）

### GitHub Actions 示例

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Start server
        run: npm run dev &
        env:
          REDIS_HOST: localhost
          REDIS_PORT: 6379

      - name: Wait for server
        run: sleep 5

      - name: Run integration tests
        run: node tests/integration/run-tests.js
        env:
          SKIP_STRESS_TESTS: true
```

## 📚 相关文档

- [API 文档](../../docs/API.md)
- [部署指南](../../docs/DEPLOYMENT_GUIDE.md)
- [架构说明](../../docs/SIMPLE_ARCHITECTURE.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进测试套件！
