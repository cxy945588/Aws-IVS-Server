#!/bin/bash

###############################################################################
# AWS IVS Real-time 一键部署脚本
#
# 功能：
# - 检查系统要求
# - 安装依赖
# - 配置环境变量
# - 启动服务
#
# 使用方法：
# chmod +x deploy.sh
# ./deploy.sh
###############################################################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查 Node.js 版本
check_nodejs() {
    print_info "检查 Node.js..."
    if ! command_exists node; then
        print_error "Node.js 未安装"
        print_info "请访问 https://nodejs.org/ 安装 Node.js 20.x"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js 版本过低 (当前: $NODE_VERSION, 需要: 18+)"
        exit 1
    fi

    print_success "Node.js 版本正常 ($(node -v))"
}

# 检查 Redis
check_redis() {
    print_info "检查 Redis..."
    if ! command_exists redis-cli; then
        print_warning "Redis 未安装"
        read -p "是否现在安装 Redis? (y/n): " install_redis
        if [ "$install_redis" = "y" ]; then
            install_redis_service
        else
            print_error "Redis 是必需的，无法继续"
            exit 1
        fi
    fi

    # 测试 Redis 连接
    if redis-cli ping >/dev/null 2>&1; then
        print_success "Redis 运行正常"
    else
        print_warning "Redis 未运行，尝试启动..."
        start_redis_service
    fi
}

# 安装 Redis
install_redis_service() {
    print_info "正在安装 Redis..."

    if [ "$(uname)" = "Darwin" ]; then
        # macOS
        if command_exists brew; then
            brew install redis
            brew services start redis
        else
            print_error "请先安装 Homebrew: https://brew.sh/"
            exit 1
        fi
    elif [ "$(uname)" = "Linux" ]; then
        # Linux
        if command_exists apt-get; then
            sudo apt-get update
            sudo apt-get install -y redis-server
            sudo systemctl start redis
            sudo systemctl enable redis
        elif command_exists yum; then
            sudo yum install -y redis
            sudo systemctl start redis
            sudo systemctl enable redis
        else
            print_error "不支持的 Linux 发行版"
            exit 1
        fi
    fi

    print_success "Redis 安装完成"
}

# 启动 Redis
start_redis_service() {
    if [ "$(uname)" = "Darwin" ]; then
        brew services start redis
    elif [ "$(uname)" = "Linux" ]; then
        sudo systemctl start redis
    fi

    sleep 2

    if redis-cli ping >/dev/null 2>&1; then
        print_success "Redis 启动成功"
    else
        print_error "Redis 启动失败"
        exit 1
    fi
}

# 安装 API Server 依赖
install_api_server() {
    print_header "安装 API Server"

    cd api-server

    if [ ! -f "package.json" ]; then
        print_error "package.json 不存在"
        exit 1
    fi

    print_info "正在安装依赖..."
    npm install

    print_info "正在构建..."
    npm run build

    print_success "API Server 安装完成"

    cd ..
}

# 配置环境变量
configure_env() {
    print_header "配置环境变量"

    cd api-server

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            print_info "创建 .env 文件..."
            cp .env.example .env
            print_success ".env 文件已创建"
        else
            print_error ".env.example 不存在"
            exit 1
        fi
    else
        print_warning ".env 文件已存在，跳过创建"
    fi

    # 生成 API Secret Key
    if grep -q "your_random_secret_key" .env; then
        print_info "生成 API Secret Key..."
        API_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        sed -i.bak "s/your_random_secret_key_min_32_chars_long/$API_SECRET/" .env
        print_success "API Secret Key 已生成"
    fi

    print_warning ""
    print_warning "重要提示："
    print_warning "请编辑 api-server/.env 文件，配置以下必要参数："
    print_warning "  - AWS_ACCESS_KEY_ID"
    print_warning "  - AWS_SECRET_ACCESS_KEY"
    print_warning "  - MASTER_STAGE_ARN"
    print_warning ""

    read -p "按回车键继续..."

    cd ..
}

