CREATE TABLE public.doctor_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  doctor_user_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE INDEX idx_doctor_leaves_doctor_dates ON public.doctor_leaves (doctor_user_id, starts_on, ends_on) WHERE status = 'active';
CREATE INDEX idx_doctor_leaves_hospital ON public.doctor_leaves (hospital_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_leaves TO authenticated;
GRANT ALL ON public.doctor_leaves TO service_role;

ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctor_leaves_tenant_all"
ON public.doctor_leaves
FOR ALL
TO authenticated
USING (user_belongs_to_hospital(auth.uid(), hospital_id))
WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

CREATE TRIGGER tg_doctor_leaves_updated_at
BEFORE UPDATE ON public.doctor_leaves
FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_leaves;