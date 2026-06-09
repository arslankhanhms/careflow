
-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE public.app_role AS ENUM (
  'super_admin','hospital_admin','doctor','nurse','receptionist',
  'lab_tech','pharmacist','accountant','patient_user'
);
CREATE TYPE public.hospital_status AS ENUM ('active','suspended','trial','cancelled');
CREATE TYPE public.appointment_status AS ENUM ('scheduled','checked_in','in_progress','completed','cancelled','no_show');
CREATE TYPE public.appointment_type AS ENUM ('consultation','followup','telemedicine','emergency','procedure');
CREATE TYPE public.lab_status AS ENUM ('ordered','sample_collected','processing','completed','cancelled');
CREATE TYPE public.bed_status AS ENUM ('free','occupied','cleaning','maintenance');
CREATE TYPE public.invoice_status AS ENUM ('draft','sent','paid','partial','overdue','cancelled');
CREATE TYPE public.gender AS ENUM ('male','female','other','unknown');

-- ============================================================================
-- CORE: HOSPITALS
-- ============================================================================
CREATE TABLE public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  logo_url text,
  brand_color text DEFAULT '#dc2626',
  email text,
  phone text,
  address text,
  city text,
  country text,
  status hospital_status NOT NULL DEFAULT 'trial',
  plan text DEFAULT 'starter',
  ai_credits_monthly integer DEFAULT 1000,
  ai_credits_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hospitals_slug ON public.hospitals(slug);
CREATE INDEX idx_hospitals_status ON public.hospitals(status);

-- ============================================================================
-- ROLES & PROFILES
-- ============================================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, hospital_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_hospital ON public.user_roles(hospital_id);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  display_name text,
  email text,
  phone text,
  avatar_url text,
  specialization text,
  license_no text,
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_hospital ON public.profiles(hospital_id);

-- ============================================================================
-- SECURITY DEFINER HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.has_hospital_role(_user_id uuid, _hospital_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND hospital_id = _hospital_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_hospital(_user_id uuid, _hospital_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND hospital_id = _hospital_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_hospital_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hospital_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- ============================================================================
-- PATIENTS
-- ============================================================================
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  mrn text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  dob date,
  gender gender DEFAULT 'unknown',
  phone text,
  email text,
  address text,
  blood_group text,
  allergies text[],
  chronic_conditions text[],
  emergency_contact_name text,
  emergency_contact_phone text,
  insurance_provider text,
  insurance_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, mrn)
);
CREATE INDEX idx_patients_hospital ON public.patients(hospital_id);
CREATE INDEX idx_patients_name ON public.patients(hospital_id, last_name, first_name);

-- ============================================================================
-- APPOINTMENTS
-- ============================================================================
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  duration_min integer DEFAULT 30,
  type appointment_type DEFAULT 'consultation',
  status appointment_status DEFAULT 'scheduled',
  reason text,
  notes text,
  ai_triage jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_hospital_date ON public.appointments(hospital_id, scheduled_at);
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON public.appointments(doctor_id);

-- ============================================================================
-- VITALS
-- ============================================================================
CREATE TABLE public.vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  recorded_by uuid REFERENCES auth.users(id),
  bp_systolic integer,
  bp_diastolic integer,
  heart_rate integer,
  temperature numeric(4,1),
  spo2 integer,
  respiratory_rate integer,
  weight_kg numeric(5,2),
  height_cm numeric(5,2),
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vitals_patient ON public.vitals(patient_id, recorded_at DESC);

-- ============================================================================
-- PRESCRIPTIONS
-- ============================================================================
CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES auth.users(id),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  medications jsonb NOT NULL DEFAULT '[]'::jsonb,
  diagnosis text,
  notes text,
  ai_assisted boolean DEFAULT false,
  issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prescriptions_patient ON public.prescriptions(patient_id);
CREATE INDEX idx_prescriptions_hospital ON public.prescriptions(hospital_id);

-- ============================================================================
-- LAB
-- ============================================================================
CREATE TABLE public.lab_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  ordered_by uuid REFERENCES auth.users(id),
  tests text[] NOT NULL,
  status lab_status NOT NULL DEFAULT 'ordered',
  priority text DEFAULT 'routine',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_lab_orders_hospital ON public.lab_orders(hospital_id, status);
CREATE INDEX idx_lab_orders_patient ON public.lab_orders(patient_id);

CREATE TABLE public.lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id uuid NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  test_name text NOT NULL,
  value text,
  unit text,
  reference_range text,
  flag text,
  ai_interpretation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lab_results_order ON public.lab_results(lab_order_id);

-- ============================================================================
-- PHARMACY
-- ============================================================================
CREATE TABLE public.pharmacy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  category text,
  unit text DEFAULT 'tablet',
  stock_qty integer NOT NULL DEFAULT 0,
  reorder_level integer DEFAULT 10,
  unit_price numeric(10,2) DEFAULT 0,
  expiry_date date,
  manufacturer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pharmacy_items_hospital ON public.pharmacy_items(hospital_id);

