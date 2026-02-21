import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "rl:chat",
});

const uploadRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 m"),
  prefix: "rl:upload",
});

const uploadDailyRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 d"),
  prefix: "rl:upload_daily",
});

const DAILY_TOKEN_LIMIT = 200000;
const MAX_INPUT_LENGTH = 500;

function dailyKey() {
  return `daily_tokens:${new Date().toISOString().slice(0, 10)}`;
}

/** 从请求中提取限流 key：登录用户用 userId，匿名用 IP */
export function getRateLimitKey(req: Request): string {
  const userId = req.headers.get("x-user-id");
  if (userId) return `user:${userId}`;
  return getClientIp(req);
}

/** 从请求中提取客户端 IP */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown_" + Math.random().toString(36).slice(2, 8)
  );
}

/** IP 限流检查，超限返回错误 Response，否则返回 null */
export async function checkRateLimit(req: Request): Promise<Response | null> {
  const key = getRateLimitKey(req);
  const { success } = await ratelimit.limit(key);
  if (!success) {
    return new Response("请求过于频繁，请稍后再试", { status: 429 });
  }
  return null;
}

/** 上传限流检查：每分钟 3 次 + 每天 20 次 */
export async function checkUploadRateLimit(
  req: Request
): Promise<Response | null> {
  const key = getRateLimitKey(req);
  const { success: minOk } = await uploadRatelimit.limit(key);
  if (!minOk) {
    return new Response("上传过于频繁，请稍后再试", { status: 429 });
  }
  const { success: dayOk } = await uploadDailyRatelimit.limit(key);
  if (!dayOk) {
    return new Response("今日上传次数已达上限（20 次），请明天再试", {
      status: 429,
    });
  }
  return null;
}

/** 每日 token 熔断检查，超限返回错误 Response，否则返回 null */
export async function checkDailyBudget(): Promise<Response | null> {
  const used = (await redis.get<number>(dailyKey())) ?? 0;
  if (used >= DAILY_TOKEN_LIMIT) {
    return new Response("今日用量已达上限，请明天再试", { status: 429 });
  }
  return null;
}

/** 单条消息长度检查 */
export function checkInputLength(content: string): Response | null {
  if (content.length > MAX_INPUT_LENGTH) {
    return new Response(`输入过长（最多 ${MAX_INPUT_LENGTH} 字），请精简问题`, {
      status: 400,
    });
  }
  return null;
}

/** 流结束后异步记录 token 用量 */
export async function recordTokenUsage(totalTokens: number) {
  if (!totalTokens) return;
  const key = dailyKey();
  await redis.incrby(key, totalTokens);
  await redis.expire(key, 86400);
}
