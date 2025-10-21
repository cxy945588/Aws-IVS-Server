FROM node:20-alpine

WORKDIR /app

# 複製 package 文件
COPY package*.json ./

# 安裝依賴
RUN npm ci --only=production

# 複製源碼
COPY . .

# 編譯 TypeScript
RUN npm run build

# 暴露端口
EXPOSE 3000

# 啟動應用
CMD ["node", "dist/index.js"]
