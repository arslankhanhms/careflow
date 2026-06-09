-- Fix: Grant missing permissions on core tables and helper functions
-- The early migrations created tables without explicit GRANTs to authenticated/anon roles.
-- Pharmacy tables added later had GRANTs; this migration patches the core ones.

-- ============ GRANT TABLE ACCESS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospitals              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vitals                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_orders             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_results            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_items         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_dispenses     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wards                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beds                   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admissions             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_logs          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospital_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blood_inventory        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blood_donors           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blood_usages           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_commission_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concession_requests    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_reports        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_closures    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_commands      TO authenticated;
GRANT SELECT, INSERT               ON public.financial_audit_log      TO authenticated;

-- ============ GRANT FUNCTION EXECUTE ============
-- These are called directly via supabase.rpc() from the client (authenticated role)
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_hospital_role(uuid, uuid, app_role)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_hospital(uuid, uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_hospital_id(uuid)                     TO authenticated;

-- ============ SERVICE ROLE FULL ACCESS ============
GRANT ALL ON public.hospitals              TO service_role;
GRANT ALL ON public.user_roles             TO service_role;
GRANT ALL ON public.profiles               TO service_role;
GRANT ALL ON public.patients               TO service_role;
GRANT ALL ON public.appointments           TO service_role;
GRANT ALL ON public.vitals                 TO service_role;
GRANT ALL ON public.prescriptions          TO service_role;
GRANT ALL ON public.lab_orders             TO service_role;
GRANT ALL ON public.lab_results            TO service_role;
GRANT ALL ON public.pharmacy_items         TO service_role;
GRANT ALL ON public.pharmacy_dispenses     TO service_role;
GRANT ALL ON public.wards                  TO service_role;
GRANT ALL ON public.beds                   TO service_role;
GRANT ALL ON public.admissions             TO service_role;
GRANT ALL ON public.invoices               TO service_role;
GRANT ALL ON public.invoice_items          TO service_role;
GRANT ALL ON public.audit_logs             TO service_role;
GRANT ALL ON public.ai_usage_logs          TO service_role;
GRANT ALL ON public.subscription_plans     TO service_role;
GRANT ALL ON public.hospital_subscriptions TO service_role;
GRANT ALL ON public.payments               TO service_role;
GRANT ALL ON public.follow_ups             TO service_role;
GRANT ALL ON public.notifications          TO service_role;
GRANT ALL ON public.blood_inventory        TO service_role;
GRANT ALL ON public.blood_donors           TO service_role;
GRANT ALL ON public.blood_usages           TO service_role;
GRANT ALL ON public.messages               TO service_role;
GRANT ALL ON public.doctor_commission_rules TO service_role;
GRANT ALL ON public.concession_requests    TO service_role;
GRANT ALL ON public.patient_reports        TO service_role;
GRANT ALL ON public.collection_closures    TO service_role;
GRANT ALL ON public.whatsapp_commands      TO service_role;
GRANT ALL ON public.financial_audit_log    TO service_role;
