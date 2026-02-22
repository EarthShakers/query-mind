import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { supabase } from "./supabase";
import { execSQL, batchInsert } from "./pg";

// ─── Types ────────────────────────────────────────────────

export interface ParsedColumn {
  originalName: string; // Excel 原始列头
  columnName: string; // PG 列名 (sanitized)
  dataType: "TEXT" | "INTEGER" | "REAL" | "DATE";
  samples: string[];
}

export interface ParsedSheet {
  columns: ParsedColumn[];
  rows: unknown[][];
  rowCount: number;
}

export interface UploadResult {
  tableId: string;
  tableName: string;
  displayName: string;
  rowCount: number;
  columns: { columnName: string; displayName: string; dataType: string }[];
}

// ─── Column name sanitization ─────────────────────────────

const RESERVED = new Set([
  "select", "from", "where", "insert", "update", "delete", "create",
  "drop", "table", "index", "order", "group", "by", "having", "join",
  "left", "right", "inner", "outer", "on", "and", "or", "not", "null",
  "true", "false", "as", "in", "is", "like", "between", "case", "when",
  "then", "else", "end", "limit", "offset", "union", "all", "distinct",
  "values", "set", "into", "primary", "key", "default", "constraint",
  "references", "foreign", "check", "unique", "alter", "add", "column",
  "date", "time", "timestamp", "integer", "text", "real", "boolean",
  "varchar", "char", "float", "double", "decimal", "numeric",
]);

/**
 * Convert Chinese/special column names to safe PG column names.
 * Uses pinyin-style mapping for common Chinese terms, falls back to col_N.
 */
function sanitizeColumnName(name: string, index: number): string {
  // Remove leading/trailing whitespace
  let clean = name.trim();
  if (!clean) return `col_${index + 1}`;

  // If already ASCII-safe, just normalize
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(clean)) {
    clean = clean.toLowerCase();
    if (RESERVED.has(clean)) clean = `${clean}_col`;
    return clean;
  }

  // Replace common separators with underscore
  clean = clean.replace(/[\s\-\.\(\)\[\]\/\\（）【】、，。：:]+/g, "_");

  // Remove non-word characters except underscores and CJK
  clean = clean.replace(/[^\w\u4e00-\u9fff_]/g, "");

  // If we still have CJK characters, use col_N with a comment approach
  if (/[\u4e00-\u9fff]/.test(clean)) {
    return `col_${index + 1}`;
  }

  clean = clean.toLowerCase().replace(/^_+|_+$/g, "").replace(/_+/g, "_");
  if (!clean || /^\d/.test(clean)) clean = `col_${index + 1}`;
  if (RESERVED.has(clean)) clean = `${clean}_col`;

  return clean;
}

/**
 * Ensure column names are unique within the set.
 */
function deduplicateColumns(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

// ─── Type inference ───────────────────────────────────────

function inferType(
  values: unknown[]
): "INTEGER" | "REAL" | "DATE" | "TEXT" {
  let intCount = 0;
  let realCount = 0;
  let dateCount = 0;
  let total = 0;

  for (const v of values) {
    if (v == null || v === "") continue;
    total++;
    const s = String(v).trim();

    // Only treat as integer if <= 15 digits (safe for both JS and PG)
    if (/^-?\d+$/.test(s) && s.replace("-", "").length <= 15) {
      intCount++;
    } else if (/^-?\d+\.?\d*$/.test(s) || /^-?\.\d+$/.test(s)) {
      // Only treat as real if not an absurdly long number (likely an ID)
      if (s.replace(/[-.]/, "").length <= 18) {
        realCount++;
      }
    } else if (
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) ||
      /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(s)
    ) {
      dateCount++;
    }
  }

  if (total === 0) return "TEXT";
  const threshold = total * 0.8;

  if (intCount >= threshold) return "INTEGER";
  if (intCount + realCount >= threshold) return "REAL";
  if (dateCount >= threshold) return "DATE";
  return "TEXT";
}

// ─── Parse Excel/CSV buffer ───────────────────────────────

export function parseFile(
  buffer: Buffer,
  fileName: string
): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("文件中没有数据");

  const sheet = workbook.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (raw.length < 2) {
    throw new Error("文件至少需要一行表头和一行数据");
  }

  const headerRow = raw[0] as string[];
  const dataRows = raw.slice(1).filter((row) =>
    (row as unknown[]).some((cell) => cell != null && cell !== "")
  );

  if (dataRows.length === 0) {
    throw new Error("文件中没有数据行");
  }

  // Sanitize and deduplicate column names
  const sanitized = headerRow.map((h, i) => sanitizeColumnName(String(h ?? ""), i));
  const uniqueNames = deduplicateColumns(sanitized);

  // Infer types from first 100 rows
  const sampleRows = dataRows.slice(0, 100);
  const columns: ParsedColumn[] = uniqueNames.map((colName, i) => {
    const colValues = sampleRows.map((row) => (row as unknown[])[i]);
    const samples = colValues
      .filter((v) => v != null && v !== "")
      .slice(0, 3)
      .map((v) => String(v));

    return {
      originalName: String(headerRow[i] ?? `列${i + 1}`),
      columnName: colName,
      dataType: inferType(colValues),
      samples,
    };
  });

  // Normalize row values
  const rows = dataRows.map((row) =>
    columns.map((col, i) => {
      const val = (row as unknown[])[i];
      if (val == null || val === "") return null;
      if (val instanceof Date) return val.toISOString().split("T")[0];
      return val;
    })
  );

  return { columns, rows, rowCount: rows.length };
}

