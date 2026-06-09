
-- Phase 3: link patient to a doctor at registration
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS assigned_doctor_id uuid;

CREATE INDEX IF NOT EXISTS patients_assigned_doctor_idx ON public.patients(assigned_doctor_id);

-- Phase 4: Blood bank tables
CREATE TABLE IF NOT EXISTS public.blood_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  blood_group text NOT NULL,
  units integer NOT NULL DEFAULT 0,
  critical_level integer NOT NULL DEFAULT 5,
  low_level integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, blood_group)
);

ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS blood_inv_tenant_all ON public.blood_inventory;
CREATE POLICY blood_inv_tenant_all ON public.blood_inventory FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

CREATE TRIGGER blood_inv_updated_at BEFORE UPDATE ON public.blood_inventory
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE TABLE IF NOT EXISTS public.blood_donors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  donor_name text NOT NULL,
  cnic text,
  phone text,
  blood_group text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  donated_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blood_donors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS blood_donors_tenant_all ON public.blood_donors;
CREATE POLICY blood_donors_tenant_all ON public.blood_donors FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

CREATE INDEX IF NOT EXISTS blood_donors_hospital_idx ON public.blood_donors(hospital_id, donated_at DESC);
