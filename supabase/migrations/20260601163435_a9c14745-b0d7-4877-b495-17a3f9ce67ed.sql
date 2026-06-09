
-- Prescription enrichment
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS symptoms text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS examination text,
  ADD COLUMN IF NOT EXISTS allergies_drug text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS allergies_food text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS chronic_conditions text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS lab_tests text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS follow_up_notes text,
  ADD COLUMN IF NOT EXISTS suggested_treatment text;

-- Doctor signature & stamp
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS stamp_url text;

-- Hospital letterhead numbers
ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS phc_registration_no text,
  ADD COLUMN IF NOT EXISTS hospital_registration_no text;

-- Storage bucket for signatures and stamps
INSERT INTO storage.buckets (id, name, public)
VALUES ('doctor-signatures', 'doctor-signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Doctors can manage their own files (path prefix: <userId>/...)
CREATE POLICY "doctor_sig_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'doctor-signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "doctor_sig_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doctor-signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "doctor_sig_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'doctor-signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "doctor_sig_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doctor-signatures' AND auth.uid()::text = (storage.foldername(name))[1]);
