# Linux 部署指南

## 系统要求

- Ubuntu 22.04+ / Debian 12+ / CentOS 8+
- Node.js 22+
- Docker 24+
- SQLite3
- 2GB+ RAM
- 10GB+ 磁盘空间

## 安装步骤

### 1. 安装 Node.js 22

**方式一：使用 NodeSource（推荐，systemd 兼容性好）**

```bash
# 使用 NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证
node --version  # v22.x.x
npm --version   # 10.x.x
```

**方式二：使用 nvm（需要注意 systemd 配置）**

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc

# 安装 Node.js 22
nvm install 22
nvm use 22

# 验证
node --version
which npm  # 记录这个路径，后面需要用到
```

**注意：** 如果使用 nvm 安装，需要修改 `nanoclaw.service` 文件中的 Node.js 路径（见步骤7）。

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

**国内用户配置 Docker 镜像加速：**

```bash
# 创建 Docker 配置文件
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.tuna.tsinghua.edu.cn",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
EOF

# 重启 Docker
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 3. 安装 SQLite3

```bash
sudo apt-get install -y sqlite3

# 验证
sqlite3 --version
```

### 4. 克隆并配置项目

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
# Claude API (MiniMax 国内可用)
ANTHROPIC_API_KEY=sk-xxxxx
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic

# 飞书配置
FEISHU_APP_ID=cli_xxxxx
FEISHU_APP_SECRET=xxxxx
FEISHU_ONLY=true

# 可选：HTTP 代理（如果需要）
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

### 5. 构建项目

```bash
# 构建 TypeScript
npm run build

# 构建 Docker 容器
./container/build.sh
```

**国内用户如遇 Docker 镜像拉取失败：**

修改 `container/Dockerfile` 第4行使用国内镜像：
```dockerfile
FROM docker.mirrors.tuna.tsinghua.edu.cn/library/node:22-slim
```

### 6. 配置数据目录

```bash
# 创建数据目录
mkdir -p ~/nanoclaw-data/{store,groups,data,logs}

# 设置权限
chmod 755 ~/nanoclaw-data
```

### 7. 安装 Systemd 服务

**前置检查：确认 Node.js 安装方式**

```bash
# 检查 Node.js 路径
which node
which npm
```

**情况 A：使用 NodeSource 安装（推荐，路径为 /usr/bin/node）**

这种情况下无需修改服务文件，直接使用默认配置：

```bash
# 复制服务文件
sudo cp nanoclaw.service /etc/systemd/system/nanoclaw@$USER.service
```

**情况 B：使用 nvm 安装（路径包含 .nvm）**

需要先修改服务文件中的路径：

```bash
# 查看你的 Node.js 安装路径
which node
# 输出示例：/home/dietpi/.nvm/versions/node/v24.13.1/bin/node

# 编辑服务文件
nano nanoclaw.service

# 修改以下三行（用你的实际路径替换）：
# Environment="PATH=/home/dietpi/.nvm/versions/node/v24.13.1/bin:/usr/local/bin:/usr/bin:/bin"
# ExecStart=/home/dietpi/.nvm/versions/node/v24.13.1/bin/node /home/dietpi/.nvm/versions/node/v24.13.1/bin/npm run start

# 然后复制修改后的服务文件
sudo cp nanoclaw.service /etc/systemd/system/nanoclaw@$USER.service
```

**继续启动服务：**

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

### 8. 注册飞书群聊

**步骤 1：先启动服务，获取真实的 chat_id**

```bash
# 确保服务在运行
sudo systemctl status nanoclaw@$USER

# 如果未运行，先启动
sudo systemctl start nanoclaw@$USER

# 在飞书群里发送一条消息 @机器人
# 然后查看日志获取 chat_id
sudo journalctl -u nanoclaw@$USER -f | grep -i "chat jid\|new chat"
```

你会看到类似这样的日志：
```
chat JID info: {
  chatJid: "feishu:oc_2169c782b85e19cf59159170e18e2b44"
  registeredJids: []
}
```

**步骤 2：停止服务，注册群聊**

```bash
# 停止服务（避免数据库锁定）
sudo systemctl stop nanoclaw@$USER

# 进入项目目录
cd ~/nanoclaw

# 注册群聊到数据库（使用你实际的 chat_id）
sqlite3 store/messages.db "
INSERT INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger)
VALUES ('feishu:oc_xxxxxxxx', '群聊名称', 'main', '@Andy', datetime('now'), 0);
"

# 注意：将 feishu:oc_xxxxxxxx 替换为你在日志中看到的真实 chat_id

# 创建群聊文件夹
mkdir -p groups/main
```

**步骤 3：重新启动服务**

```bash
sudo systemctl start nanoclaw@$USER

# 验证
sudo journalctl -u nanoclaw@$USER -f | grep -i "registered"
```

### 9. 配置飞书私聊（可选）

飞书私聊需要**单独注册**，因为私聊和群聊的 chat_id 不同。

**步骤 1：获取私聊 chat_id**

```bash
# 在飞书 APP 中搜索机器人名称，添加为好友
# 发送一条消息给机器人
# 然后查看日志获取私聊的 chat_id
sudo journalctl -u nanoclaw@$USER -f | grep -i "chat jid"
```

你会看到类似这样的日志：
```
chat JID info: {
  chatJid: "feishu:oc_0e138990808c5a9a1ec33dcc85b05a9d"  ← 这是私聊ID
  registeredJids: ["feishu:oc_2169c782b85e19cf59159170e18e2b44"]  ← 这是群聊ID
}
```

**步骤 2：注册私聊（注意 folder 不能重复）**

