
-- Allow patient users to SELECT their own appointments and payments so
-- realtime postgres_changes broadcasts reach the patient dashboard.

CREATE POLICY appointments_patient_self_select
ON public.appointments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = appointments.patient_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY payments_patient_self_select
ON public.payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = payments.patient_id
      AND p.user_id = auth.uid()
  )
);
