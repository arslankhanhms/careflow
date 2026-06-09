-- Add CNIC to profiles for patient unified portal across hospitals
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cnic text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cnic_unique ON public.profiles (cnic) WHERE cnic IS NOT NULL;
CREATE INDEX IF NOT EXISTS patients_cnic_idx ON public.patients (cnic) WHERE cnic IS NOT NULL;