
CREATE TABLE public.concession_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.concession_requests TO authenticated;
GRANT ALL ON public.concession_requests TO service_role;

ALTER TABLE public.concession_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY concession_tenant_all ON public.concession_requests
  FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

CREATE INDEX idx_concession_requests_hospital_status
  ON public.concession_requests (hospital_id, status, created_at DESC);

CREATE TRIGGER trg_concession_requests_updated_at
  BEFORE UPDATE ON public.concession_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.concession_requests;