```bash
# 停止服务
sudo systemctl stop nanoclaw@$USER

# 注册私聊（folder 使用 private，与群聊的 main 区分开）
sqlite3 store/messages.db "
INSERT INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger)
VALUES ('feishu:oc_0e138990808c5a9a1ec33dcc85b05a9d', '私聊', 'private', '@Andy', datetime('now'), 0);
"

# 注意：将 feishu:oc_0e138990808c5a9a1ec33dcc85b05a9d 替换为你在日志中看到的真实私聊 chat_id

# 创建私聊文件夹
mkdir -p groups/private

# 启动服务
sudo systemctl start nanoclaw@$USER
```

**关于 folder 的唯一性约束：**

每个聊天（群聊或私聊）必须有唯一的 `folder` 名称，因为：
- `folder` 字段在数据库中有 **UNIQUE 约束**
- 每个 folder 对应 `groups/` 下的一个独立文件夹
- 用于存储该聊天的记忆（CLAUDE.md）和日志

**推荐命名方案：**
| 聊天类型 | folder 名称 | 用途 |
|---------|------------|------|
| 私聊 | `main` 或 `private` | 个人使用，有管理权限 |
| 群聊 | `group-chat` | 群组对话 |
| 其他群聊 | `team-chat`、`family-chat` 等 | 其他群组 |

**步骤 3：测试私聊**

在飞书私聊中发送：`@Andy 你好`

机器人应该能够正常回复。

## 服务管理

```bash
# 查看状态
sudo systemctl status nanoclaw@$USER

# 查看日志（实时）
sudo journalctl -u nanoclaw@$USER -f

# 查看最近 50 行日志
sudo journalctl -u nanoclaw@$USER --no-pager -n 50

# 重启服务
sudo systemctl restart nanoclaw@$USER

# 停止服务
sudo systemctl stop nanoclaw@$USER

# 启动服务
sudo systemctl start nanoclaw@$USER
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
# 停止服务后再备份
sudo systemctl stop nanoclaw@$USER

# 备份数据库和配置
tar -czf nanoclaw-backup-$(date +%Y%m%d).tar.gz \
  store/messages.db \
  .env \
  groups/

# 重新启动服务
sudo systemctl start nanoclaw@$USER

# 恢复备份
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
sqlite3 --version
```

### 错误："Unable to locate executable '/usr/bin/npm'" 或 "env: 'node': No such file or directory"

**原因：** 服务文件中的 Node.js 路径与实际安装路径不匹配

**解决步骤：**

```bash
# 1. 找到你的 Node.js 实际路径
which node
which npm
# 示例输出：/home/dietpi/.nvm/versions/node/v24.13.1/bin/node

# 2. 编辑服务文件
nano nanoclaw.service

# 3. 根据你的安装方式修改：
#
# 如果是 NodeSource 安装（路径 /usr/bin/node）：
#   Environment="PATH=/usr/local/bin:/usr/bin:/bin"
#   ExecStart=/usr/bin/node /usr/bin/npm run start
#
# 如果是 nvm 安装（路径包含 .nvm）：
#   Environment="PATH=/home/dietpi/.nvm/versions/node/v24.13.1/bin:/usr/local/bin:/usr/bin:/bin"
#   ExecStart=/home/dietpi/.nvm/versions/node/v24.13.1/bin/node /home/dietpi/.nvm/versions/node/v24.13.1/bin/npm run start

# 4. 重新加载并启动
sudo cp nanoclaw.service /etc/systemd/system/nanoclaw@$USER.service
sudo systemctl daemon-reload
sudo systemctl restart nanoclaw@$USER
```

### Docker 容器构建失败

```bash
# 检查 Docker 状态
sudo systemctl status docker

# 检查镜像加速器配置
cat /etc/docker/daemon.json

# 手动测试拉取镜像
docker pull docker.mirrors.tuna.tsinghua.edu.cn/library/node:22-slim

# 手动测试容器
docker run --rm nanoclaw-agent:latest echo "test"
```

### 飞书消息未接收

1. **检查服务是否运行：**
   ```bash
   sudo systemctl status nanoclaw@$USER
   ```

2. **查看飞书相关日志：**
   ```bash
   sudo journalctl -u nanoclaw@$USER -f | grep -i feishu
   ```

3. **检查群聊是否已注册：**
   ```bash
   sqlite3 store/messages.db "SELECT * FROM registered_groups;"
   ```

4. **常见错误 - chat_id 不匹配：**
   - 日志中显示的 `chatJid` 必须与数据库中的 `jid` 完全一致
   - 示例：`feishu:oc_2169c782b85e19cf59159170e18e2b44`

5. **检查飞书应用权限：**
   - 确保已开启 `im:chat:readonly` 和 `im:message:send` 权限
   - 确保事件订阅配置了 `im.message.receive_v1`

### 机器人回复了但没有发送成功

```bash
# 查看是否有发送失败的错误
sudo journalctl -u nanoclaw@$USER -f | grep -i "error\|send"
```

## 更新部署

```bash
cd ~/nanoclaw

# 停止服务
sudo systemctl stop nanoclaw@$USER

# 拉取更新
git pull origin main

# 重新安装依赖（如有 package.json 变更）
npm install

# 重新构建
npm run build
./container/build.sh

# 启动服务
sudo systemctl start nanoclaw@$USER

# 查看状态
sudo systemctl status nanoclaw@$USER
```

## 无 Claude Code 环境部署

如果你在 Linux 服务器上没有 Claude Code，完全不影响运行。Claude Code 只在开发时需要，运行时只需要：

1. Node.js 主服务（`npm start` 或 systemd）
2. Docker 容器（自动包含 claude-code）
3. 正确的环境变量配置

按照上述步骤 1-8 配置即可正常运行。
