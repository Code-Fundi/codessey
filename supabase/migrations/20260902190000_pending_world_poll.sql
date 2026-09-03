-- Pending worlds are pre-saved on generate 200. Polling is sequential and only
-- claims the latest pending row(s) — never a full pending-table sweep.
-- World Labs has no webhooks; Next.js calls these RPCs then hits operations/{id}.

alter table public.worlds
  add column if not exists operation_id text,
  add column if not exists status text,
  add column if not exists progress text,
  add column if not exists poll_locked_until timestamptz;

alter table public.worlds
  alter column splat_url drop not null;

update public.worlds
set status = 'complete'
where status is null;

alter table public.worlds
  drop constraint if exists worlds_status_check;

alter table public.worlds
  add constraint worlds_status_check
  check (status in ('pending', 'complete', 'failed'));

alter table public.worlds
  alter column status set default 'complete';

alter table public.worlds
  alter column status set not null;

create unique index if not exists worlds_operation_id_idx
  on public.worlds (operation_id);

create index if not exists worlds_pending_latest_idx
  on public.worlds (created_at desc)
  where status = 'pending';

create or replace function public.pre_save_pending_world(
  p_operation_id text,
  p_repo_url text,
  p_branch text,
  p_repo_name text,
  p_user_id uuid default null,
  p_is_public boolean default true
)
returns public.worlds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.worlds%rowtype;
  v_uid uuid;
  v_placeholder text;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_operation_id is null or length(trim(p_operation_id)) = 0 then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;
  if p_repo_url is null or length(trim(p_repo_url)) = 0 then
    raise exception 'invalid_repo' using errcode = '22023';
  end if;

  v_uid := coalesce(p_user_id, auth.uid());
  v_placeholder := 'pending:' || trim(p_operation_id);

  insert into public.worlds (
    user_id, repo_url, branch, repo_name, world_labs_id, operation_id,
    splat_url, status, progress, is_public
  ) values (
    v_uid,
    trim(p_repo_url),
    coalesce(nullif(trim(p_branch), ''), 'main'),
    nullif(trim(p_repo_name), ''),
    v_placeholder,
    trim(p_operation_id),
    null,
    'pending',
    'Generating landscape (about 5 minutes)…',
    coalesce(p_is_public, true)
  )
  on conflict (operation_id) do update set
    progress = excluded.progress,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.claim_latest_pending_worlds(
  p_limit integer default 1,
  p_user_id uuid default null,
  p_world_id uuid default null
)
returns setof public.worlds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_row public.worlds%rowtype;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_world_id is null and p_user_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 1), 3));

  for v_row in
    select w.*
    from public.worlds w
    where w.status = 'pending'
      and w.operation_id is not null
      and (w.poll_locked_until is null or w.poll_locked_until < now())
      and (
        case
          when p_world_id is not null and p_user_id is not null then
            w.id = p_world_id and (w.user_id = p_user_id or w.user_id is null)
          when p_world_id is not null then
            w.id = p_world_id and w.user_id is null
          else
            w.user_id = p_user_id
        end
      )
    order by w.created_at desc
    limit v_limit
    for update skip locked
  loop
    update public.worlds
    set poll_locked_until = now() + interval '25 seconds',
        progress = coalesce(progress, 'Polling World Labs…')
    where id = v_row.id
    returning * into v_row;
    return next v_row;
  end loop;
end;
$$;

create or replace function public.apply_world_poll_result(
  p_world_id uuid,
  p_done boolean,
  p_progress text default null,
  p_error text default null,
  p_world_labs_id text default null,
  p_splat_url text default null,
  p_thumbnail_url text default null,
  p_caption text default null,
  p_marble_url text default null
)
returns public.worlds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.worlds%rowtype;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_row from public.worlds where id = p_world_id for update;
  if not found then
    raise exception 'world_not_found' using errcode = 'P0002';
  end if;

  if v_row.status in ('complete', 'failed') then
    return v_row;
  end if;

  if not coalesce(p_done, false) then
    update public.worlds
    set progress = coalesce(nullif(trim(p_progress), ''), progress),
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  if p_error is not null and length(trim(p_error)) > 0 then
    update public.worlds
    set status = 'failed',
        progress = trim(p_error),
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  if p_world_labs_id is null or p_splat_url is null then
    update public.worlds
    set status = 'failed',
        progress = 'World Labs finished without assets.',
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  update public.worlds
  set status = 'complete',
      progress = coalesce(nullif(trim(p_progress), ''), 'World ready.'),
      world_labs_id = trim(p_world_labs_id),
      splat_url = trim(p_splat_url),
      thumbnail_url = coalesce(p_thumbnail_url, thumbnail_url),
      caption = coalesce(p_caption, caption),
      marble_url = coalesce(p_marble_url, marble_url),
      poll_locked_until = null
  where id = p_world_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.pre_save_pending_world(text, text, text, text, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.claim_latest_pending_worlds(integer, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.pre_save_pending_world(text, text, text, text, uuid, boolean) to service_role;
grant execute on function public.claim_latest_pending_worlds(integer, uuid, uuid) to service_role;
grant execute on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text) to service_role;
