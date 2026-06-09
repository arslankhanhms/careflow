
-- ============ 1. STAFF MESSAGES ============
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body text,
  attachment_url text,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_pair ON public.messages (hospital_id, sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_messages_recipient_unread ON public.messages (recipient_id, read_at) WHERE read_at IS NULL;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Read: only sender or recipient
CREATE POLICY messages_self_select ON public.messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Insert: sender is current user, both belong to the same hospital (and both have a staff role there)
CREATE POLICY messages_send ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND user_belongs_to_hospital(auth.uid(), hospital_id)
    AND user_belongs_to_hospital(recipient_id, hospital_id)
  );

-- Update: recipient may flip delivered_at / read_at
CREATE POLICY messages_recipient_update ON public.messages
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ============ 2. PAYMENT RECEIPTS BUCKET ============
INSERT INTO storage.buckets (id, name, public)
  VALUES ('payment-receipts', 'payment-receipts', false)
  ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to a folder named after their user id
CREATE POLICY "payment_receipts_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Owners (uploader) can read their own files
CREATE POLICY "payment_receipts_owner_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Any staff member can read receipts (verification UI)
CREATE POLICY "payment_receipts_staff_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );
