-- Fix critical: drop overly permissive realtime SELECT policy on messages
DROP POLICY IF EXISTS realtime_authenticated_only ON public.messages;

-- Add DELETE/UPDATE policies for patient-reports storage bucket
CREATE POLICY "patient_reports_staff_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'patient-reports' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND public.user_belongs_to_hospital(auth.uid(), p.hospital_id)
    )
  )
);

CREATE POLICY "patient_reports_staff_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'patient-reports' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND public.user_belongs_to_hospital(auth.uid(), p.hospital_id)
    )
  )
);

-- Add DELETE/UPDATE policies for payment-receipts storage bucket (hospital staff scoped via path: hospital_id/...)
CREATE POLICY "payment_receipts_staff_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND public.user_belongs_to_hospital(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "payment_receipts_staff_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND public.user_belongs_to_hospital(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- Add same-hospital SELECT policy for doctor-signatures bucket (path convention: doctor_user_id/...)
CREATE POLICY "doctor_signatures_same_hospital_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'doctor-signatures'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id::text = (storage.foldername(name))[1]
      AND p.hospital_id IS NOT NULL
      AND public.user_belongs_to_hospital(auth.uid(), p.hospital_id)
  )
);
