-- Least-privilege worlds + IP grants after REVOKE FROM PUBLIC.
--
-- permission denied for table worlds:
--   20260906120000 / schema-dry-run revoke ALL on worlds FROM PUBLIC, which
--   also strips service_role (it only had rights via PUBLIC). Generate lookup
--   and SECURITY DEFINER writes then fail.
--
-- Publishable (anon) key:
--   SELECT complete public worlds + own rows; UPDATE own is_public only.
--   Wallet/catalog RPCs unchanged (authenticated).
--
-- Service role:
--   lookup / pre_save / apply / publish / claim / tick_credits_* / IP tables.
--   Clients never get INSERT/DELETE on worlds. Write RPCs refuse non-service.

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------
revoke all on table public.worlds from public, anon, authenticated;
grant select on table public.worlds to anon, authenticated;
grant update on table public.worlds to authenticated;
grant all on table public.worlds to postgres, service_role;

revoke all on table public.ip_quotas from public, anon, authenticated;
revoke all on table public.ip_identities from public, anon, authenticated;
revoke all on table public.ip_quota_events from public, anon, authenticated;
grant all on table public.ip_quotas to postgres, service_role;
grant all on table public.ip_identities to postgres, service_role;
grant all on table public.ip_quota_events to postgres, service_role;

grant all on table public.app_config to postgres, service_role;
grant all on table public.coin_packs to postgres, service_role;
grant all on table public.profiles to postgres, service_role;
grant all on table public.wallets to postgres, service_role;
grant all on table public.payments to postgres, service_role;
grant all on table public.credit_ledger to postgres, service_role;
grant all on table public.paystack_events to postgres, service_role;

-- ---------------------------------------------------------------------------
-- RLS: gallery is complete+public; owners see their pending/private rows.
-- No INSERT/DELETE policies for anon/authenticated.
-- ---------------------------------------------------------------------------
alter table public.worlds enable row level security;
alter table public.ip_quotas enable row level security;
alter table public.ip_identities enable row level security;
alter table public.ip_quota_events enable row level security;

drop policy if exists worlds_select_visible on public.worlds;
create policy worlds_select_visible on public.worlds
  for select to anon, authenticated
  using (
    (is_public = true and status = 'complete')
    or user_id = auth.uid()
  );

drop policy if exists worlds_update_own on public.worlds;
create policy worlds_update_own on public.worlds
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists worlds_insert_rpc on public.worlds;
drop policy if exists worlds_write_via_rpc on public.worlds;
drop policy if exists worlds_delete_own on public.worlds;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_world_repo_url_norm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.repo_url_norm := public.normalize_repo_url(new.repo_url);
  if new.repo_url_norm is null then
    raise exception 'invalid_repo' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.protect_world_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_role()
     or current_setting('codessey.rpc_world_write', true) = 'on' then
    return new;
  end if;
  if new.user_id is distinct from old.user_id
     or new.world_labs_id is distinct from old.world_labs_id
     or new.operation_id is distinct from old.operation_id
     or new.status is distinct from old.status
     or new.progress is distinct from old.progress
     or new.poll_locked_until is distinct from old.poll_locked_until
     or new.splat_url is distinct from old.splat_url
     or new.thumbnail_url is distinct from old.thumbnail_url
     or new.caption is distinct from old.caption
     or new.marble_url is distinct from old.marble_url
     or new.pano_url is distinct from old.pano_url
     or new.repo_url is distinct from old.repo_url
     or new.repo_url_norm is distinct from old.repo_url_norm
     or new.branch is distinct from old.branch
     or new.repo_name is distinct from old.repo_name
     or new.generation_mode is distinct from old.generation_mode
     or new.billing_source is distinct from old.billing_source
     or new.created_at is distinct from old.created_at then
    raise exception 'world_fields_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lookup (service_role): global unique-repo dedupe, including private/pending.
