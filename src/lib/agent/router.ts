/**
 * 数据来源与工具路由（基于 prompt 规则，显式编排）
 *
 * 规则：Schema 无销量/产品相关表 → search_knowledge；销量+说明 → search 优先；execute 失败 → fallback 在 execute 节点
 */
import type { SubTask } from "@/lib/agent/state";

const SCHEMA_RELEVANT = /销量|销售|产品|product|sales|amount|销售额|退货/i;
const QUESTION_DATA = /销量|销售额|销售数据|产品数据|各产品|最高.*产品|销售最好|退货|product|sales|amount|revenue/i;
const PRODUCT_PLUS_DESC = /销量.*说明|说明.*销量|产品.*说明|说明.*产品|销量最高.*及其说明/i;

export interface RouteHint {
  schemaHasRelevantTables: boolean;
  forceSearchOnly: boolean;
  preferSearchFirst: boolean;
}

export function hasRelevantSchema(tableSchemas: string, question: string): boolean {
  if (!tableSchemas?.trim() || tableSchemas === "无") return false;
  if (!QUESTION_DATA.test(question)) return true;
  return SCHEMA_RELEVANT.test(tableSchemas);
}

export function isProductPlusDescriptionQuestion(question: string): boolean {
  return PRODUCT_PLUS_DESC.test(question);
}

export function getRouteHint(
  userMessage: string,
  tableSchemas: string,
  enableKnowledge: boolean,
  enableQuery: boolean
): RouteHint {
  const schemaHasRelevantTables = hasRelevantSchema(tableSchemas, userMessage);
  const questionHasDataIntent = QUESTION_DATA.test(userMessage);
  const forceSearchOnly =
    !enableQuery ||
    !enableKnowledge ||
    (!schemaHasRelevantTables && questionHasDataIntent);

  return {
    schemaHasRelevantTables,
    forceSearchOnly,
    preferSearchFirst: isProductPlusDescriptionQuestion(userMessage),
  };
}

export function applyRouteRules(
  subTasks: SubTask[],
  routeHint: RouteHint,
  userMessage: string
): SubTask[] {
  if (!subTasks.length) return subTasks;
  return subTasks.map((t) => {
    if (t.tool !== "execute_query" || !routeHint.forceSearchOnly) return t;
    return { ...t, tool: "search_knowledge" as const, query: userMessage, sql: undefined };
  });
}

export function reorderByPreferSearchFirst(
  subTasks: SubTask[],
  userMessage?: string
): SubTask[] {
  const search = subTasks.filter((t) => t.tool === "search_knowledge");
  const execute = subTasks.filter((t) => t.tool === "execute_query");
  if (!search.length || !execute.length) return subTasks;

  const executeIds = new Set(execute.map((t) => t.id));
  const adjusted = search.map((t) => {
    const deps = t.depends_on ?? [];
    const onExecute = deps.filter((d) => executeIds.has(d));
    if (!onExecute.length) return t;
    return { ...t, depends_on: deps.filter((d) => !executeIds.has(d)), query: t.query || userMessage || "" };
  });
  return [...adjusted, ...execute];
}
