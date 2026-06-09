import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const triageInput = z.object({
  age: z.number().int().min(0).max(120),
  gender: z.enum(["M", "F", "Other"]),
  symptoms: z.string().min(3).max(2000),
  duration: z.string().max(120).optional(),
  history: z.string().max(500).optional(),
});

const triageSchema = z.object({
  urgency: z.enum(["EMERGENCY", "URGENT", "SOON", "ROUTINE"]),
  urgencyScore: z.number().min(1).max(10),
  recommendedDepartment: z.string(),
  redFlags: z.array(z.string()),
  differentialDiagnoses: z.array(
    z.object({ condition: z.string(), likelihood: z.enum(["high", "medium", "low"]) })
  ),
  recommendedTests: z.array(z.string()),
  patientGuidance: z.string(),
  disclaimer: z.string(),
});

export const runTriage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => triageInput.parse(data))
  .handler(async ({ data, context }) => {
    // Only hospital staff may invoke triage
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).limit(1);
    if (!roles?.length) throw new Error("Forbidden: hospital staff only");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      throw new Error("AI service not configured. Enable Lovable AI Gateway.");
    }
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    try {
      const { experimental_output } = await generateText({
        model,
        experimental_output: Output.object({ schema: triageSchema }),
        system:
          "You are MediFlow AI's clinical triage assistant for use by trained reception/nursing staff in a hospital. You are NOT a replacement for a physician. Always include a clear disclaimer. Be conservative: when in doubt, escalate. Output strictly valid JSON matching the schema.",
        prompt: `Patient intake:
- Age: ${data.age}
- Gender: ${data.gender}
- Presenting symptoms: ${data.symptoms}
- Duration: ${data.duration ?? "not specified"}
- Relevant history / chronic conditions / allergies: ${data.history ?? "none reported"}

Produce a triage assessment.`,
      });
      return { ok: true as const, result: experimental_output };
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request failed";
      console.error("[triage] error", message);
      return { ok: false as const, error: message };
    }
  });
