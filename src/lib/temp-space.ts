import { supabase } from "@/lib/supabase";
import { DEMO_TENANT_ID } from "@/lib/auth";
import { seedSpaceWithDocs } from "@/lib/seed-space";

const COOKIE_NAME = "qm_temp_space";

/**
 * Get or create a temporary space for an anonymous user.
 * Returns the spaceId and a Set-Cookie header value if a new space was created.
 */
export async function getOrCreateTempSpace(
  cookieValue: string | null
): Promise<{ spaceId: string; setCookie: string | null }> {
  // Check if existing cookie value points to a valid temp space
  if (cookieValue) {
    const { data } = await supabase
      .from("spaces")
      .select("id")
      .eq("id", cookieValue)
      .eq("is_temp", true)
      .single();

    if (data) {
      return { spaceId: data.id, setCookie: null };
    }
  }

  // Create a new temp space
  const { data: space, error } = await supabase
    .from("spaces")
    .insert({
      tenant_id: DEMO_TENANT_ID,
      name: "临时体验空间",
      is_temp: true,
      is_default: false,
    })
    .select("id")
    .single();

  if (error || !space) {
    throw new Error(`Failed to create temp space: ${error?.message}`);
  }

  // Seed preset docs (fire-and-forget)
  seedSpaceWithDocs(space.id, DEMO_TENANT_ID).catch(() => {});

  // Build cookie (expires in 2 days to cover the cleanup window)
  const maxAge = 2 * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${COOKIE_NAME}=${space.id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;

  return { spaceId: space.id, setCookie: cookie };
}

/**
 * Build a Set-Cookie value to clear the temp space cookie.
 */
export function buildClearTempSpaceCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