# 启动服务
start_services() {
    print_header "启动服务"

    # 检查是否安装 PM2
    if command_exists pm2; then
        print_info "使用 PM2 启动服务..."
        cd api-server
        pm2 start npm --name "ivs-api-server" -- start
        pm2 save
        cd ..
        print_success "API Server 已通过 PM2 启动"
        print_info "查看日志: pm2 logs ivs-api-server"
        print_info "查看状态: pm2 status"
    else
        print_info "使用 npm 启动服务..."
        print_warning "建议安装 PM2 以便更好地管理服务: npm install -g pm2"
        cd api-server
        npm start &
        cd ..
        print_success "API Server 已启动"
    fi

    sleep 3

    # 测试服务
    print_info "测试 API Server..."
    if curl -s http://localhost:3000/health >/dev/null; then
        print_success "API Server 运行正常！"
        print_success "访问 http://localhost:3000/health 查看状态"
    else
        print_error "API Server 可能未正常启动"
        print_info "请检查日志"
    fi
}

# 部署 Web 前端
deploy_frontend() {
    print_header "部署 Web 前端"

    if [ ! -d "web-frontend" ]; then
        print_error "web-frontend 目录不存在"
        return
    fi

    print_info "Web 前端是纯静态文件，可以通过以下方式访问："
    echo ""
    echo "方法 1: 使用 Python HTTP Server (测试)"
    echo "  cd web-frontend && python3 -m http.server 8000"
    echo "  主播端: http://localhost:8000/broadcaster/"
    echo "  观众端: http://localhost:8000/viewer/"
    echo ""
    echo "方法 2: 使用 Nginx (生产)"
    echo "  参见 DEPLOYMENT_GUIDE.md"
    echo ""

    read -p "是否现在使用 Python HTTP Server 启动前端? (y/n): " start_frontend
    if [ "$start_frontend" = "y" ]; then
        cd web-frontend
        print_info "正在启动 HTTP Server (端口 8000)..."
        python3 -m http.server 8000 &
        sleep 2
        print_success "Web 前端已启动"
        print_success "主播端: http://localhost:8000/broadcaster/"
        print_success "观众端: http://localhost:8000/viewer/"
        cd ..
    fi
}

# 显示摘要
show_summary() {
    print_header "部署完成！"

    echo ""
    echo "✅ 部署摘要："
    echo ""
    echo "📡 API Server:"
    echo "   - 地址: http://localhost:3000"
    echo "   - 健康检查: http://localhost:3000/health"
    echo "   - 日志: pm2 logs ivs-api-server"
    echo ""
    echo "📺 Web 前端:"
    echo "   - 主播端: http://localhost:8000/broadcaster/"
    echo "   - 观众端: http://localhost:8000/viewer/"
    echo ""
    echo "⚠️  下一步："
    echo "   1. 编辑 api-server/.env 配置 AWS 凭证和 Stage ARN"
    echo "   2. 重启 API Server: pm2 restart ivs-api-server"
    echo "   3. 在 Web 界面配置 API Key"
    echo "   4. 开始直播！"
    echo ""
    echo "📚 详细文档："
    echo "   - 部署指南: DEPLOYMENT_GUIDE.md"
    echo "   - 架构说明: PRODUCTION_READY_ARCHITECTURE.md"
    echo ""
}

# 主函数
main() {
    print_header "AWS IVS Real-time 部署脚本"

    print_info "开始部署..."

    # 1. 检查系统要求
    check_nodejs
    check_redis

    # 2. 安装 API Server
    install_api_server

    # 3. 配置环境变量
    configure_env

    # 4. 启动服务
    start_services

    # 5. 部署前端
    deploy_frontend

    # 6. 显示摘要
    show_summary

    print_success "🎉 部署完成！"
}

# 运行主函数
main
