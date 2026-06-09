
-- 1) Remove permissive messages SELECT policy; messages_self_select already enforces correct access
DROP POLICY IF EXISTS "realtime_authenticated_only" ON public.messages;

-- 2) Standardize patient-reports staff SELECT policy to use patient id (matches update/delete)
DROP POLICY IF EXISTS "patient_reports_staff_select" ON storage.objects;
CREATE POLICY "patient_reports_staff_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-reports'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE (p.id)::text = (storage.foldername(objects.name))[1]
        AND public.user_belongs_to_hospital(auth.uid(), p.hospital_id)
    )
  )
);

-- 3) Tighten user_roles hospital_admin policy: target user must already have a profile
--    or role tied to the same hospital, preventing cross-hospital privilege escalation
DROP POLICY IF EXISTS "roles_hospital_admin_manage" ON public.user_roles;
CREATE POLICY "roles_hospital_admin_manage" ON public.user_roles
FOR ALL TO authenticated
USING (
  hospital_id IS NOT NULL
  AND public.has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::app_role)
  AND role <> ALL (ARRAY['super_admin'::app_role, 'owner'::app_role, 'hospital_admin'::app_role])
)
WITH CHECK (
  hospital_id IS NOT NULL
  AND public.has_hospital_role(auth.uid(), hospital_id, 'hospital_admin'::app_role)
  AND role <> ALL (ARRAY['super_admin'::app_role, 'owner'::app_role, 'hospital_admin'::app_role])
  AND (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.user_id = user_roles.user_id AND pr.hospital_id = user_roles.hospital_id)
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = user_roles.user_id AND ur.hospital_id = user_roles.hospital_id)
  )
);
