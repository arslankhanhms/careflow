-- Private bucket for chat attachments
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

-- Authenticated users can upload to a path that begins with their own user id
create policy "msg_attach_upload_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Owners can read their own uploads
create policy "msg_attach_read_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Recipients can read attachments referenced by messages addressed to them
create policy "msg_attach_read_recipient"
on storage.objects for select
to authenticated
using (
  bucket_id = 'message-attachments'
  and exists (
    select 1 from public.messages m
    where m.attachment_url like '%' || storage.objects.name
      and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
  )
);

-- Owners can delete their own uploads
create policy "msg_attach_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);