-- Enable realtime + full row data for payments and appointments
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.appointments REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.payments';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Unique CNIC per hospital (partial — only when CNIC present)
CREATE UNIQUE INDEX IF NOT EXISTS patients_hospital_cnic_unique_idx
  ON public.patients (hospital_id, cnic)
  WHERE cnic IS NOT NULL;