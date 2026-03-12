/**
 * 用户权益与限制 — 集中配置
 *
 * 所有按用户类型区分的限额、速率限制都在这里定义，
 * 方便后续修改和扩展新的用户等级。
 */

export type UserTier = "anonymous" | "personal" | "enterprise";

export interface TierConfig {
  /** 显示名称 */
  label: string;
  /** 文件上传上限（知识文档 + 数据报表合计，预置不计入） */
  maxFiles: number;
  /** 每分钟聊天请求次数 */
  chatRatePerMinute: number;
  /** 每分钟上传请求次数 */
  uploadRatePerMinute: number;
  /** 每天上传请求次数 */
  uploadRatePerDay: number;
  /** 单次输入最大字符数 */
  maxInputLength: number;
  /** 每日 token 预算 */
  dailyTokenBudget: number;
  /** 达到上限时的升级提示 */
  upgradeHint: string;
}

/**
 * 各用户等级的权益配置
 *
 * 新增用户等级只需在此添加一项即可，
 * 所有引用 getTierConfig() 的地方自动生效。
 */
export const TIER_CONFIGS: Record<UserTier, TierConfig> = {
  anonymous: {
    label: "未注册用户",
    maxFiles: 0,
    chatRatePerMinute: 10,
    uploadRatePerMinute: 0,
    uploadRatePerDay: 0,
    maxInputLength: 100,
    dailyTokenBudget: 100_000,
    upgradeHint: "注册账号后可上传文件",
  },
  personal: {
    label: "个人用户",
    maxFiles: 10,
    chatRatePerMinute: 20,
    uploadRatePerMinute: 3,
    uploadRatePerDay: 20,
    maxInputLength: 200,
    dailyTokenBudget: 200_000,
    upgradeHint: "升级企业版可上传更多文件",
  },
  enterprise: {
    label: "企业用户",
    maxFiles: 50,
    chatRatePerMinute: 30,
    uploadRatePerMinute: 10,
    uploadRatePerDay: 100,
    maxInputLength: 500,
    dailyTokenBudget: 1000_000,
    upgradeHint: "",
  },
};

/**
 * 根据请求上下文判断用户等级
 */
export function getUserTier(ctx: {
  userId: string | null;
  tenantRole: string | null;
}): UserTier {
  if (!ctx.userId) return "anonymous";
  if (ctx.tenantRole) return "enterprise";
  return "personal";
}

/**
 * 获取当前用户的权益配置
 */
export function getTierConfig(ctx: {
  userId: string | null;
  tenantRole: string | null;
}): TierConfig {
  return TIER_CONFIGS[getUserTier(ctx)];
}
