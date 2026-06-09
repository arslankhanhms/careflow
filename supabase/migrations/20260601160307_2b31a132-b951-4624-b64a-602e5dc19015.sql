CREATE TABLE public.pharmacy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL UNIQUE,
  default_tax_percent numeric NOT NULL DEFAULT 0,
  default_discount_percent numeric NOT NULL DEFAULT 0,
  default_discount_type text NOT NULL DEFAULT 'percent',
  invoice_prefix text NOT NULL DEFAULT 'INV',
  invoice_padding integer NOT NULL DEFAULT 6,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  expiry_warning_days integer NOT NULL DEFAULT 30,
  currency text NOT NULL DEFAULT 'PKR',
  receipt_footer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_settings TO authenticated;
GRANT ALL ON public.pharmacy_settings TO service_role;

ALTER TABLE public.pharmacy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharm_settings_tenant_all ON public.pharmacy_settings
  FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

CREATE TRIGGER pharm_settings_updated_at
  BEFORE UPDATE ON public.pharmacy_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
