begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pilot-portfolio',
  'pilot-portfolio',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.portfolio_object_is_owned(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((storage.foldername(object_name))[1] = auth.uid()::text, false);
$$;

create or replace function public.portfolio_object_is_shared(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.portfolio_documents document
    join public.packet_items item
      on item.item_type = 'portfolio_document'
     and item.item_id = document.id
    join public.advising_packets packet
      on packet.id = item.packet_id
    where document.storage_path = object_name
      and packet.advisor_id = auth.uid()
      and packet.status = 'active'
      and packet.revoked_at is null
      and (packet.expires_at is null or packet.expires_at > now())
      and public.staff_mfa_verified()
      and public.is_assigned_advisor(document.student_id, document.program_id)
  );
$$;

revoke all on function public.portfolio_object_is_owned(text) from public, anon;
revoke all on function public.portfolio_object_is_shared(text) from public, anon;
grant execute on function public.portfolio_object_is_owned(text) to authenticated;
grant execute on function public.portfolio_object_is_shared(text) to authenticated;

drop policy if exists pilot_portfolio_read on storage.objects;
create policy pilot_portfolio_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pilot-portfolio'
  and (
    public.portfolio_object_is_owned(name)
    or public.portfolio_object_is_shared(name)
  )
);

drop policy if exists pilot_portfolio_insert on storage.objects;
create policy pilot_portfolio_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pilot-portfolio'
  and public.portfolio_object_is_owned(name)
);

drop policy if exists pilot_portfolio_update on storage.objects;
create policy pilot_portfolio_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pilot-portfolio'
  and public.portfolio_object_is_owned(name)
)
with check (
  bucket_id = 'pilot-portfolio'
  and public.portfolio_object_is_owned(name)
);

drop policy if exists pilot_portfolio_delete on storage.objects;
create policy pilot_portfolio_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pilot-portfolio'
  and public.portfolio_object_is_owned(name)
);

commit;
