**QueryMind** — AI 驱动的自然语言数据与知识助手  
https://query-mind-kohl.vercel.app

---

### 案例一：RAG 优化

### 案例二：RAG Context Precision 调优 + 自动化评估

**初始问题**：RAG 评估中 Context Precision 偏低，检索混入无关 chunk 稀释分数，无法量化每次改动的效果。

**优化链路**：

1. **断崖截断**：检测相似度骤降点，当 `similarity[i] < similarity[i-1] * DROP_RATIO` 时截断，避免后续噪声 chunk 混入。
2. **下限过滤**：similarity < 0.35 的 chunk 直接丢弃，输出从固定 10 个改为动态 3–10 个。
3. **自动化评估**：GitHub Actions 定时任务（每天 8:00 / 20:00）跑 RAGAS 四指标，结果入库 Supabase、看板展示趋势、钉钉告警。

---

### 案例三：语音录入 — 从重复、延迟高到低延迟、高可用

**初始问题**：语音识别存在重复输出、延迟高、移动端/微信 WebView 不可用。

**优化链路**：

1. **排查问题**：语音采集在本地完成，通过 ffmpeg 将 PCM 转为 WAV 回放，确认是采集问题而非 ASR 模型识别问题。
2. **传输层升级**：HTTP POST → WebSocket 单连接，消除每秒 3+ 次 HTTP 开销；二进制 PCM 帧替代 base64，减少 33% 传输冗余；推送与接收同通道，降低延迟。
3. **延迟优化**：冷启动优化（麦克风初始化、RecordRTC 加载、ASR WebSocket 握手）优化策略：推送间隔 200ms -> 100ms，降低上行批量等待， RecordRTC timeSlice 300ms -> 120ms，加快识别链路进入， 同时注入约 200ms 静音前导 防止首字“吞音”（缓解 VAD 截断问题）也能提供更多的背景底噪特征给 LLM 预热，提高识别率。
4. **音频预处理**：

   - **Preamp**：采集端 4.5x 增益放大弱声，解决远场/轻声信号过弱。
   - **底噪门限降噪**：按帧平均幅度估计底噪，限幅更新避免大音量拉高估计，指数平滑（92% 旧 + 8% 新）慢速跟踪；门限以下软衰减 30%（非硬截断），压低背景噪音。
   - **AGC**：按帧 RMS 归一化到目标值，平滑增益统一音量，避免忽大忽小影响识别。

5. **纠错与兜底**：引入轻量 LLM 在不改变原语义的前提下修正明显的同音字、漏字、标点错误等，并且使用异步纠错，使模型尽快返回识别文本，提高用户体验。
6. **多端兼容**：微信 WebView（getUserMedia 三层 fallback、webkitAudioContext、touch 兜底）、移动端长按防劫持、RecordRTC/AudioContext 正确清理。
7. **服务器改造**：自定义 server 同时托管 Next 与 ASR WebSocket，单容器运行，解决 Vercel 等 serverless 服务器不支持长链接的问题，同时配置 SSL 证书解决 Web Audio 生产环境依赖 https 的问题。

---
