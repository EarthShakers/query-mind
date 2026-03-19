# 阿里云轻量服务器部署（无源码）

服务器不拉源码，由 GitHub Actions 构建并推送到 GitHub Container Registry（ghcr.io，免费），服务器 pull 运行。

---

## 1. GitHub Actions

无需配置 Secrets，推送 `main`/`master` 后自动构建并推送到 ghcr.io。

镜像地址：`ghcr.io/你的GitHub用户名/ai-sql-demo:latest`（用户名为小写）

**首次推送后**：到 GitHub 仓库 → 右侧 **Packages** 或 `https://github.com/orgs/你的组织/packages` 找到 `ai-sql-demo` → Package settings → Change visibility → **Public**。否则服务器 pull 会报 `unauthorized`。

---

## 2. 服务器部署

**目录**：在 `~/ai-sql-demo` 下操作，`.env` 和后续更新都在此目录。

```bash
# 1. 安装 Docker（任意目录执行）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录使 docker 组生效
# 若提示 "docker command appears to already exist"，按 Ctrl+C 取消，无需重复安装

# 2. 创建部署目录并进入
mkdir -p ~/ai-sql-demo && cd ~/ai-sql-demo

# 3. 公开镜像无需登录；私有镜像需先登录：
# echo 你的GitHub_PAT | docker login ghcr.io -u 你的GitHub用户名 --password-stdin
# PAT 在 GitHub → Settings → Developer settings → Personal access tokens，勾选 read:packages

# 4. 创建 .env（见下方环境变量）
nano .env

# 5. 拉取并运行（替换 earthshakers 为你的 GitHub 用户名/组织，小写）
docker pull ghcr.io/earthshakers/ai-sql-demo:latest
docker run -d --name ai-sql-demo -p 3000:3000 --env-file .env -e NODE_ENV=production --restart unless-stopped \
  ghcr.io/earthshakers/ai-sql-demo:latest
```

**更新部署：**

```bash
cd ~/ai-sql-demo
docker pull ghcr.io/earthshakers/ai-sql-demo:latest
docker stop ai-sql-demo && docker rm ai-sql-demo
docker run -d --name ai-sql-demo -p 3000:3000 --env-file .env -e NODE_ENV=production --restart unless-stopped \
  ghcr.io/earthshakers/ai-sql-demo:latest
```

---

## 3. 环境变量

`.env` 必填：`DASHSCOPE_API_KEY`、`SUPABASE_*`、`DATABASE_URL`、`UPSTASH_REDIS_*`。参考 `.env.local.example`。

---

## 4. Nginx + HTTPS（可选）

### 方式 A：自签名证书（无域名，浏览器会提示不安全）

```bash
# 1. 安装 Nginx
sudo apt install nginx -y

# 2. 生成自签名证书（有效期 365 天）
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/selfsigned.key \
  -out /etc/nginx/ssl/selfsigned.crt \
  -subj "/CN=localhost"

# 3. 编辑 Nginx 配置
sudo nano /etc/nginx/sites-available/default
```

将 `default` 内容替换为（`你的IP` 填服务器公网 IP，或 `_` 表示任意）：

```nginx
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/nginx/ssl/selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/selfsigned.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 语音识别 WebSocket，必须单独配置且包含完整 proxy 头
    location /api/asr-ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**安全组**：放行 443 端口。访问 `https://你的服务器IP`，浏览器会提示「不安全」→ 点「高级」→「继续访问」即可。

### 方式 B：Let's Encrypt（需域名）

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
sudo certbot --nginx -d 你的域名.com
```

`/etc/nginx/sites-available/default` 增加反向代理到 `127.0.0.1:3000`，**必须**配置 WebSocket：

```nginx
location /api/asr-ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
}
```

---

## 5. 故障排查

| 现象 | 处理 |
|------|------|
| `unauthorized` / pull 失败 | 将 Package 设为 Public，或创建 PAT (read:packages) 后 `docker login ghcr.io` |
| Docker 已存在提示 | 按 Ctrl+C 取消安装，直接 `docker --version` 验证 |
| 502 | `docker ps` 检查容器是否运行 |

### 录音识别不到 / 语音无反应

1. **检查 Nginx WebSocket**：确认有 `location /api/asr-ws` 且包含 `Upgrade`、`Connection "upgrade"`、`Host`、`X-Forwarded-Proto`。修改后执行 `sudo nginx -t && sudo systemctl reload nginx`。

2. **浏览器控制台**：F12 → Network → 筛选 WS，按住录音时应有 `asr-ws` 连接。若 404/502 或连接失败，多为 Nginx 未正确转发。

3. **容器日志**：`docker logs -f ai-sql-demo`，录音时应有 ASR 相关输出；若报错 `DASHSCOPE_API_KEY` 等，检查 `.env`。

4. **麦克风权限**：HTTPS 下浏览器会请求麦克风，需允许；若用 HTTP 访问，部分浏览器会拒绝麦克风。
