-- Allow patients to upload into a folder keyed by their auth uid
CREATE POLICY "patient_reports_patient_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'patient-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "patient_reports_patient_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Hospital staff: any user that shares a hospital with the patient who owns
-- the folder can read the file. We resolve folder uid -> patient -> hospital.
CREATE POLICY "patient_reports_staff_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-reports'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.user_id::text = (storage.foldername(storage.objects.name))[1]
      AND public.user_belongs_to_hospital(auth.uid(), p.hospital_id)
  )
);