-- Postcard credits, signup grant, pending SELECT for realtime, poller world_labs_id.
-- Do not rewrite 20260906120000 / 20260906153000. Paste into Supabase SQL editor after those.

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value_int) values
  ('free_gen_coins', 2),
  ('refill_capacity', 0)
on conflict (key) do update set value_int = excluded.value_int, updated_at = now();

alter table public.ip_quotas drop constraint if exists ip_quotas_capacity_check;
alter table public.ip_quotas add constraint ip_quotas_capacity_check check (capacity >= 0);

-- ---------------------------------------------------------------------------
-- Realtime: pending public rows must be selectable or postgres_changes never fires.
-- Explore API still filters status = complete.
-- ---------------------------------------------------------------------------
drop policy if exists worlds_select_visible on public.worlds;
create policy worlds_select_visible on public.worlds
  for select to anon, authenticated
  using (
    (is_public = true and status in ('complete', 'pending'))
    or user_id = auth.uid()
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'worlds'
    ) then
      execute 'alter publication supabase_realtime add table public.worlds';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Signup: 2 postcard coins (handle_new_user currently skipped grant_signup_coins)
-- ---------------------------------------------------------------------------
create or replace function public.grant_signup_coins(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer;
  v_balance integer;
begin
  if p_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_amount := coalesce(public.config_int('free_gen_coins'), 2);

  select balance into v_balance from public.wallets where user_id = p_user_id for update;

  if exists (
    select 1 from public.credit_ledger
    where user_id = p_user_id and reason = 'signup_grant'
  ) then
    return coalesce(v_balance, 0);
  end if;

  if v_balance is null then
    insert into public.wallets (user_id, balance) values (p_user_id, 0);
    v_balance := 0;
  end if;

  v_balance := v_balance + v_amount;
  update public.wallets set balance = v_balance where user_id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, balance_after, metadata)
  values (
    p_user_id,
    v_amount,
    'signup_grant',
    v_balance,
    jsonb_build_object('source', 'signup')
  );

  return v_balance;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  perform public.grant_signup_coins(new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Credits: wallet-only postcard consume. Anon status is 0. No IP spend.
-- ---------------------------------------------------------------------------
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
  v_paid integer := 0;
  v_min_ms integer;
  v_amount integer := coalesce(p_amount, 1);
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_min_ms := coalesce(public.config_int('consume_min_interval_ms'), 2000);

  if v_uid is not null then
    select balance into v_paid from public.wallets where user_id = v_uid for update;
    if v_paid is null then
      insert into public.wallets (user_id, balance) values (v_uid, 0);
      v_paid := 0;
    end if;
  end if;

  if not p_consume then
    if v_uid is null then
      return query select
        true, 0, 0, 0, now(), 0, 'none'::text, null::text;
      return;
    end if;
    return query select
      true, v_paid, v_paid, 0, now(), 0, 'wallet'::text, null::text;
    return;
  end if;

  if v_uid is null then
    return query select
      false, 0, 0, 0, now(), 0, 'none'::text, 'not_authenticated'::text;
    return;
  end if;

  if v_amount <> 1 then
    return query select
      false, v_paid, v_paid, 0, now(), 0, 'wallet'::text, 'invalid_amount'::text;
    return;
  end if;

  if exists (
    select 1 from public.credit_ledger
    where user_id = v_uid
      and reason = 'postcard_download'
      and created_at > now() - (v_min_ms::text || ' milliseconds')::interval
  ) then
    return query select
      false, v_paid, v_paid, 0, now(), 0, 'wallet'::text, 'rate_limited'::text;
    return;
  end if;

  if v_paid < v_amount then
    return query select
      false, v_paid, v_paid, 0, now(), 0, 'wallet'::text, 'insufficient_coins'::text;
    return;
  end if;

  v_paid := v_paid - v_amount;
  update public.wallets set balance = v_paid where user_id = v_uid;
  insert into public.credit_ledger (user_id, delta, reason, balance_after)
  values (v_uid, -v_amount, 'postcard_download', v_paid);

  return query select
    true, v_paid, v_paid, 0, now(), 0, 'wallet'::text, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Poller: store real Marble id while pending; never keep splat on pano complete.
-- ---------------------------------------------------------------------------
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
        world_labs_id = case
          when v_world_id is not null and v_world_id not like 'pending:%' then v_world_id
          else world_labs_id
        end,
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
      splat_url = case
        when v_row.generation_mode = 'pano' then null
        else coalesce(v_splat, splat_url)
      end,
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
