import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type User } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const siteUrl = "https://b-1n-a-rush.github.io/Dev-Tracker/";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function allAuthUsers(adminClient: ReturnType<typeof createClient>) {
  const users: User[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Team access is not configured." }, 503);
  if (!accessToken) return json({ error: "Administrator sign-in is required." }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
  const actor = userData.user;
  if (userError || !actor) return json({ error: "Your session is no longer valid. Sign in again." }, 401);

  const { data: actorMembership, error: membershipError } = await adminClient
    .from("admin_users")
    .select("user_id, role")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (membershipError) return json({ error: "Could not verify owner access." }, 500);
  if (actorMembership?.role !== "owner") return json({ error: "Only the tracker owner can manage administrators." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "A valid JSON request is required." }, 400);
  }

  const action = String(body.action || "list").trim().toLowerCase();

  try {
    if (action === "list") {
      const [{ data: memberships, error: listError }, users] = await Promise.all([
        adminClient
          .from("admin_users")
          .select("user_id, role, created_at, invited_at, invited_by")
          .order("role", { ascending: false })
          .order("created_at", { ascending: true }),
        allAuthUsers(adminClient),
      ]);
      if (listError) throw listError;

      const usersById = new Map(users.map((user) => [user.id, user]));
      const members = (memberships || []).map((membership) => {
        const user = usersById.get(membership.user_id);
        return {
          user_id: membership.user_id,
          email: user?.email || "Email unavailable",
          role: membership.role,
          invited_at: membership.invited_at,
          created_at: membership.created_at,
          confirmed_at: user?.email_confirmed_at || null,
          last_sign_in_at: user?.last_sign_in_at || null,
          is_current_user: membership.user_id === actor.id,
        };
      });

      const { data: history, error: historyError } = await adminClient
        .from("admin_access_history")
        .select("id, actor_user_id, target_user_id, target_email, action, target_role, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (historyError) throw historyError;

      return json({ members, history: history || [] });
    }

    if (action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!emailPattern.test(email) || email.length > 254) return json({ error: "Enter a valid email address." }, 400);

      const { count, error: countError } = await adminClient
        .from("admin_users")
        .select("user_id", { count: "exact", head: true });
      if (countError) throw countError;
      if ((count || 0) >= 20) return json({ error: "The tracker has reached its 20-administrator safety limit." }, 409);

      const users = await allAuthUsers(adminClient);
      const existingUser = users.find((user) => user.email?.toLowerCase() === email);
      if (existingUser) {
        const { data: existingMembership, error: existingMembershipError } = await adminClient
          .from("admin_users")
          .select("user_id, role")
          .eq("user_id", existingUser.id)
          .maybeSingle();
        if (existingMembershipError) throw existingMembershipError;
        if (existingMembership) return json({ error: "That person already has tracker access." }, 409);
        if (!existingUser.email_confirmed_at) {
          return json({ error: "A pending Supabase invitation already exists for that email. Remove it in Supabase Auth before sending a new invitation." }, 409);
        }

        const { error: grantError } = await adminClient.rpc("service_grant_tracker_admin", {
          p_actor_user_id: actor.id,
          p_target_user_id: existingUser.id,
          p_target_email: email,
          p_action: "granted_existing",
        });
        if (grantError) throw grantError;
        return json({
          message: "Access was granted to the existing Supabase account. They can sign in with their current password.",
          invited: false,
        });
      }

      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: siteUrl,
      });
      if (inviteError || !inviteData.user) throw inviteError || new Error("Supabase did not create the invitation.");

      const invitedUser = inviteData.user;
      const { error: insertError } = await adminClient.rpc("service_grant_tracker_admin", {
        p_actor_user_id: actor.id,
        p_target_user_id: invitedUser.id,
        p_target_email: email,
        p_action: "invited",
      });
      if (insertError) {
        await adminClient.auth.admin.deleteUser(invitedUser.id);
        throw insertError;
      }

      return json({
        message: "Invitation sent. Access will be available after the recipient accepts and creates a password.",
        invited: true,
      });
    }

    if (action === "revoke") {
      const targetUserId = String(body.userId || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return json({ error: "Choose a valid administrator." }, 400);
      if (targetUserId === actor.id) return json({ error: "You cannot remove your own owner access." }, 409);

      const { data: targetMembership, error: targetError } = await adminClient
        .from("admin_users")
        .select("user_id, role")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!targetMembership) return json({ error: "That administrator no longer has access." }, 404);

      if (targetMembership.role === "owner") {
        const { count: ownerCount, error: ownerCountError } = await adminClient
          .from("admin_users")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "owner");
        if (ownerCountError) throw ownerCountError;
        if ((ownerCount || 0) <= 1) return json({ error: "The final owner cannot be removed." }, 409);
      }

      const { data: targetUserData } = await adminClient.auth.admin.getUserById(targetUserId);
      const targetEmail = targetUserData.user?.email || "Email unavailable";
      const { error: deleteError } = await adminClient.rpc("service_revoke_tracker_admin", {
        p_actor_user_id: actor.id,
        p_target_user_id: targetUserId,
        p_target_email: targetEmail,
      });
      if (deleteError) throw deleteError;

      return json({ message: "Administrator access was removed immediately." });
    }

    return json({ error: "Unknown team-access action." }, 400);
  } catch (error) {
    console.error("manage-tracker-admins", action, error);
    return json({ error: error instanceof Error ? error.message : "Team access request failed." }, 500);
  }
});
