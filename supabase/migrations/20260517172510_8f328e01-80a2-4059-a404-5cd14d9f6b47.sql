
CREATE TABLE IF NOT EXISTS public.hospital_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL UNIQUE,
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_sms_from text,
  twilio_whatsapp_from text,
  sms_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  last_test_status text,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hospital_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integ_admin_manage" ON public.hospital_integrations
  FOR ALL TO authenticated
  USING (has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::app_role))
  WITH CHECK (has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::app_role));

CREATE POLICY "integ_super_all" ON public.hospital_integrations
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER hospital_integrations_updated_at
  BEFORE UPDATE ON public.hospital_integrations
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
