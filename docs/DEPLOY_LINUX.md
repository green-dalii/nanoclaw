# Linux 部署指南

## 系统要求

- Ubuntu 22.04+ / Debian 12+ / CentOS 8+
- Node.js 22+
- Docker 24+
- 2GB+ RAM
- 10GB+ 磁盘空间

## 安装步骤

### 1. 安装 Node.js 22

```bash
# 使用 NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证
node --version  # v22.x.x
npm --version   # 10.x.x
```

### 2. 安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 添加当前用户到 docker 组
sudo usermod -aG docker $USER

# 重新登录或刷新组
newgrp docker

# 验证
docker --version
docker run hello-world
```

### 3. 克隆并配置项目

```bash
# 克隆你的 fork
git clone https://github.com/YOUR_USERNAME/nanoclaw.git
cd nanoclaw

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
nano .env  # 编辑配置
```

**必配项：**
```bash
# Claude API (MiniMax)
ANTHROPIC_API_KEY=sk-xxxxx
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic

# 飞书
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
FEISHU_ONLY=true
```

### 4. 构建项目

```bash
# 构建 TypeScript
npm run build

# 构建 Docker 容器
./container/build.sh
```

### 5. 配置数据目录

```bash
# 创建数据目录
mkdir -p ~/nanoclaw-data/{store,groups,data,logs}

# 设置权限
chmod 755 ~/nanoclaw-data
```

### 6. 安装 Systemd 服务

```bash
# 复制服务文件
sudo cp nanoclaw.service /etc/systemd/system/nanoclaw@$USER.service

# 重新加载 systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start nanoclaw@$USER

# 设置开机自启
sudo systemctl enable nanoclaw@$USER
```

### 7. 注册飞书群聊

```bash
# 进入项目目录
cd ~/nanoclaw

# 获取群聊列表
node -e "
const { Client } = require('@larksuiteoapi/node-sdk');
const client = new Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  domain: 'https://open.feishu.cn',
});
client.im.chat.list({ params: { page_size: 100 } })
  .then(res => console.log(JSON.stringify(res.data.items, null, 2)));
"

# 注册群聊到数据库
sqlite3 store/messages.db "
INSERT INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger)
VALUES ('feishu:oc_xxxxx', '群聊名称', 'main', '@Andy', datetime('now'), 0);
"

# 创建 main 文件夹
mkdir -p groups/main
```

## 服务管理

```bash
# 查看状态
sudo systemctl status nanoclaw@$USER

# 查看日志
sudo journalctl -u nanoclaw@$USER -f

# 重启服务
sudo systemctl restart nanoclaw@$USER

# 停止服务
sudo systemctl stop nanoclaw@$USER
```

## 防火墙配置

如果服务器有防火墙，确保可以访问飞书 API：

```bash
# UFW
sudo ufw allow out to any port 443 proto tcp

# 或 iptables
sudo iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
```

## 数据备份

```bash
# 备份数据库和配置
tar -czf nanoclaw-backup-$(date +%Y%m%d).tar.gz \
  store/messages.db \
  .env \
  groups/

# 恢复
tar -xzf nanoclaw-backup-YYYYMMDD.tar.gz
```

## 故障排查

### 服务无法启动

```bash
# 检查日志
sudo journalctl -u nanoclaw@$USER --no-pager -n 50

# 检查依赖
node --version
docker info
```

### Docker 容器无法启动

```bash
# 检查 Docker 状态
sudo systemctl status docker

# 手动测试容器
docker run --rm nanoclaw-agent:latest echo "test"
```

### 飞书消息未接收

1. 检查飞书应用权限
2. 检查长连接配置
3. 查看日志：`sudo journalctl -u nanoclaw@$USER -f | grep -i feishu`

## 更新部署

```bash
cd ~/nanoclaw

# 拉取更新
git pull origin main

# 重新安装依赖（如有 package.json 变更）
npm install

# 重新构建
npm run build
./container/build.sh

# 重启服务
sudo systemctl restart nanoclaw@$USER
```
