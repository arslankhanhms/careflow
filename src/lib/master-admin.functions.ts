import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MASTER_ADMIN_EMAIL = "arslankhanhms@gmail.com";

// Update master admin credentials. Only callable by the master admin himself.
export const updateMasterAdminCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().min(5).max(255).optional(),
        password: z.string().min(10).max(128).optional(),
        currentPassword: z.string().min(1).max(128),
      })
      .refine((d) => d.email || d.password, { message: "Nothing to update" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Ensure caller is super_admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuper = roles?.some((r) => r.role === "super_admin");
    if (!isSuper) throw new Error("Forbidden");

    // Re-verify current password by attempting a sign-in via admin REST
    const { data: me } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!me.user?.email) throw new Error("User not found");

    const verify = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
        },
        body: JSON.stringify({
          email: me.user.email,
          password: data.currentPassword,
        }),
      },
    );
    if (!verify.ok) throw new Error("Current password is incorrect");

    const updates: { email?: string; password?: string } = {};
    if (data.email) updates.email = data.email;
    if (data.password) updates.password = data.password;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ...updates,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    if (data.email) {
      await supabaseAdmin
        .from("profiles")
        .update({ email: data.email })
        .eq("user_id", userId);
    }

    return { ok: true };
  });

export { MASTER_ADMIN_EMAIL };
