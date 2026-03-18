1. 换更准的 ASR 模型 — 比如
   paraformer-realtime-v2 或非 flash 版本的
   qwen-asr，中文识别精度更高
2. 加 LLM 纠错后处理 — 转写完成后用快速模型（如
   qwen-max）修正错别字，尤其对 SQL 相关术语

3. 加 prompt 提示词 — 在 ASR 配置中加入领域词汇
   提示（数据库表名、SQL 关键词等），提升识别准确度
4. 优化传输层 — 把 HTTP POST 中转改成 WebSocket
   直连，减少延迟 ✅

5.VAD (静音检测) 优化,

6.在调用 ASR 接口时，传入 hotwords 列表,

7.LLM 二次修正”：在 ASR 输出后，接一个极轻量的 LLM 进行文本纠错。

8. 前端预处理：降噪与增益

降噪（Denoising）： 背景噪音（空调声、键盘声）会严重干扰特征提取。
自动增益（AGC）： 防止用户声音太小导致特征丢失。
