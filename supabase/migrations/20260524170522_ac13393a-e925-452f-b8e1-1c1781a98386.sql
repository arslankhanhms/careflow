-- Fix 1: Remove permissive realtime-only SELECT policy on messages that overrides scoped access
DROP POLICY IF EXISTS realtime_authenticated_only ON public.messages;

-- Fix 2: Tighten notifications INSERT - require hospital_id and same-hospital target user
DROP POLICY IF EXISTS notifications_tenant_insert ON public.notifications;
CREATE POLICY notifications_tenant_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id IS NOT NULL
    AND user_belongs_to_hospital(auth.uid(), hospital_id)
    AND user_belongs_to_hospital(user_id, hospital_id)
  );

-- Fix 3: Allow same-hospital staff to read payment receipts (currently only uploader can)
CREATE POLICY "payment_receipts_hospital_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.hospital_id::text = (storage.foldername(name))[1]
        AND user_belongs_to_hospital(auth.uid(), p.hospital_id)
    )
  );