ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS consultation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS consultation_ended_at timestamptz;