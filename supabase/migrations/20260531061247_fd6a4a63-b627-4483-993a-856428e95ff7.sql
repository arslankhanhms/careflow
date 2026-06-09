
-- ============ CATEGORIES ============
CREATE TABLE public.pharmacy_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_categories TO authenticated;
GRANT ALL ON public.pharmacy_categories TO service_role;
ALTER TABLE public.pharmacy_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharm_cat_tenant_all ON public.pharmacy_categories FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- ============ SUPPLIERS ============
CREATE TABLE public.pharmacy_suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_suppliers TO authenticated;
GRANT ALL ON public.pharmacy_suppliers TO service_role;
ALTER TABLE public.pharmacy_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharm_sup_tenant_all ON public.pharmacy_suppliers FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- ============ CUSTOMERS ============
CREATE TABLE public.pharmacy_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  cnic TEXT,
  address TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_customers TO authenticated;
GRANT ALL ON public.pharmacy_customers TO service_role;
ALTER TABLE public.pharmacy_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharm_cust_tenant_all ON public.pharmacy_customers FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- ============ MEDICINES ============
CREATE TABLE public.pharmacy_medicines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL,
  name TEXT NOT NULL,
  generic_name TEXT,
  category_id UUID,
  company TEXT,
  batch_no TEXT,
  expiry_date DATE,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  min_stock_level INTEGER NOT NULL DEFAULT 10,
  barcode TEXT,
  unit TEXT DEFAULT 'tablet',
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pharm_med_hosp ON public.pharmacy_medicines(hospital_id);
CREATE INDEX idx_pharm_med_name ON public.pharmacy_medicines(hospital_id, name);
CREATE INDEX idx_pharm_med_barcode ON public.pharmacy_medicines(hospital_id, barcode);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_medicines TO authenticated;
GRANT ALL ON public.pharmacy_medicines TO service_role;
ALTER TABLE public.pharmacy_medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharm_med_tenant_all ON public.pharmacy_medicines FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- ============ SALES ============
CREATE TABLE public.pharmacy_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL,
  invoice_no TEXT NOT NULL,
  customer_id UUID,
  customer_name_snapshot TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'fixed',
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  cashier_id UUID,
  notes TEXT,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, invoice_no)
);
CREATE INDEX idx_pharm_sales_hosp ON public.pharmacy_sales(hospital_id, sold_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_sales TO authenticated;
GRANT ALL ON public.pharmacy_sales TO service_role;
ALTER TABLE public.pharmacy_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharm_sales_tenant_all ON public.pharmacy_sales FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION public.tg_pharm_sale_invoice_no()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' THEN
    NEW.invoice_no := 'INV-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*999999))::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_pharm_sale_invoice_no BEFORE INSERT ON public.pharmacy_sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_pharm_sale_invoice_no();

-- ============ SALE ITEMS ============
CREATE TABLE public.pharmacy_sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL,
  sale_id UUID NOT NULL REFERENCES public.pharmacy_sales(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL,
  medicine_name_snapshot TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pharm_sale_items_sale ON public.pharmacy_sale_items(sale_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_sale_items TO authenticated;
GRANT ALL ON public.pharmacy_sale_items TO service_role;
ALTER TABLE public.pharmacy_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharm_sale_items_tenant_all ON public.pharmacy_sale_items FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- Auto-decrement medicine stock on sale item insert
CREATE OR REPLACE FUNCTION public.tg_pharm_decrement_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pharmacy_medicines
    SET stock_qty = GREATEST(0, stock_qty - NEW.qty),
        updated_at = now()
    WHERE id = NEW.medicine_id;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_pharm_decrement_stock AFTER INSERT ON public.pharmacy_sale_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_pharm_decrement_stock();

-- ============ PURCHASES ============
CREATE TABLE public.pharmacy_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL,
  supplier_id UUID,
  reference_no TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pharm_pur_hosp ON public.pharmacy_purchases(hospital_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_purchases TO authenticated;
GRANT ALL ON public.pharmacy_purchases TO service_role;
ALTER TABLE public.pharmacy_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharm_pur_tenant_all ON public.pharmacy_purchases FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- ============ PURCHASE ITEMS ============
CREATE TABLE public.pharmacy_purchase_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL,
  purchase_id UUID NOT NULL REFERENCES public.pharmacy_purchases(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  received BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pharm_pur_items_pur ON public.pharmacy_purchase_items(purchase_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_purchase_items TO authenticated;
GRANT ALL ON public.pharmacy_purchase_items TO service_role;
ALTER TABLE public.pharmacy_purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY pharm_pur_items_tenant_all ON public.pharmacy_purchase_items FOR ALL TO authenticated
  USING (user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (user_belongs_to_hospital(auth.uid(), hospital_id));

-- Updated-at triggers (reuses existing tg_updated_at)
CREATE TRIGGER pharm_cat_updated_at BEFORE UPDATE ON public.pharmacy_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER pharm_sup_updated_at BEFORE UPDATE ON public.pharmacy_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER pharm_cust_updated_at BEFORE UPDATE ON public.pharmacy_customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER pharm_med_updated_at BEFORE UPDATE ON public.pharmacy_medicines
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER pharm_pur_updated_at BEFORE UPDATE ON public.pharmacy_purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
