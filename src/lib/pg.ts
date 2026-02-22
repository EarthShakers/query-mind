import { Pool } from "pg";

const g = globalThis as unknown as { _pgPool: Pool };

function getPool(): Pool {
  if (!g._pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    g._pgPool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return g._pgPool;
}

/**
 * Execute a read-only SELECT query against user-uploaded data tables.
 * Only allows queries on ud_* prefixed tables.
 */
export async function queryUserData(
  sql: string
): Promise<Record<string, unknown>[]> {
  const normalized = sql.trim().toLowerCase();

  if (!normalized.startsWith("select")) {
    throw new Error("Only SELECT queries are allowed.");
  }

  // Strip trailing semicolons (common AI mistake) but block multi-statement
  sql = sql.replace(/;\s*$/, "");
  if (sql.includes(";")) {
    throw new Error("Multiple statements are not allowed. Remove all semicolons and send one SELECT query only.");
  }

  const pool = getPool();
  const { rows } = await pool.query(sql);
  return rows;
}

/**
 * Execute DDL/DML statements (for table creation and data insertion).
 * Internal use only — not exposed to AI.
 */
export async function execSQL(sql: string): Promise<void> {
  const pool = getPool();
  await pool.query(sql);
}

/**
 * Execute a parameterized query (for bulk inserts).
 */
export async function execParams(
  sql: string,
  params: unknown[]
): Promise<void> {
  const pool = getPool();
  await pool.query(sql, params);
}

/**
 * Batch insert rows using a single multi-value INSERT.
 */
export async function batchInsert(
  tableName: string,
  columns: string[],
  rows: unknown[][]
): Promise<void> {
  if (rows.length === 0) return;

  const pool = getPool();
  const BATCH_SIZE = 500;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((row, ri) => {
      const rowPlaceholders = columns.map((_, ci) => {
        values.push(row[ci]);
        return `$${ri * columns.length + ci + 1}`;
      });
      placeholders.push(`(${rowPlaceholders.join(", ")})`);
    });

    const sql = `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES ${placeholders.join(", ")}`;
    await pool.query(sql, values);
  }
}
