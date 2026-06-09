
-- 1. ai_usage_logs: prevent attribution to other users when hospital_id is null
DROP POLICY IF EXISTS "ai_usage_insert" ON public.ai_usage_logs;
CREATE POLICY "ai_usage_insert" ON public.ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (hospital_id IS NOT NULL AND public.user_belongs_to_hospital(auth.uid(), hospital_id) AND (user_id IS NULL OR user_id = auth.uid()))
    OR (hospital_id IS NULL AND user_id = auth.uid())
  );

-- 2. messages: remove overly permissive realtime SELECT policy on public.messages
DROP POLICY IF EXISTS "realtime_authenticated_only" ON public.messages;

-- 3. Storage: align payment-receipts INSERT to hospital-scoped folder
DROP POLICY IF EXISTS "payment_receipts_owner_insert" ON storage.objects;
CREATE POLICY "payment_receipts_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.user_belongs_to_hospital(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- 4. user_roles: prevent hospital_admin from granting elevated roles
DROP POLICY IF EXISTS "roles_hospital_admin_manage" ON public.user_roles;
CREATE POLICY "roles_hospital_admin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    hospital_id IS NOT NULL
    AND public.has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::app_role)
    AND role NOT IN ('super_admin'::app_role, 'owner'::app_role, 'hospital_admin'::app_role)
  )
  WITH CHECK (
    hospital_id IS NOT NULL
    AND public.has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::app_role)
    AND role NOT IN ('super_admin'::app_role, 'owner'::app_role, 'hospital_admin'::app_role)
  );
