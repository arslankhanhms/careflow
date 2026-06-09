CREATE POLICY "patients_self_select"
ON public.patients
FOR SELECT
TO authenticated
USING (user_id = auth.uid());