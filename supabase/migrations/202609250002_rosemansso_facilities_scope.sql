begin;

-- Keep the existing pilot operation handlers intact while aligning their direct
-- AAL2 checks with the exact-provider MFA policy already used by staff APIs.
do $$
declare
  definition text;
  original text;
begin
  definition := pg_get_functiondef('public.pilot_is_creator(uuid)'::regprocedure);
  original := definition;
  definition := replace(definition,
    $old$coalesce(auth.jwt()->>'aal','')='aal2'$old$,
    $new$public.staff_mfa_verified()$new$);
  if definition = original then
    raise exception 'pilot_is_creator MFA guard did not match; review current function before applying this migration';
  end if;
  execute definition;

  definition := pg_get_functiondef('public.pilot_operations(text,jsonb)'::regprocedure);
  original := definition;
  definition := replace(definition,
    $old$coalesce(auth.jwt()->>'aal','')<>'aal2'$old$,
    $new$not public.staff_mfa_verified()$new$);
  if definition = original then
    raise exception 'pilot_operations MFA guard did not match; review before applying';
  end if;
  original := definition;
  definition := replace(definition,
    $old$from public.pilot_venues v;$old$,
    $new$from public.pilot_venues v where lower(v.campus)='summerlin';$new$);
  if definition = original then
    raise exception 'pilot_operations venue query did not match; review before applying';
  end if;
  execute definition;
end $$;

commit;
