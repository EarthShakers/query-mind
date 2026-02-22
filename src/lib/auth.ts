import { hash, compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "qm_session";
const JWT_EXPIRES = "7d";
const SALT_ROUNDS = 10;

export const DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000000";
export const DEMO_SPACE_ID = "00000000-0000-0000-0000-000000000001";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface SpaceMembership {
  spaceId: string;
  spaceName: string;
  role: "admin" | "editor" | "viewer";
  isDefault: boolean;
}

export interface SessionUser {
  userId: string;
  email: string;
  role: "superAdmin" | "user";
  tenantId: string;
  displayName: string | null;
  tenantRole: "admin" | "member" | null;
  spaces: SpaceMembership[];
  activeSpaceId: string | null;
}

/* ─── Password ─── */

export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return compare(password, passwordHash);
}

/* ─── JWT ─── */

export async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/* ─── Session helpers (server components / route handlers) ─── */

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Build a Set-Cookie header value for the JWT token */
export function buildSessionCookie(token: string): string {
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Build a Set-Cookie header value to clear the session */
export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

/* ─── Space context from request headers (set by middleware) ─── */

export interface SpaceContext {
  userId: string | null;
  tenantId: string;
  tenantRole: "admin" | "member" | null;
  activeSpaceId: string | null;
  spaceRole: "admin" | "editor" | "viewer" | null;
}

export function getSpaceContext(req: Request): SpaceContext {
  const userId = req.headers.get("x-user-id");
  const tenantId = req.headers.get("x-tenant-id");
  const tenantRole = req.headers.get("x-tenant-role") as "admin" | "member" | null;
  const activeSpaceId = req.headers.get("x-active-space-id");
  const spaceRole = req.headers.get("x-space-role") as "admin" | "editor" | "viewer" | null;

  if (userId && tenantId) {
    return {
      userId,
      tenantId,
      tenantRole: tenantRole || null,
      activeSpaceId: activeSpaceId || null,
      spaceRole: spaceRole || null,
    };
  }

  return {
    userId: null,
    tenantId: DEMO_TENANT_ID,
    tenantRole: null,
    activeSpaceId: activeSpaceId || null, // may come from temp space cookie via middleware
    spaceRole: null,
  };
}

/** @deprecated Use getSpaceContext instead */
export interface TenantContext {
  userId: string | null;
  role: "superAdmin" | "user" | "anonymous";
  tenantId: string;
}

/** @deprecated Use getSpaceContext instead */
export function getTenantContext(req: Request): TenantContext {
  const userId = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role") as "superAdmin" | "user" | null;
  const tenantId = req.headers.get("x-tenant-id");

  if (userId && role && tenantId) {
    return { userId, role, tenantId };
  }

  return { userId: null, role: "anonymous", tenantId: DEMO_TENANT_ID };
}