// ─── Create PG table and insert data ──────────────────────

export async function createAndPopulateTable(
  parsed: ParsedSheet,
  spaceId: string,
  tenantId: string,
  userId: string,
  fileName: string,
  displayName: string
): Promise<UploadResult> {
  const shortId = randomUUID().replace(/-/g, "").slice(0, 8);
  const tableName = `ud_${shortId}`;

  // Map our types to PG types
  const pgTypeMap: Record<string, string> = {
    TEXT: "TEXT",
    INTEGER: "NUMERIC",
    REAL: "NUMERIC",
    DATE: "TEXT", // store as text for safety
  };

  // Create table
  const colDefs = parsed.columns
    .map((c) => `"${c.columnName}" ${pgTypeMap[c.dataType] || "TEXT"}`)
    .join(",\n  ");

  const createSQL = `CREATE TABLE "${tableName}" (\n  id BIGSERIAL PRIMARY KEY,\n  ${colDefs}\n)`;
  await execSQL(createSQL);

  // Insert data
  const colNames = parsed.columns.map((c) => c.columnName);
  await batchInsert(tableName, colNames, parsed.rows);

  // Store metadata in Supabase
  const { data: tableRecord, error: tableError } = await supabase
    .from("data_tables")
    .insert({
      space_id: spaceId,
      tenant_id: tenantId,
      table_name: tableName,
      display_name: displayName,
      row_count: parsed.rowCount,
      file_name: fileName,
      uploaded_by: userId,
    })
    .select("id")
    .single();

  if (tableError) {
    // Rollback: drop the table
    await execSQL(`DROP TABLE IF EXISTS "${tableName}"`);
    throw new Error(`保存表元数据失败: ${tableError.message}`);
  }

  // Store column metadata
  const colRecords = parsed.columns.map((c, i) => ({
    data_table_id: tableRecord.id,
    column_name: c.columnName,
    display_name: c.originalName,
    data_type: c.dataType,
    ordinal: i,
  }));

  const { error: colError } = await supabase
    .from("data_columns")
    .insert(colRecords);

  if (colError) {
    console.error("保存列元数据失败:", colError.message);
  }

  return {
    tableId: tableRecord.id,
    tableName,
    displayName,
    rowCount: parsed.rowCount,
    columns: parsed.columns.map((c) => ({
      columnName: c.columnName,
      displayName: c.originalName,
      dataType: c.dataType,
    })),
  };
}

// ─── Build schema description for AI ──────────────────────

export interface UserTableSchema {
  tableName: string;
  displayName: string;
  description: string | null;
  columns: {
    columnName: string;
    displayName: string;
    dataType: string;
    description: string | null;
  }[];
}

/**
 * Get schema descriptions for all data tables in the given spaces.
 */
export async function getUserTableSchemas(
  spaceIds: string[]
): Promise<UserTableSchema[]> {
  if (spaceIds.length === 0) return [];

  const { data: tables } = await supabase
    .from("data_tables")
    .select("id, table_name, display_name, description")
    .in("space_id", spaceIds);

  if (!tables || tables.length === 0) return [];

  const tableIds = tables.map((t) => t.id);

  const { data: columns } = await supabase
    .from("data_columns")
    .select("data_table_id, column_name, display_name, data_type, description")
    .in("data_table_id", tableIds)
    .order("ordinal", { ascending: true });

  const colMap = new Map<string, typeof columns>();
  for (const col of columns || []) {
    const existing = colMap.get(col.data_table_id) || [];
    existing.push(col);
    colMap.set(col.data_table_id, existing);
  }

  return tables.map((t) => ({
    tableName: t.table_name,
    displayName: t.display_name,
    description: t.description,
    columns: (colMap.get(t.id) || []).map((c) => ({
      columnName: c.column_name,
      displayName: c.display_name,
      dataType: c.data_type,
      description: c.description,
    })),
  }));
}

/**
 * Format user table schemas into a string for the system prompt.
 */
export function formatUserSchemas(schemas: UserTableSchema[]): string {
  if (schemas.length === 0) return "";

  return schemas
    .map((t) => {
      const colStr = t.columns
        .map((c) => {
          const desc = c.description ? ` -- ${c.description}` : "";
          const orig = c.displayName !== c.columnName ? ` (原名: ${c.displayName})` : "";
          return `  ${c.columnName} ${c.dataType}${orig}${desc}`;
        })
        .join("\n");
      const desc = t.description ? `\n  -- ${t.description}` : "";
      return `Table: ${t.tableName} (用户上传: "${t.displayName}")${desc}\n${colStr}`;
    })
    .join("\n\n");
}

// ─── Drop table ───────────────────────────────────────────

export async function dropUserTable(tableId: string): Promise<void> {
  const { data: table } = await supabase
    .from("data_tables")
    .select("table_name")
    .eq("id", tableId)
    .single();

  if (!table) throw new Error("表不存在");

  // Drop PG table
  await execSQL(`DROP TABLE IF EXISTS "${table.table_name}"`);

  // Delete metadata (columns cascade)
  await supabase.from("data_tables").delete().eq("id", tableId);
}
