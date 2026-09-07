-- Pano vs 3D, user-key vs credits, one landscape per repo, variable consume amount.

alter table public.worlds
  add column if not exists generation_mode text not null default 'pano',
  add column if not exists billing_source text not null default 'credits',
  add column if not exists repo_url_norm text;

update public.worlds
set repo_url_norm = lower(regexp_replace(regexp_replace(regexp_replace(trim(repo_url), '/+$', ''), '\.git$', '', 'i'), '/+$', ''))
where repo_url_norm is null;

update public.worlds
set generation_mode = case when splat_url is not null and length(trim(splat_url)) > 0 then 'world' else 'pano' end
where generation_mode is null or generation_mode not in ('pano', 'world');

with ranked as (
  select id,
    row_number() over (
      partition by repo_url_norm
      order by
        case status when 'complete' then 0 when 'pending' then 1 else 2 end,
        created_at desc
    ) as rn
  from public.worlds
  where repo_url_norm is not null
)
delete from public.worlds where id in (select id from ranked where rn > 1);

alter table public.worlds drop constraint if exists worlds_generation_mode_check;
alter table public.worlds add constraint worlds_generation_mode_check
  check (generation_mode in ('pano', 'world'));
alter table public.worlds drop constraint if exists worlds_billing_source_check;
alter table public.worlds add constraint worlds_billing_source_check
  check (billing_source in ('credits', 'user_key'));

create unique index if not exists worlds_repo_url_norm_idx on public.worlds (repo_url_norm);

create or replace function public.normalize_repo_url(p_url text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(regexp_replace(regexp_replace(regexp_replace(trim(coalesce(p_url, '')), '/+$', ''), '\.git$', '', 'i'), '/+$', '')),
    ''
  );
$$;

create or replace function public.set_world_repo_url_norm()
returns trigger
language plpgsql
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

drop trigger if exists worlds_set_repo_url_norm on public.worlds;
create trigger worlds_set_repo_url_norm
  before insert or update of repo_url on public.worlds
  for each row execute function public.set_world_repo_url_norm();

create or replace function public.protect_world_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_role() then
    return new;
  end if;
  if new.user_id is distinct from old.user_id
     or new.world_labs_id is distinct from old.world_labs_id
     or new.splat_url is distinct from old.splat_url
     or new.pano_url is distinct from old.pano_url
     or new.repo_url is distinct from old.repo_url
     or new.repo_url_norm is distinct from old.repo_url_norm
     or new.branch is distinct from old.branch
     or new.marble_url is distinct from old.marble_url
     or new.generation_mode is distinct from old.generation_mode
     or new.billing_source is distinct from old.billing_source then
    raise exception 'world_fields_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

update public.app_config set value_int = 50 where key = 'custom_cents_per_coin';
insert into public.app_config (key, value_int) values ('custom_cents_per_coin', 50)
on conflict (key) do update set value_int = excluded.value_int, updated_at = now();

drop function if exists public.tick_credits_as(text, uuid, boolean);
drop function if exists public.tick_credits_as(text, uuid, boolean, integer);

create or replace function public.tick_credits_as(
  p_ip_hash text,
  p_user_id uuid,
  p_consume boolean,
  p_amount integer default 1
)
returns table (
  ok boolean,
  balance integer,
  paid_balance integer,
  free_balance integer,
  next_refresh_at timestamptz,
  seconds_until_refresh integer,
  source text,
  error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := p_user_id;
  v_quota public.ip_quotas%rowtype;
  v_paid integer := 0;
  v_free integer := 0;
  v_wait integer := 0;
  v_min_ms integer;
  v_max_accounts integer;
  v_amount integer := coalesce(p_amount, 1);
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_quota := public.refill_ip_quota(p_ip_hash);
  v_max_accounts := coalesce(public.config_int('ip_max_accounts'), 3);
  v_min_ms := coalesce(public.config_int('consume_min_interval_ms'), 2000);

  if v_uid is not null then
    select balance into v_paid from public.wallets where user_id = v_uid for update;
    if v_paid is null then
      insert into public.wallets (user_id, balance) values (v_uid, 0);
      v_paid := 0;
    end if;
    insert into public.ip_identities (ip_hash, user_id)
    values (p_ip_hash, v_uid)
    on conflict (user_id) do nothing;
  else
    v_paid := 0;
  end if;

  v_free := floor(v_quota.tokens)::integer;
  v_wait := public.seconds_until_free_token(v_quota.tokens, v_quota.capacity);

  if not p_consume then
    return query select
      true, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait,
      case when v_paid > 0 then 'wallet' else 'ip' end, null::text;
    return;
  end if;

  if v_amount not in (1, 20) then
    return query select
      false, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait, 'none'::text, 'invalid_amount'::text;
    return;
  end if;

  if v_quota.last_consume_at is not null
     and extract(epoch from (now() - v_quota.last_consume_at)) * 1000 < v_min_ms then
    return query select
      false, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait, 'ip'::text, 'rate_limited'::text;
    return;
  end if;

  if v_uid is not null and v_paid >= v_amount then
    v_paid := v_paid - v_amount;
    update public.wallets set balance = v_paid where user_id = v_uid;
    insert into public.credit_ledger (user_id, delta, reason, balance_after)
    values (v_uid, -v_amount, 'generate', v_paid);
    update public.ip_quotas set last_consume_at = now(), consume_count = consume_count + 1
    where ip_hash = p_ip_hash;
    v_free := floor((select tokens from public.ip_quotas where ip_hash = p_ip_hash))::integer;
    v_wait := public.seconds_until_free_token(
      (select tokens from public.ip_quotas where ip_hash = p_ip_hash), v_quota.capacity);
    return query select
      true, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait, 'wallet'::text, null::text;
    return;
  end if;

  -- 3D (20 coins) cannot fall through to the IP leaky bucket.
  if v_amount > 1 then
    return query select
      false, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait, 'wallet'::text, 'insufficient_coins'::text;
    return;
  end if;

  if v_quota.tokens < 1 then
    return query select
      false, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait, 'ip'::text, 'insufficient_coins'::text;
    return;
  end if;

  v_quota.tokens := v_quota.tokens - 1;
  update public.ip_quotas
  set tokens = v_quota.tokens, last_consume_at = now(), consume_count = consume_count + 1
  where ip_hash = p_ip_hash;

  insert into public.ip_quota_events (ip_hash, user_id, delta, reason, tokens_after)
  values (p_ip_hash, v_uid, -1, 'generate', v_quota.tokens);

  v_free := floor(v_quota.tokens)::integer;
  v_wait := public.seconds_until_free_token(v_quota.tokens, v_quota.capacity);

  return query select
    true, v_paid + v_free, v_paid, v_free,
    now() + make_interval(secs => v_wait), v_wait, 'ip'::text, null::text;
end;
$$;

drop function if exists public.pre_save_pending_world(text, text, text, text, uuid, boolean);
drop function if exists public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text);

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
    user_id = coalesce(excluded.user_id, public.worlds.user_id),
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
  returning * into v_row;

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

drop function if exists public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid);
drop function if exists public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text);
drop function if exists public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text, text, text);

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

revoke all on function public.tick_credits_as(text, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.tick_credits_as(text, uuid, boolean, integer) to service_role;
grant execute on function public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text) to service_role;
grant execute on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text, text, text) to service_role;
