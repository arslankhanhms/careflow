ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS default_concession_percent numeric NOT NULL DEFAULT 0;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS concession_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concession_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concession_reason text;