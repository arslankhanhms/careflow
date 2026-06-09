-- Phase 0: MediFlow AI foundation

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS consultation_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experience_years int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS working_days text[] DEFAULT ARRAY['mon','tue','wed','thu','fri']::text[],
  ADD COLUMN IF NOT EXISTS working_hours jsonb DEFAULT '{"start":"09:00","end":"17:00"}'::jsonb,
  ADD COLUMN IF NOT EXISTS slot_duration_min int DEFAULT 15,
  ADD COLUMN IF NOT EXISTS max_patients_per_day int DEFAULT 50,
  ADD COLUMN IF NOT EXISTS is_doctor boolean DEFAULT false;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS cnic text,
  ADD COLUMN IF NOT EXISTS pmr_no text;

CREATE UNIQUE INDEX IF NOT EXISTS patients_cnic_uq ON public.patients(cnic) WHERE cnic IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS patients_pmr_uq ON public.patients(pmr_no) WHERE pmr_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_pmr()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pmr_no IS NULL THEN
    NEW.pmr_no := 'PMR-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*999999))::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_patients_pmr ON public.patients;
CREATE TRIGGER tg_patients_pmr BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.generate_pmr();

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS queue_no int,
  ADD COLUMN IF NOT EXISTS slot_start timestamptz,
  ADD COLUMN IF NOT EXISTS slot_end timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS consultation_fee numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS hospitals_country_city_idx ON public.hospitals(country, city) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid,
  patient_id uuid NOT NULL,
  hospital_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  txn_id text,
  receipt_no text,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_tenant_all ON public.payments;
CREATE POLICY payments_tenant_all ON public.payments FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

CREATE TABLE IF NOT EXISTS public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  appointment_id uuid,
  patient_id uuid NOT NULL,
  doctor_id uuid,
  due_date date NOT NULL,
  notes text,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS follow_ups_tenant_all ON public.follow_ups;
CREATE POLICY follow_ups_tenant_all ON public.follow_ups FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hospital_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_self_view ON public.notifications;
CREATE POLICY notifications_self_view ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_self_update ON public.notifications;
CREATE POLICY notifications_self_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS notifications_tenant_insert ON public.notifications;
CREATE POLICY notifications_tenant_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (hospital_id IS NULL OR user_belongs_to_hospital(auth.uid(), hospital_id));

DROP POLICY IF EXISTS hospitals_public_read ON public.hospitals;
CREATE POLICY hospitals_public_read ON public.hospitals FOR SELECT TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS profiles_public_doctors ON public.profiles;
CREATE POLICY profiles_public_doctors ON public.profiles FOR SELECT TO anon, authenticated
  USING (is_doctor = true);
