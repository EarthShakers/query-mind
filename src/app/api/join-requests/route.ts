import { supabase } from "@/lib/supabase";
import { getSpaceContext } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { userId, tenantRole, tenantId } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    if (tenantRole === "admin") {
      // Admin sees pending requests for their tenant
      const { data, error } = await supabase
        .from("join_requests")
        .select("id, tenant_id, user_id, status, message, created_at, updated_at, users(email, display_name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const requests = (data ?? []).map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        userId: r.user_id,
        status: r.status,
        message: r.message,
        email: r.users?.email ?? "",
        displayName: r.users?.display_name ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return Response.json(requests);
    }

    // Regular user sees their own requests
    const { data, error } = await supabase
      .from("join_requests")
      .select("id, tenant_id, status, message, created_at, updated_at, tenants(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const requests = (data ?? []).map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      tenantName: r.tenants?.name ?? "",
      status: r.status,
      message: r.message,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return Response.json(requests);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = getSpaceContext(req);

    if (!userId) {
      return Response.json({ error: "请先登录" }, { status: 401 });
    }

    // Check if already in a tenant
    const { data: existingMember } = await supabase
      .from("tenant_members")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existingMember) {
      return Response.json({ error: "你已加入一个企业" }, { status: 400 });
    }

    const { tenantId, message } = await req.json();
    if (!tenantId) {
      return Response.json({ error: "请选择要加入的企业" }, { status: 400 });
    }

    // Check for existing pending request
    const { data: existingReq } = await supabase
      .from("join_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .single();

    if (existingReq) {
      return Response.json({ error: "你已提交过申请，请等待审批" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("join_requests")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        message: message || "",
      })
      .select("id, tenant_id, status, created_at")
      .single();

    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { userId, tenantRole, tenantId } = getSpaceContext(req);

    if (!userId || tenantRole !== "admin") {
      return Response.json({ error: "需要企业管理员权限" }, { status: 403 });
    }

    const { requestId, action } = await req.json();
    if (!requestId || !["approve", "reject"].includes(action)) {
      return Response.json({ error: "参数错误" }, { status: 400 });
    }

    // Get the request
    const { data: joinReq, error: reqError } = await supabase
      .from("join_requests")
      .select("id, tenant_id, user_id, status")
      .eq("id", requestId)
      .eq("tenant_id", tenantId)
      .single();

    if (reqError || !joinReq) {
      return Response.json({ error: "申请不存在" }, { status: 404 });
    }

    if (joinReq.status !== "pending") {
      return Response.json({ error: "该申请已处理" }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Update request status
    const { error: updateError } = await supabase
      .from("join_requests")
      .update({ status: newStatus, reviewed_by: userId, updated_at: new Date().toISOString() })
      .eq("id", requestId);

    if (updateError) throw new Error(updateError.message);

    // If approved, add to tenant_members and default space
    if (action === "approve") {
      // Add to tenant_members
      await supabase
        .from("tenant_members")
        .insert({ tenant_id: tenantId, user_id: joinReq.user_id, role: "member" });

      // Find default space
      const { data: defaultSpace } = await supabase
        .from("spaces")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_default", true)
        .single();

      if (defaultSpace) {
        // Add to default space as viewer
        await supabase
          .from("space_members")
          .insert({ space_id: defaultSpace.id, user_id: joinReq.user_id, role: "viewer" });

        // Update user's tenant_id and active_space_id
        await supabase
          .from("users")
          .update({ tenant_id: tenantId, active_space_id: defaultSpace.id })
          .eq("id", joinReq.user_id);
      }
    }

    return Response.json({ success: true, status: newStatus });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
