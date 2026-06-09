CREATE TABLE IF NOT EXISTS public.hospital_lab_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, code)
);
ALTER TABLE public.hospital_lab_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_services_tenant_view" ON public.hospital_lab_services FOR SELECT TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id));
CREATE POLICY "lab_services_admin_manage" ON public.hospital_lab_services FOR ALL TO authenticated
  USING (has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::app_role) OR has_hospital_role(auth.uid(), hospital_id, 'owner'::app_role) OR is_super_admin(auth.uid()))
  WITH CHECK (has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::app_role) OR has_hospital_role(auth.uid(), hospital_id, 'owner'::app_role) OR is_super_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS hospital_lab_services_hospital_idx ON public.hospital_lab_services(hospital_id);