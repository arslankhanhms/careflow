-- 1. Hospitals: drop anon from public-read policy
DROP POLICY IF EXISTS "hospitals_public_read" ON public.hospitals;
CREATE POLICY "hospitals_public_read"
ON public.hospitals
FOR SELECT
TO authenticated
USING (status = 'active');

-- 2. Profiles: drop overly broad public doctor read; same-hospital staff still
-- see via profiles_self_view, and public flows use supabaseAdmin server fns.
DROP POLICY IF EXISTS "profiles_public_doctors" ON public.profiles;

-- 3. Storage: drop overly broad staff read on payment-receipts.
DROP POLICY IF EXISTS "payment_receipts_staff_read" ON storage.objects;

-- 4. user_roles: prevent hospital_admin from inserting super_admin role.
DROP POLICY IF EXISTS "roles_hospital_admin_manage" ON public.user_roles;
CREATE POLICY "roles_hospital_admin_manage"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  (hospital_id IS NOT NULL)
  AND public.has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::public.app_role)
)
WITH CHECK (
  (hospital_id IS NOT NULL)
  AND public.has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::public.app_role)
  AND role <> 'super_admin'::public.app_role
);

-- 5. Realtime: require authentication to subscribe at all. Per-row visibility
-- of postgres_changes already inherits the underlying table RLS.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "realtime_authenticated_only" ON realtime.messages;
CREATE POLICY "realtime_authenticated_only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

-- 6. Revoke EXECUTE on trigger-only helper functions from web roles.
REVOKE EXECUTE ON FUNCTION public.tg_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_pmr() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_mrn() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_decrement_blood_inventory() FROM PUBLIC, anon, authenticated;

-- Revoke from anon (these are only needed in authenticated RLS contexts).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_hospital_role(uuid, uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_hospital(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_hospital_id(uuid) FROM anon;