-- ---------------------------------------------------------------------------
create or replace function public.lookup_world_by_repo_url(p_repo_url text)
returns public.worlds
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.worlds%rowtype;
  v_norm text := public.normalize_repo_url(p_repo_url);
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_norm is null then
    return null;
  end if;

  select * into v_row
  from public.worlds
  where repo_url_norm = v_norm
  limit 1;

  if not found then
    return null;
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Write RPCs: service_role only. GUC lets protect_world_row allow the write.
-- ---------------------------------------------------------------------------
create or replace function public.pre_save_pending_world(
  p_operation_id text,
  p_repo_url text,
  p_branch text,
  p_repo_name text,
  p_user_id uuid default null,
  p_is_public boolean default true,
  p_generation_mode text default 'pano',
  p_billing_source text default 'credits'
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
  v_mode text := coalesce(nullif(trim(p_generation_mode), ''), 'pano');
  v_billing text := coalesce(nullif(trim(p_billing_source), ''), 'credits');
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform set_config('codessey.rpc_world_write', 'on', true);

  if p_operation_id is null or length(trim(p_operation_id)) = 0 then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;
  if p_repo_url is null or length(trim(p_repo_url)) = 0 then
    raise exception 'invalid_repo' using errcode = '22023';
  end if;
  if v_mode not in ('pano', 'world') then
    raise exception 'invalid_generation_mode' using errcode = '22023';
  end if;
  if v_billing not in ('credits', 'user_key') then
    raise exception 'invalid_billing_source' using errcode = '22023';
  end if;

  v_uid := coalesce(p_user_id, auth.uid());
  v_placeholder := 'pending:' || trim(p_operation_id);

  insert into public.worlds (
    user_id, repo_url, branch, repo_name, world_labs_id, operation_id,
    splat_url, status, progress, is_public, generation_mode, billing_source
  ) values (
    v_uid,
    trim(p_repo_url),
    coalesce(nullif(trim(p_branch), ''), 'main'),
    nullif(trim(p_repo_name), ''),
    v_placeholder,
    trim(p_operation_id),
    null,
    'pending',
    'Generating landscape…',
    coalesce(p_is_public, true),
    v_mode,
    v_billing
  )
  on conflict (repo_url_norm) do update set
    operation_id = excluded.operation_id,
    world_labs_id = excluded.world_labs_id,
    branch = excluded.branch,
    repo_name = coalesce(excluded.repo_name, public.worlds.repo_name),
    user_id = coalesce(public.worlds.user_id, excluded.user_id),
    generation_mode = excluded.generation_mode,
    billing_source = excluded.billing_source,
    status = 'pending',
    progress = excluded.progress,
    splat_url = case
      when excluded.generation_mode = 'world' then null
      else public.worlds.splat_url
    end,
    poll_locked_until = null,
    updated_at = now()
  where public.worlds.status in ('pending', 'failed')
     or (public.worlds.generation_mode = 'pano' and excluded.generation_mode = 'world')
  returning * into v_row;

  if not found then
    select * into v_row
    from public.worlds
    where repo_url_norm = public.normalize_repo_url(p_repo_url);
  end if;

  return v_row;
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
  p_marble_url text default null,
  p_pano_url text default null
)
returns public.worlds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.worlds%rowtype;
  v_pano text;
  v_splat text;
  v_world_id text;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform set_config('codessey.rpc_world_write', 'on', true);

  select * into v_row from public.worlds where id = p_world_id for update;
  if not found then
    raise exception 'world_not_found' using errcode = 'P0002';
  end if;

  if v_row.status in ('complete', 'failed') then
    return v_row;
  end if;

  v_pano := nullif(trim(p_pano_url), '');
  v_splat := nullif(trim(p_splat_url), '');
  v_world_id := nullif(trim(p_world_labs_id), '');

  if not coalesce(p_done, false) then
    update public.worlds
    set progress = coalesce(nullif(trim(p_progress), ''), progress),
        pano_url = coalesce(v_pano, pano_url),
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

  if v_world_id is null then
    update public.worlds
    set status = 'failed',
        progress = 'World Labs finished without a world id.',
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  if v_row.generation_mode = 'world' and v_splat is null then
    update public.worlds
    set status = 'failed',
        progress = 'World generated but no splat URL was returned yet.',
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  if v_row.generation_mode = 'pano' and v_pano is null and v_row.pano_url is null then
    update public.worlds
    set status = 'failed',
        progress = 'World generated but no panorama URL was returned yet.',
        poll_locked_until = null
    where id = p_world_id
    returning * into v_row;
    return v_row;
  end if;

  update public.worlds
  set status = 'complete',
      progress = coalesce(nullif(trim(p_progress), ''), 'World ready.'),
      world_labs_id = v_world_id,
      splat_url = coalesce(v_splat, splat_url),
      thumbnail_url = coalesce(p_thumbnail_url, thumbnail_url),
      caption = coalesce(p_caption, caption),
      marble_url = coalesce(p_marble_url, marble_url),
      pano_url = coalesce(v_pano, pano_url),
      poll_locked_until = null
  where id = p_world_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.publish_world(
  p_repo_url text,
  p_branch text,
  p_repo_name text,
  p_world_labs_id text,
  p_splat_url text default null,
  p_thumbnail_url text default null,
  p_caption text default null,
  p_marble_url text default null,
  p_is_public boolean default true,
  p_user_id uuid default null,
  p_pano_url text default null,
  p_generation_mode text default 'pano',
  p_billing_source text default 'credits'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid;
  v_mode text := coalesce(nullif(trim(p_generation_mode), ''), 'pano');
  v_billing text := coalesce(nullif(trim(p_billing_source), ''), 'credits');
  v_splat text := nullif(trim(p_splat_url), '');
  v_pano text := nullif(trim(p_pano_url), '');
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform set_config('codessey.rpc_world_write', 'on', true);

  if p_repo_url is null or length(trim(p_repo_url)) = 0 then
    raise exception 'invalid_repo' using errcode = '22023';
  end if;
  if p_world_labs_id is null then
    raise exception 'invalid_world' using errcode = '22023';
  end if;
  if v_mode not in ('pano', 'world') then
    raise exception 'invalid_generation_mode' using errcode = '22023';
  end if;
  if v_billing not in ('credits', 'user_key') then
    raise exception 'invalid_billing_source' using errcode = '22023';
  end if;
  if v_mode = 'world' and v_splat is null then
    raise exception 'invalid_world' using errcode = '22023';
  end if;
  if v_mode = 'pano' and v_pano is null then
    raise exception 'invalid_world' using errcode = '22023';
  end if;

  v_uid := coalesce(p_user_id, auth.uid());

  insert into public.worlds (
    user_id, repo_url, branch, repo_name, world_labs_id, splat_url,
    thumbnail_url, caption, marble_url, pano_url, is_public,
    generation_mode, billing_source, status, progress
  ) values (
    v_uid, trim(p_repo_url), coalesce(nullif(trim(p_branch), ''), 'main'),
    nullif(trim(p_repo_name), ''), trim(p_world_labs_id), v_splat,
    p_thumbnail_url, p_caption, p_marble_url, v_pano,
    coalesce(p_is_public, true), v_mode, v_billing, 'complete', 'World ready.'
  )
  on conflict (repo_url_norm) do update set
    world_labs_id = excluded.world_labs_id,
    splat_url = coalesce(excluded.splat_url, public.worlds.splat_url),
    thumbnail_url = coalesce(excluded.thumbnail_url, public.worlds.thumbnail_url),
    caption = coalesce(excluded.caption, public.worlds.caption),
    marble_url = coalesce(excluded.marble_url, public.worlds.marble_url),
    pano_url = coalesce(excluded.pano_url, public.worlds.pano_url),
    generation_mode = excluded.generation_mode,
    billing_source = excluded.billing_source,
    status = 'complete',
    progress = 'World ready.',
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants: write + lookup stay off the publishable key.
-- ---------------------------------------------------------------------------
revoke all on function public.lookup_world_by_repo_url(text) from public, anon, authenticated;
revoke all on function public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_latest_pending_worlds(integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.tick_credits(text, boolean) from public, anon, authenticated;
revoke all on function public.tick_credits_as(text, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.tick_credits_for_user(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.protect_world_row() from public, anon, authenticated;
revoke all on function public.set_world_repo_url_norm() from public, anon, authenticated;

grant execute on function public.lookup_world_by_repo_url(text) to service_role;
grant execute on function public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text) to service_role;
grant execute on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text, text, text) to service_role;
grant execute on function public.claim_latest_pending_worlds(integer, uuid, uuid) to service_role;
grant execute on function public.tick_credits(text, boolean) to service_role;
grant execute on function public.tick_credits_as(text, uuid, boolean, integer) to service_role;
grant execute on function public.tick_credits_for_user(text, uuid, boolean) to service_role;
