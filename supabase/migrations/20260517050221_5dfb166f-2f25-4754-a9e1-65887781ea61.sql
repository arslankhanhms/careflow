
-- 1. blood_usages
CREATE TABLE public.blood_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  patient_id uuid,
  patient_name text NOT NULL,
  patient_mrn text,
  blood_group text NOT NULL,
  units integer NOT NULL DEFAULT 1 CHECK (units > 0),
  reason text,
  notes text,
  recorded_by uuid,
  used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.blood_usages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blood_usages_tenant_all" ON public.blood_usages
  FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));
CREATE INDEX idx_blood_usages_hospital ON public.blood_usages(hospital_id, used_at DESC);

-- Trigger: decrement inventory when usage row is inserted
CREATE OR REPLACE FUNCTION public.tg_decrement_blood_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_units integer;
BEGIN
  SELECT id, units INTO v_id, v_units
    FROM public.blood_inventory
    WHERE hospital_id = NEW.hospital_id AND blood_group = NEW.blood_group
    LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.blood_inventory (hospital_id, blood_group, units)
      VALUES (NEW.hospital_id, NEW.blood_group, 0)
      RETURNING id, units INTO v_id, v_units;
  END IF;
  UPDATE public.blood_inventory
    SET units = GREATEST(0, COALESCE(v_units,0) - NEW.units),
        updated_at = now()
    WHERE id = v_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_blood_usage_decrement
AFTER INSERT ON public.blood_usages
FOR EACH ROW EXECUTE FUNCTION public.tg_decrement_blood_inventory();

-- 2. lab_orders.department
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS department text;

-- 3. Auto-generate MRN if missing
CREATE OR REPLACE FUNCTION public.generate_mrn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.mrn IS NULL OR NEW.mrn = '' THEN
    NEW.mrn := 'MRN-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*999999))::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_patients_auto_mrn ON public.patients;
CREATE TRIGGER trg_patients_auto_mrn
BEFORE INSERT ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.generate_mrn();
