-- Patient-uploaded medical reports (lab results, imaging, etc.)
CREATE TABLE public.patient_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  uploaded_by uuid,
  doctor_id uuid,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text,
  size_bytes integer,
  title text,
  notes text,
  ai_summary text,
  ai_explanation text,
  ai_treatment text,
  ai_status text NOT NULL DEFAULT 'pending',
  ai_error text,
  analyzed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX patient_reports_patient_idx ON public.patient_reports(patient_id, created_at DESC);
CREATE INDEX patient_reports_doctor_idx ON public.patient_reports(doctor_id, created_at DESC);
CREATE INDEX patient_reports_hospital_idx ON public.patient_reports(hospital_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_reports TO authenticated;
GRANT ALL ON public.patient_reports TO service_role;

ALTER TABLE public.patient_reports ENABLE ROW LEVEL SECURITY;

-- Tenant staff can do anything on their hospital's reports
CREATE POLICY patient_reports_tenant_all ON public.patient_reports
  FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- Patient (logged-in user linked to the patients row) can view their own reports
CREATE POLICY patient_reports_patient_self_select ON public.patient_reports
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_reports.patient_id AND p.user_id = auth.uid()
  ));

-- Patient can insert reports for themselves
CREATE POLICY patient_reports_patient_self_insert ON public.patient_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid() AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_reports.patient_id AND p.user_id = auth.uid()
    )
  );

CREATE TRIGGER patient_reports_updated_at
  BEFORE UPDATE ON public.patient_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_reports;