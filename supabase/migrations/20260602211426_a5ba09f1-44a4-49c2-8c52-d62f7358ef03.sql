
CREATE TABLE public.collection_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  doctor_user_id uuid,
  closure_date date NOT NULL,
  scope text NOT NULL DEFAULT 'doctor',
  opd_total numeric(12,2) NOT NULL DEFAULT 0,
  lab_total numeric(12,2) NOT NULL DEFAULT 0,
  pharmacy_total numeric(12,2) NOT NULL DEFAULT 0,
  cash_total numeric(12,2) NOT NULL DEFAULT 0,
  online_total numeric(12,2) NOT NULL DEFAULT 0,
  grand_total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  dispute_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_closures TO authenticated;
GRANT ALL ON public.collection_closures TO service_role;
ALTER TABLE public.collection_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "closures_tenant_all" ON public.collection_closures
  FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));
CREATE INDEX idx_closures_hosp_date ON public.collection_closures(hospital_id, closure_date DESC);
CREATE INDEX idx_closures_doctor_date ON public.collection_closures(doctor_user_id, closure_date DESC);
CREATE TRIGGER tg_closures_updated_at BEFORE UPDATE ON public.collection_closures
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.collection_closures;

CREATE TABLE public.whatsapp_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  sender_phone text NOT NULL,
  sender_user_id uuid,
  sender_role text,
  command_raw text NOT NULL,
  action text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  applied_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_commands TO authenticated;
GRANT ALL ON public.whatsapp_commands TO service_role;
ALTER TABLE public.whatsapp_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_cmds_tenant_all" ON public.whatsapp_commands
  FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));
CREATE INDEX idx_wa_cmds_hosp_status ON public.whatsapp_commands(hospital_id, status, created_at DESC);
CREATE TRIGGER tg_wa_cmds_updated_at BEFORE UPDATE ON public.whatsapp_commands
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_commands;

CREATE TABLE public.financial_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_role text,
  source text NOT NULL DEFAULT 'manual',
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  whatsapp_command_id uuid REFERENCES public.whatsapp_commands(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.financial_audit_log TO authenticated;
GRANT ALL ON public.financial_audit_log TO service_role;
ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_audit_tenant_read" ON public.financial_audit_log
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id));
CREATE POLICY "fin_audit_tenant_insert" ON public.financial_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));
CREATE INDEX idx_fin_audit_hosp_created ON public.financial_audit_log(hospital_id, created_at DESC);
CREATE INDEX idx_fin_audit_record ON public.financial_audit_log(table_name, record_id);
