-- Doctor referral commission columns
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS referring_doctor_id uuid,
  ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doctor_commission_percent numeric NOT NULL DEFAULT 0;

ALTER TABLE public.pharmacy_dispenses
  ADD COLUMN IF NOT EXISTS referring_doctor_id uuid,
  ADD COLUMN IF NOT EXISTS doctor_commission_percent numeric NOT NULL DEFAULT 0;

-- Commission rules per hospital (optionally per doctor)
CREATE TABLE IF NOT EXISTS public.doctor_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  doctor_id uuid,
  type text NOT NULL CHECK (type IN ('lab','pharmacy')),
  percent numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctor_commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_rules_tenant_all ON public.doctor_commission_rules;
CREATE POLICY commission_rules_tenant_all ON public.doctor_commission_rules
  FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

CREATE INDEX IF NOT EXISTS idx_commission_rules_lookup
  ON public.doctor_commission_rules(hospital_id, type, doctor_id, active);

CREATE INDEX IF NOT EXISTS idx_lab_orders_ref_doctor
  ON public.lab_orders(referring_doctor_id);
CREATE INDEX IF NOT EXISTS idx_pharm_disp_ref_doctor
  ON public.pharmacy_dispenses(referring_doctor_id);

-- Enable realtime for prescriptions + notifications + payments
ALTER TABLE public.prescriptions REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prescriptions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
