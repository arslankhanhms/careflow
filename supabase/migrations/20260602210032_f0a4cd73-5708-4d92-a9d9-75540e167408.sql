ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid;

CREATE INDEX IF NOT EXISTS idx_lab_orders_payment_status
  ON public.lab_orders(hospital_id, payment_status);