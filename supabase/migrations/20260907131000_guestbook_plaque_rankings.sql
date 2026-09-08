-- Guestbook, founder plaque, visits, rankings, and browser-callable world/payment RPCs.
-- Requires 20260907130000_guestbook_plaque_ledger_enum.sql (enum values).
-- Paste after that file. Clients use the publishable key + JWT; writes go through DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists github_username text;

alter table public.worlds
  add column if not exists discovered_by text;

alter table public.worlds
  add column if not exists plaque_at timestamptz;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.world_signatures (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  github_username text not null,
  message text not null check (char_length(message) between 1 and 280),
  signature_png text not null check (
    char_length(signature_png) <= 60000
    and signature_png like 'data:image/%'
  ),
  created_at timestamptz not null default now(),
  unique (world_id, user_id)
);

create index if not exists world_signatures_world_created_idx
  on public.world_signatures (world_id, created_at desc);

create table if not exists public.world_visits (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  visitor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists world_visits_world_created_idx
  on public.world_visits (world_id, created_at desc);

create unique index if not exists world_visits_auth_daily_idx
  on public.world_visits (
    world_id,
    visitor_id,
    ((timezone('utc', created_at))::date)
  )
  where visitor_id is not null;

create table if not exists public.world_ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  visit_count integer not null default 0 check (visit_count >= 0),
  signature_count integer not null default 0 check (signature_count >= 0),
  rank_visits integer not null check (rank_visits >= 1),
  rank_populated integer not null check (rank_populated >= 1),
  snapshot_at timestamptz not null default now(),
  is_stale boolean not null default false
);

create index if not exists world_ranking_snapshots_live_idx
  on public.world_ranking_snapshots (is_stale, rank_visits, rank_populated)
  where is_stale = false;

create index if not exists world_ranking_snapshots_at_idx
  on public.world_ranking_snapshots (snapshot_at desc);

-- ---------------------------------------------------------------------------
-- GitHub username from OAuth metadata
-- ---------------------------------------------------------------------------
create or replace function public.github_username_from_meta(p_meta jsonb)
returns text
language sql
immutable
as $$
  select nullif(
    trim(coalesce(
      nullif(p_meta->>'user_name', ''),
      nullif(p_meta->>'preferred_username', ''),
      nullif(p_meta->>'login', ''),
      ''
    )),
    ''
  );
$$;