CREATE TABLE public.pharmacy_dispenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  dispensed_by uuid REFERENCES auth.users(id),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric(10,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pharm_disp_hospital ON public.pharmacy_dispenses(hospital_id);

-- ============================================================================
-- WARDS / BEDS / ADMISSIONS
-- ============================================================================
CREATE TABLE public.wards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL,
  ward_type text DEFAULT 'general',
  floor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  label text NOT NULL,
  status bed_status NOT NULL DEFAULT 'free',
  daily_rate numeric(10,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_beds_hospital ON public.beds(hospital_id, status);

CREATE TABLE public.admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  bed_id uuid REFERENCES public.beds(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES auth.users(id),
  admitted_at timestamptz NOT NULL DEFAULT now(),
  discharged_at timestamptz,
  diagnosis text,
  discharge_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admissions_hospital ON public.admissions(hospital_id);

-- ============================================================================
-- BILLING
-- ============================================================================
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  subtotal numeric(10,2) DEFAULT 0,
  tax numeric(10,2) DEFAULT 0,
  discount numeric(10,2) DEFAULT 0,
  total numeric(10,2) DEFAULT 0,
  paid numeric(10,2) DEFAULT 0,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, invoice_no)
);
CREATE INDEX idx_invoices_hospital ON public.invoices(hospital_id, status);

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(10,2) DEFAULT 0,
  total numeric(10,2) DEFAULT 0
);

-- ============================================================================
-- AUDIT LOG (append-only)
-- ============================================================================
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_hospital ON public.audit_logs(hospital_id, created_at DESC);

-- ============================================================================
-- AI USAGE
-- ============================================================================
CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  cost_credits integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_hospital ON public.ai_usage_logs(hospital_id, created_at DESC);

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  price_monthly numeric(10,2) NOT NULL,
  ai_credits integer DEFAULT 1000,
  max_users integer DEFAULT 10,
  max_patients integer DEFAULT 1000,
  features jsonb DEFAULT '[]'::jsonb,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hospital_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status text DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  stripe_subscription_id text
);

-- ============================================================================
-- TIMESTAMP TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_hospitals_updated BEFORE UPDATE ON public.hospitals FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER trg_pharm_items_updated BEFORE UPDATE ON public.pharmacy_items FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- ENABLE RLS
-- ============================================================================
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_dispenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Hospitals: super_admin all; staff see only their hospital
CREATE POLICY hospitals_super_all ON public.hospitals FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY hospitals_staff_view ON public.hospitals FOR SELECT TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), id));

-- user_roles
CREATE POLICY roles_super_all ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY roles_self_view ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY roles_hospital_admin_manage ON public.user_roles FOR ALL TO authenticated
  USING (hospital_id IS NOT NULL AND public.has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'))
  WITH CHECK (hospital_id IS NOT NULL AND public.has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'));

-- profiles
CREATE POLICY profiles_self_view ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid())
    OR (hospital_id IS NOT NULL AND public.user_belongs_to_hospital(auth.uid(), hospital_id)));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Generic tenant-scoped helper macro applied per table
-- patients
CREATE POLICY patients_tenant_all ON public.patients FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- appointments
CREATE POLICY appointments_tenant_all ON public.appointments FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- vitals
CREATE POLICY vitals_tenant_all ON public.vitals FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- prescriptions
CREATE POLICY prescriptions_tenant_all ON public.prescriptions FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- lab_orders
CREATE POLICY lab_orders_tenant_all ON public.lab_orders FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- lab_results
CREATE POLICY lab_results_tenant_all ON public.lab_results FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- pharmacy_items
CREATE POLICY pharm_items_tenant_all ON public.pharmacy_items FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- pharmacy_dispenses
CREATE POLICY pharm_disp_tenant_all ON public.pharmacy_dispenses FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- wards
CREATE POLICY wards_tenant_all ON public.wards FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- beds
CREATE POLICY beds_tenant_all ON public.beds FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- admissions
CREATE POLICY admissions_tenant_all ON public.admissions FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- invoices
CREATE POLICY invoices_tenant_all ON public.invoices FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- invoice_items
CREATE POLICY invoice_items_tenant_all ON public.invoice_items FOR ALL TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id))
  WITH CHECK (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- audit_logs: tenant view + super_admin all; insert allowed for any authed user in the tenant
CREATE POLICY audit_tenant_view ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR (hospital_id IS NOT NULL AND public.user_belongs_to_hospital(auth.uid(), hospital_id)));
CREATE POLICY audit_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (hospital_id IS NULL OR public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- ai_usage_logs
CREATE POLICY ai_usage_tenant_view ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
    OR (hospital_id IS NOT NULL AND public.user_belongs_to_hospital(auth.uid(), hospital_id)));
CREATE POLICY ai_usage_insert ON public.ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (hospital_id IS NULL OR public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- subscription_plans: readable by everyone authed; only super_admin manages
CREATE POLICY plans_view ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY plans_super_manage ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- hospital_subscriptions
CREATE POLICY hsub_super_all ON public.hospital_subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY hsub_tenant_view ON public.hospital_subscriptions FOR SELECT TO authenticated
  USING (public.user_belongs_to_hospital(auth.uid(), hospital_id));

-- ============================================================================
-- SEED: subscription plans + demo hospital
-- ============================================================================
INSERT INTO public.subscription_plans (name, price_monthly, ai_credits, max_users, max_patients, features) VALUES
  ('Starter', 99, 1000, 10, 1000, '["Patients","Appointments","AI Triage"]'::jsonb),
  ('Professional', 299, 5000, 50, 10000, '["All Starter","Lab","Pharmacy","Billing","WhatsApp"]'::jsonb),
  ('Enterprise', 999, 25000, 500, 100000, '["All Pro","SSO","Custom domain","Priority support","SLA"]'::jsonb);

INSERT INTO public.hospitals (slug, name, brand_color, status, plan, email, city, country)
VALUES ('ryk_hospital', 'RYK Hospital', '#dc2626', 'active', 'Professional', 'admin@ryk-hospital.com', 'Karachi', 'Pakistan');
