import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Public (no-auth) hospital lookup by slug — used by hospital workspace landing & find-doctor. */
export const getHospitalBySlugPublic = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { data: h, error } = await supabaseAdmin
      .from("hospitals")
      .select("id, slug, name, city, country, plan, status, brand_color, logo_url, phone, email, address")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!h) return { hospital: null };
    return { hospital: h };
  });
