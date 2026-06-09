DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_orders;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_dispenses;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.patients REPLICA IDENTITY FULL;
ALTER TABLE public.lab_orders REPLICA IDENTITY FULL;
ALTER TABLE public.pharmacy_dispenses REPLICA IDENTITY FULL;