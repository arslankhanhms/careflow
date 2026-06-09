-- ============================================================
-- CLEANUP: Remove all data EXCEPT master_admin + National Hospital
-- Run this in Supabase SQL editor
-- ============================================================

DO $$
DECLARE
  v_master_email   text := 'arslankhanhms@gmail.com';
  v_master_id      uuid;
  v_keep_hosp_id   uuid;
BEGIN

  -- Get master admin user ID
  SELECT id INTO v_master_id
    FROM auth.users WHERE email = v_master_email LIMIT 1;

  -- Get National Hospital ID (case-insensitive match)
  SELECT id INTO v_keep_hosp_id
    FROM public.hospitals
    WHERE lower(name) LIKE '%national%'
    ORDER BY created_at ASC
    LIMIT 1;

  RAISE NOTICE 'Keeping master admin: % (%)', v_master_email, v_master_id;
  RAISE NOTICE 'Keeping hospital: %', v_keep_hosp_id;

  -- ============ DELETE ALL HOSPITAL-SCOPED DATA for hospitals to be removed ============

  -- Financial
  DELETE FROM public.financial_audit_log
    WHERE hospital_id IS NOT NULL AND hospital_id <> v_keep_hosp_id;

  DELETE FROM public.collection_closures
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.whatsapp_commands
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.concession_requests
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.doctor_commission_rules
    WHERE hospital_id <> v_keep_hosp_id;

  -- Pharmacy (extended)
  DELETE FROM public.pharmacy_sale_items
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_sales
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_purchase_items
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_purchases
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_medicines
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_categories
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_suppliers
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_customers
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_settings
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_dispenses
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.pharmacy_items
    WHERE hospital_id <> v_keep_hosp_id;

  -- Lab
  DELETE FROM public.lab_results
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.lab_orders
    WHERE hospital_id <> v_keep_hosp_id;

  -- Blood bank
  DELETE FROM public.blood_usages
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.blood_donors
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.blood_inventory
    WHERE hospital_id <> v_keep_hosp_id;

  -- Clinical
  DELETE FROM public.patient_reports
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.prescriptions
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.vitals
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.follow_ups
    WHERE hospital_id <> v_keep_hosp_id;

  -- Appointments & payments
  DELETE FROM public.payments
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.appointments
    WHERE hospital_id <> v_keep_hosp_id;

  -- Billing
  DELETE FROM public.invoice_items
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.invoices
    WHERE hospital_id <> v_keep_hosp_id;

  -- IPD
  DELETE FROM public.admissions
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.beds
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.wards
    WHERE hospital_id <> v_keep_hosp_id;

  -- Patients
  DELETE FROM public.patients
    WHERE hospital_id <> v_keep_hosp_id;

  -- Messages & notifications (for non-kept hospital users)
  DELETE FROM public.messages
    WHERE hospital_id <> v_keep_hosp_id;

  DELETE FROM public.notifications
    WHERE hospital_id <> v_keep_hosp_id
      AND hospital_id IS NOT NULL;

  -- Audit / AI logs
  DELETE FROM public.audit_logs
    WHERE hospital_id <> v_keep_hosp_id
      AND hospital_id IS NOT NULL;

  DELETE FROM public.ai_usage_logs
    WHERE hospital_id <> v_keep_hosp_id
      AND hospital_id IS NOT NULL;

  -- Subscriptions for other hospitals
  DELETE FROM public.hospital_subscriptions
    WHERE hospital_id <> v_keep_hosp_id;

  -- ============ REMOVE NON-KEPT HOSPITALS ============
  DELETE FROM public.hospitals
    WHERE id <> v_keep_hosp_id;

  RAISE NOTICE 'All other hospitals deleted.';

  -- ============ REMOVE NON-ADMIN, NON-HOSPITAL-STAFF USERS ============
  -- Delete profiles for users not linked to kept hospital and not master admin
  DELETE FROM public.profiles
    WHERE user_id <> v_master_id
      AND (hospital_id IS NULL OR hospital_id <> v_keep_hosp_id);

  -- Delete user_roles for users not linked to kept hospital and not master admin
  DELETE FROM public.user_roles
    WHERE user_id <> v_master_id
      AND (hospital_id IS NULL OR hospital_id <> v_keep_hosp_id);

  -- Delete auth users not master admin and not linked to kept hospital
  DELETE FROM auth.identities
    WHERE user_id NOT IN (
      SELECT DISTINCT user_id FROM public.user_roles
        WHERE user_id = v_master_id
           OR hospital_id = v_keep_hosp_id
    );

  DELETE FROM auth.users
    WHERE id NOT IN (
      SELECT DISTINCT user_id FROM public.user_roles
        WHERE user_id = v_master_id
           OR hospital_id = v_keep_hosp_id
    );

  RAISE NOTICE 'Cleanup complete. Kept master admin and National Hospital staff only.';

END $$;