create or replace function public.resolve_github_username(p_uid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select nullif(trim(p.github_username), '')
  into v_name
  from public.profiles p
  where p.id = p_uid;

  if v_name is not null then
    return v_name;
  end if;

  select public.github_username_from_meta(u.raw_user_meta_data)
  into v_name
  from auth.users u
  where u.id = p_uid;

  if v_name is not null then
    update public.profiles
    set github_username = v_name, updated_at = now()
    where id = p_uid and coalesce(nullif(trim(github_username), ''), '') = '';
  end if;

  return v_name;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := public.github_username_from_meta(new.raw_user_meta_data);
begin
  insert into public.profiles (id, email, github_username)
  values (new.id, coalesce(new.email, ''), v_name)
  on conflict (id) do update set
    email = excluded.email,
    github_username = coalesce(public.profiles.github_username, excluded.github_username);

  insert into public.wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  perform public.grant_signup_coins(new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- protect_world_row: plaque fields are RPC-only
-- ---------------------------------------------------------------------------
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
     or new.created_at is distinct from old.created_at
     or new.discovered_by is distinct from old.discovered_by
     or new.plaque_at is distinct from old.plaque_at then
    raise exception 'world_fields_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wallet debit used by guestbook + plaque (1 coin)
-- ---------------------------------------------------------------------------
create or replace function public.debit_wallet_coin(p_uid uuid, p_reason public.ledger_reason)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  update public.wallets w
  set balance = w.balance - 1
  where w.user_id = p_uid and w.balance > 0
  returning w.balance into v_balance;

  if v_balance is null then
    return null;
  end if;

  insert into public.credit_ledger (user_id, delta, reason, balance_after)
  values (p_uid, -1, p_reason, v_balance);

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- Browser payment create: pack size computed in SQL
-- ---------------------------------------------------------------------------
create or replace function public.create_my_payment(
  p_pack_id text,
  p_custom_cents integer default null
)
returns table (
  reference text,
  amount integer,
  coins integer,
  pack_id text,
  email text,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pack_id text := coalesce(nullif(trim(p_pack_id), ''), 'p10');
  v_amount integer;
  v_coins integer;
  v_email text;
  v_ref text;
  v_min integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select coalesce(nullif(trim(p.email), ''), u.email)
  into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = v_uid;

  if v_email is null or length(trim(v_email)) = 0 then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_pack_id = 'custom' then
    select public.config_int('custom_min_usd_cents') into v_min;
    if p_custom_cents is null or p_custom_cents < coalesce(v_min, 500) then
      raise exception 'invalid_amount' using errcode = '22023';
    end if;
    if p_custom_cents % 100 <> 0 then
      raise exception 'invalid_amount' using errcode = '22023';
    end if;
    v_amount := p_custom_cents;
    v_coins := public.coins_for_usd_cents(v_amount);
  else
    select cp.usd_cents, cp.coins
    into v_amount, v_coins
    from public.coin_packs cp
    where cp.id = v_pack_id;
    if v_amount is null then
      raise exception 'unknown_pack' using errcode = '22023';
    end if;
  end if;

  v_ref := 'csy_'
    || replace(v_uid::text, '-', '')
    || '_'
    || replace(gen_random_uuid()::text, '-', '');

  insert into public.payments (
    user_id, reference, access_code, amount, currency, pack_id, pack_size, status
  ) values (
    v_uid, v_ref, null, v_amount, 'USD', v_pack_id, v_coins, 'pending'
  );

  return query select v_ref, v_amount, v_coins, v_pack_id, v_email, 'USD'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guestbook + plaque
-- ---------------------------------------------------------------------------
create or replace function public.sign_guestbook(
  p_world_id uuid,
  p_signature text,
  p_message text
)
returns table (
  ok boolean,
  balance integer,
  error text,
  already_signed boolean,
  github_username text,
  message text,
  signature_png text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_world public.worlds%rowtype;
  v_name text;
  v_msg text;
  v_sig text;
  v_balance integer;
  v_existing public.world_signatures%rowtype;
begin
  if v_uid is null then
    return query select false, 0, 'not_authenticated'::text, false, null::text, null::text, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(
    ('x' || substr(md5(p_world_id::text || v_uid::text), 1, 16))::bit(64)::bigint
  );

  v_msg := trim(coalesce(p_message, ''));
  v_sig := coalesce(p_signature, '');
  if char_length(v_msg) < 1 or char_length(v_msg) > 280 then
    return query select false, 0, 'invalid_message'::text, false, null::text, null::text, null::text;
    return;
  end if;
  if char_length(v_sig) < 32 or char_length(v_sig) > 60000 or v_sig not like 'data:image/%' then
    return query select false, 0, 'invalid_signature'::text, false, null::text, null::text, null::text;
    return;
  end if;

  select * into v_world from public.worlds where id = p_world_id;
  if not found or v_world.status <> 'complete' then
    return query select false, 0, 'world_not_ready'::text, false, null::text, null::text, null::text;
    return;
  end if;

  select * into v_existing
  from public.world_signatures
  where world_id = p_world_id and user_id = v_uid;
  if found then
    select w.balance into v_balance from public.wallets w where w.user_id = v_uid;
    return query select
      true,
      coalesce(v_balance, 0),
      null::text,
      true,
      v_existing.github_username,
      v_existing.message,
      v_existing.signature_png;
    return;
  end if;

  v_name := public.resolve_github_username(v_uid);
  if v_name is null then
    return query select false, 0, 'github_username_required'::text, false, null::text, null::text, null::text;
    return;
  end if;

  v_balance := public.debit_wallet_coin(v_uid, 'guestbook_sign');
  if v_balance is null then
    select w.balance into v_balance from public.wallets w where w.user_id = v_uid;
    return query select false, coalesce(v_balance, 0), 'insufficient_coins'::text, false, null::text, null::text, null::text;
    return;
  end if;

  insert into public.world_signatures (
    world_id, user_id, github_username, message, signature_png
  ) values (
    p_world_id, v_uid, v_name, v_msg, v_sig
  );

  return query select true, v_balance, null::text, false, v_name, v_msg, v_sig;
exception
  when unique_violation then
    select * into v_existing
    from public.world_signatures
    where world_id = p_world_id and user_id = v_uid;
    select w.balance into v_balance from public.wallets w where w.user_id = v_uid;
    return query select
      true,
      coalesce(v_balance, 0),
      null::text,
      true,
      v_existing.github_username,
      v_existing.message,
      v_existing.signature_png;
end;
$$;

create or replace function public.buy_founder_plaque(p_world_id uuid)
returns table (
  ok boolean,
  balance integer,
  error text,
  discovered_by text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_world public.worlds%rowtype;
  v_name text;
  v_balance integer;
begin
  if v_uid is null then
    return query select false, 0, 'not_authenticated'::text, null::text;
    return;
  end if;

  perform set_config('codessey.rpc_world_write', 'on', true);

  select * into v_world from public.worlds where id = p_world_id for update;
  if not found then
    return query select false, 0, 'world_not_found'::text, null::text;
    return;
  end if;
  if v_world.user_id is distinct from v_uid then
    return query select false, 0, 'not_owner'::text, null::text;
    return;
  end if;
  if v_world.status <> 'complete' then
    return query select false, 0, 'world_not_ready'::text, null::text;
    return;
  end if;
  if v_world.discovered_by is not null then
    select w.balance into v_balance from public.wallets w where w.user_id = v_uid;
    return query select true, coalesce(v_balance, 0), 'already_plated'::text, v_world.discovered_by;
    return;
  end if;

  v_name := public.resolve_github_username(v_uid);
  if v_name is null then
    return query select false, 0, 'github_username_required'::text, null::text;
    return;
  end if;

  v_balance := public.debit_wallet_coin(v_uid, 'founder_plaque');
  if v_balance is null then
    select w.balance into v_balance from public.wallets w where w.user_id = v_uid;
    return query select false, coalesce(v_balance, 0), 'insufficient_coins'::text, null::text;
    return;
  end if;

  update public.worlds
  set discovered_by = v_name, plaque_at = now(), updated_at = now()
  where id = p_world_id;

  return query select true, v_balance, null::text, v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visits + rankings
-- ---------------------------------------------------------------------------
create or replace function public.record_world_visit(p_world_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.worlds where id = p_world_id) then
    return;
  end if;

  insert into public.world_visits (world_id, visitor_id)
  values (p_world_id, v_uid)
  on conflict do nothing;
end;
$$;

create or replace function public.snapshot_world_rankings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest timestamptz;
begin
  perform pg_advisory_xact_lock(87201401);

  select max(snapshot_at) into v_latest
  from public.world_ranking_snapshots
  where is_stale = false;

  if v_latest is not null and v_latest > now() - interval '24 hours' then
    return;
  end if;

  update public.world_ranking_snapshots
  set is_stale = true
  where is_stale = false;

  insert into public.world_ranking_snapshots (
    world_id, visit_count, signature_count, rank_visits, rank_populated, snapshot_at, is_stale
  )
  select
    e.world_id,
    e.visit_count,
    e.signature_count,
    dense_rank() over (order by e.visit_count desc, e.world_id)::integer,
    dense_rank() over (order by e.signature_count desc, e.world_id)::integer,
    now(),
    false
  from (
    select
      w.id as world_id,
      coalesce(v.visit_count, 0)::integer as visit_count,
      coalesce(s.signature_count, 0)::integer as signature_count
    from public.worlds w
    left join (
      select world_id, count(*)::integer as visit_count
      from public.world_visits
      where created_at >= now() - interval '24 hours'
      group by world_id
    ) v on v.world_id = w.id
    left join (
      select world_id, count(*)::integer as signature_count
      from public.world_signatures
      group by world_id
    ) s on s.world_id = w.id
    where w.is_public = true
      and w.status = 'complete'
  ) e;
end;
$$;

-- ---------------------------------------------------------------------------
-- World RPCs: callable with publishable key; writes bound to auth.uid()
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

  v_uid := coalesce(
    auth.uid(),
    case when public.is_service_role() then p_user_id else null end
  );
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
  perform set_config('codessey.rpc_world_write', 'on', true);

  select * into v_row from public.worlds where id = p_world_id for update;
  if not found then
    raise exception 'world_not_found' using errcode = 'P0002';
  end if;

  if not public.is_service_role() then
    if v_row.user_id is not null and v_row.user_id is distinct from auth.uid() then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.world_signatures enable row level security;
alter table public.world_visits enable row level security;
alter table public.world_ranking_snapshots enable row level security;

drop policy if exists world_signatures_select_visible on public.world_signatures;
create policy world_signatures_select_visible on public.world_signatures
  for select to anon, authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.worlds w
      where w.id = world_signatures.world_id
        and (
          (w.is_public = true and w.status = 'complete')
          or w.user_id = auth.uid()
        )
    )
  );

drop policy if exists world_ranking_snapshots_select_all on public.world_ranking_snapshots;
create policy world_ranking_snapshots_select_all on public.world_ranking_snapshots
  for select to anon, authenticated
  using (true);

-- world_visits: no client policies (deny). Inserts via record_world_visit.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.world_signatures from public, anon, authenticated;
revoke all on public.world_visits from public, anon, authenticated;
revoke all on public.world_ranking_snapshots from public, anon, authenticated;

grant select on public.world_signatures to anon, authenticated;
grant select on public.world_ranking_snapshots to anon, authenticated;

grant all on public.world_signatures to postgres, service_role;
grant all on public.world_visits to postgres, service_role;
grant all on public.world_ranking_snapshots to postgres, service_role;

revoke all on function public.github_username_from_meta(jsonb) from public, anon, authenticated;
revoke all on function public.resolve_github_username(uuid) from public, anon, authenticated;
revoke all on function public.debit_wallet_coin(uuid, public.ledger_reason) from public, anon, authenticated;
revoke all on function public.create_my_payment(text, integer) from public, anon, authenticated;
revoke all on function public.sign_guestbook(uuid, text, text) from public, anon, authenticated;
revoke all on function public.buy_founder_plaque(uuid) from public, anon, authenticated;
revoke all on function public.record_world_visit(uuid) from public, anon, authenticated;
revoke all on function public.snapshot_world_rankings() from public, anon, authenticated;
revoke all on function public.lookup_world_by_repo_url(text) from public, anon, authenticated;
revoke all on function public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.create_my_payment(text, integer) to authenticated;
grant execute on function public.sign_guestbook(uuid, text, text) to authenticated;
grant execute on function public.buy_founder_plaque(uuid) to authenticated;
grant execute on function public.record_world_visit(uuid) to anon, authenticated;
grant execute on function public.snapshot_world_rankings() to anon, authenticated;
grant execute on function public.lookup_world_by_repo_url(text) to anon, authenticated, service_role;
grant execute on function public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text) to anon, authenticated, service_role;
grant execute on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.get_my_wallet() to authenticated;

grant execute on function public.debit_wallet_coin(uuid, public.ledger_reason) to service_role;
grant execute on function public.create_my_payment(text, integer) to service_role;
grant execute on function public.sign_guestbook(uuid, text, text) to service_role;
grant execute on function public.buy_founder_plaque(uuid) to service_role;
grant execute on function public.record_world_visit(uuid) to service_role;
grant execute on function public.snapshot_world_rankings() to service_role;
