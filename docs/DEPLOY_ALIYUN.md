# 阿里云轻量服务器部署（无源码）

服务器不拉源码，由 GitHub Actions 构建并推送到 GitHub Container Registry（免费），服务器 pull 运行。

---

## 1. GitHub Actions

无需配置 Secrets，推送 `main`/`master` 后自动构建并推送到 `ghcr.io`。

镜像地址：`ghcr.io/你的GitHub用户名/ai-sql-demo:latest`

---

## 2. 服务器部署

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录

# 公开镜像无需登录；私有镜像需创建 GitHub PAT (read:packages) 后：
# echo $GITHUB_TOKEN | docker login ghcr.io -u 你的GitHub用户名 --password-stdin

mkdir -p ~/ai-sql-demo && cd ~/ai-sql-demo
nano .env   # 见下方环境变量

docker pull ghcr.io/你的GitHub用户名/ai-sql-demo:latest
docker run -d --name ai-sql-demo -p 3000:3000 --env-file .env -e NODE_ENV=production --restart unless-stopped \
  ghcr.io/你的GitHub用户名/ai-sql-demo:latest
```

**更新：** `docker pull ... && docker stop ai-sql-demo && docker rm ai-sql-demo && docker run -d ...`（同上）

---

## 3. 环境变量

`.env` 必填：`DASHSCOPE_API_KEY`、`SUPABASE_*`、`DATABASE_URL`、`UPSTASH_REDIS_*`。参考 `.env.local.example`。

---

## 4. Nginx + HTTPS（可选）

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
| 私有镜像 pull 失败 | 创建 GitHub PAT，勾选 read:packages，docker login ghcr.io |
| 语音失败 | Nginx 必须配置 `/api/asr-ws` WebSocket |
| 502 | `docker ps` 检查容器是否运行 |
