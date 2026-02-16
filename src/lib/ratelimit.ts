import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
});

const DAILY_TOKEN_LIMIT = 200000;
const MAX_INPUT_LENGTH = 500;

function dailyKey() {
  return `daily_tokens:${new Date().toISOString().slice(0, 10)}`;
}

/** IP 限流检查，超限返回错误 Response，否则返回 null */
export async function checkRateLimit(req: Request): Promise<Response | null> {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return new Response("请求过于频繁，请稍后再试", { status: 429 });
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
