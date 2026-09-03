-- Codessey full schema
-- Paste this entire file into the Supabase SQL editor to initialize a new project.
-- Idempotent: CREATE IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING.
-- The SELECT blocks at the bottom are mapping checks (read-only).

-- Codessey credits schema
-- Source of truth for coins. Paystack only collects money; balances never live in Paystack metadata.
-- Frontend uses the anon key + user JWT. Money mutations go through SECURITY DEFINER RPCs that
-- bind user_id to auth.uid() (or service_role for webhooks). Direct wallet/ledger writes are denied.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.ledger_reason as enum ('signup_grant', 'pack_purchase', 'generate');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'success', 'failed', 'abandoned');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Config + public catalog (readable with anon key)
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  key text primary key,
  value_int integer not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value_int) values
  ('free_gen_coins', 3),
  ('custom_min_usd_cents', 500),
  ('custom_cents_per_coin', 100)
on conflict (key) do nothing;

-- Preset packs the purchase UI reads with the public key.
create table if not exists public.coin_packs (
  id text primary key,
  label text not null,
  usd_cents integer not null check (usd_cents > 0),
  coins integer not null check (coins > 0),
  sort_order integer not null,
  accent text not null
);

insert into public.coin_packs (id, label, usd_cents, coins, sort_order, accent) values
  ('p10', '$5', 500, 10, 1, 'amber'),
  ('p20', '$10', 1000, 20, 2, 'emerald'),
  ('p40', '$20', 2000, 40, 3, 'violet')
on conflict (id) do update set
  label = excluded.label,
  usd_cents = excluded.usd_cents,
  coins = excluded.coins,
  sort_order = excluded.sort_order,
  accent = excluded.accent;

-- ---------------------------------------------------------------------------
-- User-scoped tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reference text not null unique,
  access_code text,
  amount integer not null check (amount > 0),
  currency text not null default 'USD',
  pack_id text not null,
  pack_size integer not null check (pack_size > 0),
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  paystack_transaction_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason public.ledger_reason not null,
  balance_after integer not null check (balance_after >= 0),
  payment_id uuid references public.payments (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.paystack_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  reference text,
  signature_valid boolean not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);
create index if not exists credit_ledger_reason_idx
  on public.credit_ledger (reason);
create unique index if not exists credit_ledger_one_signup_grant_idx
  on public.credit_ledger (user_id) where reason = 'signup_grant';
create unique index if not exists credit_ledger_one_pack_per_payment_idx
  on public.credit_ledger (payment_id) where reason = 'pack_purchase' and payment_id is not null;

create index if not exists payments_user_created_idx
  on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx
  on public.payments (status);

create unique index if not exists paystack_events_event_reference_idx
  on public.paystack_events (event, reference);
create index if not exists paystack_events_reference_idx
  on public.paystack_events (reference);
create index if not exists paystack_events_created_idx
  on public.paystack_events (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.config_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select value_int from public.app_config where key = p_key;
$$;

-- Derive coins from paid cents. Never trust a client-supplied pack_size.
create or replace function public.coins_for_usd_cents(p_cents integer)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_coins integer;
  v_min integer;
  v_per integer;
begin
  if p_cents is null or p_cents <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select coins into v_coins from public.coin_packs where usd_cents = p_cents;
  if v_coins is not null then
    return v_coins;
  end if;

  v_min := coalesce(public.config_int('custom_min_usd_cents'), 500);
  v_per := coalesce(public.config_int('custom_cents_per_coin'), 100);

  if p_cents < v_min then
    raise exception 'amount_below_minimum' using errcode = '22023';
  end if;
  if p_cents % v_per <> 0 then
    raise exception 'amount_not_aligned' using errcode = '22023';
  end if;

  return p_cents / v_per;
end;
$$;

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- RPCs
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

  v_amount := coalesce(public.config_int('free_gen_coins'), 3);

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

create or replace function public.consume_coin()
returns table (ok boolean, balance integer, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
begin
  if v_uid is null then
    return query select false, 0, 'not_authenticated';
    return;
  end if;

  update public.wallets
  set balance = balance - 1
  where user_id = v_uid and balance > 0
  returning wallets.balance into v_balance;

  if v_balance is null then
    select w.balance into v_balance from public.wallets w where w.user_id = v_uid;
    return query select false, coalesce(v_balance, 0), 'insufficient_coins';
    return;
  end if;

  insert into public.credit_ledger (user_id, delta, reason, balance_after)
  values (v_uid, -1, 'generate', v_balance);

  return query select true, v_balance, null::text;
end;
$$;

create or replace function public.create_payment(
  p_reference text,
  p_amount integer,
  p_currency text,
  p_pack_id text,
  p_access_code text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_coins integer;
  v_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    if public.is_service_role() and p_user_id is not null then
      v_uid := p_user_id;
    else
      raise exception 'not_authenticated' using errcode = '28000';
    end if;
  end if;

  if p_reference is null or length(trim(p_reference)) = 0 then
    raise exception 'invalid_reference' using errcode = '22023';
  end if;

  v_coins := public.coins_for_usd_cents(p_amount);

  insert into public.payments (
    user_id, reference, access_code, amount, currency, pack_id, pack_size, status
  ) values (
    v_uid, trim(p_reference), p_access_code, p_amount, coalesce(p_currency, 'USD'),
    coalesce(p_pack_id, 'custom'), v_coins, 'pending'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.credit_pack(
  p_reference text,
  p_paystack_transaction_id bigint default null,
  p_paid_amount integer default null
)
returns table (credited boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_balance integer;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments
  where reference = p_reference
  for update;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  if v_payment.status = 'success' then
    select w.balance into v_balance from public.wallets w where w.user_id = v_payment.user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  if v_payment.status in ('failed', 'abandoned') then
    raise exception 'payment_not_creditable' using errcode = '22023';
  end if;

  -- Paid amount from Paystack must match the row we created (blocks pack_size spoofing).
  if p_paid_amount is not null and p_paid_amount <> v_payment.amount then
    raise exception 'amount_mismatch' using errcode = '22023';
  end if;

  select w.balance into v_balance from public.wallets w where w.user_id = v_payment.user_id for update;
  if v_balance is null then
    insert into public.wallets (user_id, balance) values (v_payment.user_id, 0);
    v_balance := 0;
  end if;

  v_balance := v_balance + v_payment.pack_size;

  update public.wallets set balance = v_balance where user_id = v_payment.user_id;

  update public.payments
  set
    status = 'success',
    paid_at = now(),
    paystack_transaction_id = coalesce(p_paystack_transaction_id, paystack_transaction_id)
  where id = v_payment.id;

  insert into public.credit_ledger (user_id, delta, reason, balance_after, payment_id, metadata)
  values (
    v_payment.user_id,
    v_payment.pack_size,
    'pack_purchase',
    v_balance,
    v_payment.id,
    jsonb_build_object('reference', p_reference)
  );

  return query select true, v_balance;
end;
$$;

create or replace function public.fail_payment(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_role() and auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.payments
  set status = 'failed'
  where reference = p_reference
    and status = 'pending'
    and (
      public.is_service_role()
      or user_id = auth.uid()
    );
end;
$$;

create or replace function public.get_my_wallet()
returns table (balance integer, email text)
language sql
stable
security definer
set search_path = public
as $$
  select w.balance, p.email
  from public.wallets w
  join public.profiles p on p.id = w.user_id
  where w.user_id = auth.uid();
$$;

create or replace function public.record_paystack_event(
  p_event text,
  p_reference text,
  p_signature_valid boolean,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.paystack_events (event, reference, signature_valid, payload)
  values (p_event, p_reference, p_signature_valid, p_payload)
  on conflict (event, reference)
  do update set payload = excluded.payload
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.paystack_events
    where event = p_event and reference = p_reference;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth signup bootstrap
-- ---------------------------------------------------------------------------
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_config enable row level security;
alter table public.coin_packs enable row level security;
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.payments enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.paystack_events enable row level security;

-- Catalog: anyone can read prices/config (needed for the purchase UI with the anon key).
drop policy if exists app_config_select_all on public.app_config;
create policy app_config_select_all on public.app_config
  for select to anon, authenticated
  using (true);

drop policy if exists coin_packs_select_all on public.coin_packs;
create policy coin_packs_select_all on public.coin_packs
  for select to anon, authenticated
  using (true);

-- Profiles: read own row only. Email is written by the signup trigger, not the client.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;

-- Wallets: read own balance. Writes only via RPCs (table grants revoked below).
drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets
  for select to authenticated
  using (user_id = auth.uid());

-- Ledger: read own history. No client inserts.
drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated
  using (user_id = auth.uid());

-- Payments: read own checkouts. Inserts go through create_payment().
drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (user_id = auth.uid());

-- Webhook inbox: no client access (no policies for anon/authenticated).

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.app_config from anon, authenticated;
revoke all on public.coin_packs from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.wallets from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.credit_ledger from anon, authenticated;
revoke all on public.paystack_events from anon, authenticated;

grant select on public.app_config to anon, authenticated;
grant select on public.coin_packs to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.wallets to authenticated;
grant select on public.payments to authenticated;
grant select on public.credit_ledger to authenticated;

revoke all on function public.grant_signup_coins(uuid) from public, anon, authenticated;
revoke all on function public.create_payment(text, integer, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_pack(text, bigint, integer) from public, anon, authenticated;
revoke all on function public.record_paystack_event(text, text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.config_int(text) from public, anon, authenticated;
revoke all on function public.coins_for_usd_cents(integer) from public, anon;
revoke all on function public.is_service_role() from public, anon, authenticated;

-- Browser (anon key + user JWT): spend, read wallet, cancel own pending checkout, preview custom coins.
grant execute on function public.consume_coin() to authenticated;
grant execute on function public.fail_payment(text) to authenticated;
grant execute on function public.get_my_wallet() to authenticated;
grant execute on function public.coins_for_usd_cents(integer) to authenticated;

-- Server (service role): initialize/verify/webhook + signup grant.
grant execute on function public.grant_signup_coins(uuid) to service_role;
grant execute on function public.create_payment(text, integer, text, text, text, uuid) to service_role;
grant execute on function public.credit_pack(text, bigint, integer) to service_role;
grant execute on function public.fail_payment(text) to service_role;
grant execute on function public.record_paystack_event(text, text, boolean, jsonb) to service_role;
grant execute on function public.coins_for_usd_cents(integer) to service_role;

-- 12h leaky-bucket free quota (IP-hashed), signed-in paid wallets, and persisted worlds.
-- Raw IPs never stored. Free quota is shared per IP hash so extra accounts cannot mint more gens.

-- ---------------------------------------------------------------------------
-- Config knobs
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value_int) values
  ('refill_interval_seconds', 43200), -- 12 hours
  ('refill_capacity', 3),
  ('ip_max_accounts', 3),
  ('consume_min_interval_ms', 2000)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Wallets: paid coins only. Free gens live on ip_quotas.
-- last_refill_at kept for signed-in display alignment; IP bucket is source of free tokens.
-- ---------------------------------------------------------------------------
alter table public.wallets
  add column if not exists last_refill_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- IP quota (leaky bucket). ip_hash = sha256(pepper || ip) computed on the server.
-- ---------------------------------------------------------------------------
create table if not exists public.ip_quotas (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  tokens double precision not null default 0 check (tokens >= 0),
  capacity integer not null default 3 check (capacity > 0),
  last_refill_at timestamptz not null default now(),
  last_consume_at timestamptz,
  consume_count integer not null default 0 check (consume_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ip_identities (
  ip_hash text not null references public.ip_quotas (ip_hash) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ip_hash, user_id)
);

create unique index if not exists ip_identities_user_idx on public.ip_identities (user_id);

create table if not exists public.ip_quota_events (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null references public.ip_quotas (ip_hash) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  delta double precision not null,
  reason text not null,
  tokens_after double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists ip_quota_events_hash_created_idx
  on public.ip_quota_events (ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Worlds (community board). No IP column on this table — never leak identifiers.
-- ---------------------------------------------------------------------------
create table if not exists public.worlds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  repo_url text not null,
  branch text not null default 'main',
  repo_name text,
  world_labs_id text not null,
  operation_id text unique,
  status text not null default 'complete'
    check (status in ('pending', 'complete', 'failed')),
  progress text,
  poll_locked_until timestamptz,
  splat_url text,
  thumbnail_url text,
  caption text,
  marble_url text,
  pano_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worlds_public_created_idx
  on public.worlds (created_at desc) where is_public = true;
create index if not exists worlds_user_created_idx
  on public.worlds (user_id, created_at desc);
create unique index if not exists worlds_labs_id_idx on public.worlds (world_labs_id);
create index if not exists worlds_pending_latest_idx
  on public.worlds (created_at desc)
  where status = 'pending';

drop trigger if exists worlds_set_updated_at on public.worlds;
create trigger worlds_set_updated_at
  before update on public.worlds
  for each row execute function public.set_updated_at();

drop trigger if exists ip_quotas_set_updated_at on public.ip_quotas;
create trigger ip_quotas_set_updated_at
  before update on public.ip_quotas
  for each row execute function public.set_updated_at();

-- Owners may only flip is_public. Identity and asset URLs stay RPC/service-owned.
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
     or new.branch is distinct from old.branch
     or new.marble_url is distinct from old.marble_url then
    raise exception 'world_fields_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists worlds_protect_row on public.worlds;
create trigger worlds_protect_row
  before update on public.worlds
  for each row execute function public.protect_world_row();

-- ---------------------------------------------------------------------------
-- Leaky bucket: tokens refill linearly to capacity over refill_interval_seconds.
-- ---------------------------------------------------------------------------
create or replace function public.refill_ip_quota(p_hash text)
returns public.ip_quotas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ip_quotas%rowtype;
  v_capacity integer;
  v_interval integer;
  v_elapsed double precision;
  v_rate double precision;
  v_before double precision;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_ip_hash' using errcode = '22023';
  end if;

  v_capacity := coalesce(public.config_int('refill_capacity'), 3);
  v_interval := greatest(coalesce(public.config_int('refill_interval_seconds'), 43200), 1);

  insert into public.ip_quotas (ip_hash, tokens, capacity, last_refill_at)
  values (p_hash, v_capacity, v_capacity, now())
  on conflict (ip_hash) do nothing;

  select * into v_row from public.ip_quotas where ip_hash = p_hash for update;

  v_before := v_row.tokens;
  v_elapsed := extract(epoch from (now() - v_row.last_refill_at));
  v_rate := v_row.capacity::double precision / v_interval::double precision;
  v_row.tokens := least(v_row.capacity::double precision, v_row.tokens + v_elapsed * v_rate);
  v_row.last_refill_at := now();
  v_row.capacity := v_capacity;

  update public.ip_quotas
  set tokens = v_row.tokens,
      last_refill_at = v_row.last_refill_at,
      capacity = v_row.capacity
  where ip_hash = p_hash;

  if v_row.tokens - v_before > 0.0001 then
    insert into public.ip_quota_events (ip_hash, delta, reason, tokens_after)
    values (p_hash, v_row.tokens - v_before, 'refill', v_row.tokens);
  end if;

  return v_row;
end;
$$;

create or replace function public.seconds_until_free_token(p_tokens double precision, p_capacity integer)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_interval integer;
  v_rate double precision;
  v_need double precision;
begin
  if p_tokens >= 1 then
    return 0;
  end if;
  v_interval := greatest(coalesce(public.config_int('refill_interval_seconds'), 43200), 1);
  v_rate := greatest(p_capacity, 1)::double precision / v_interval::double precision;
  v_need := 1.0 - greatest(p_tokens, 0);
  return ceil(v_need / v_rate)::integer;
end;
$$;

-- Service-role only. Next.js hashes the IP; the client never supplies it.
create or replace function public.tick_credits(
  p_ip_hash text,
  p_consume boolean default false
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
  v_uid uuid := auth.uid();
  v_quota public.ip_quotas%rowtype;
  v_paid integer := 0;
  v_free integer := 0;
  v_wait integer := 0;
  v_min_ms integer;
  v_interval integer;
  v_linked integer := 0;
  v_max_accounts integer;
begin
  if not public.is_service_role() then
    return query select false, 0, 0, 0, now(), 0, 'none'::text, 'not_authorized'::text;
    return;
  end if;

  -- When called with the user JWT *and* service role we still want auth.uid().
  -- Service client has no user; pass-through: auth.uid() may be null. Callers that
  -- have a user should set request.jwt via the user-scoped client, or pass nothing
  -- and we read current_setting. We accept uid from auth.uid() only.
  v_quota := public.refill_ip_quota(p_ip_hash);
  v_interval := greatest(coalesce(public.config_int('refill_interval_seconds'), 43200), 1);
  v_max_accounts := coalesce(public.config_int('ip_max_accounts'), 3);
  v_min_ms := coalesce(public.config_int('consume_min_interval_ms'), 2000);

  if v_uid is not null then
    select balance into v_paid from public.wallets where user_id = v_uid for update;
    if v_paid is null then
      insert into public.wallets (user_id, balance) values (v_uid, 0);
      v_paid := 0;
    end if;

    select count(*) into v_linked from public.ip_identities where ip_hash = p_ip_hash;

    insert into public.ip_identities (ip_hash, user_id)
    values (p_ip_hash, v_uid)
    on conflict (user_id) do nothing;

    -- Extra accounts on this IP share the bucket (no new free pool).
    if v_linked >= v_max_accounts and not exists (
      select 1 from public.ip_identities where ip_hash = p_ip_hash and user_id = v_uid
    ) then
      null; -- identity insert may have been skipped by unique user_id; bucket still shared
    end if;
  else
    v_paid := 0;
  end if;

  v_free := floor(v_quota.tokens)::integer;
  v_wait := public.seconds_until_free_token(v_quota.tokens, v_quota.capacity);

  if not p_consume then
    return query select
      true,
      v_paid + v_free,
      v_paid,
      v_free,
      now() + make_interval(secs => v_wait),
      v_wait,
      case when v_paid > 0 then 'wallet' else 'ip' end,
      null::text;
    return;
  end if;

  if v_quota.last_consume_at is not null
     and extract(epoch from (now() - v_quota.last_consume_at)) * 1000 < v_min_ms then
    return query select
      false, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait, 'ip'::text, 'rate_limited'::text;
    return;
  end if;

  -- Spend paid coins first so purchasers skip the free queue.
  if v_uid is not null and v_paid > 0 then
    v_paid := v_paid - 1;
    update public.wallets set balance = v_paid where user_id = v_uid;
    insert into public.credit_ledger (user_id, delta, reason, balance_after)
    values (v_uid, -1, 'generate', v_paid);
    update public.ip_quotas set last_consume_at = now(), consume_count = consume_count + 1
    where ip_hash = p_ip_hash;

    v_free := floor((select tokens from public.ip_quotas where ip_hash = p_ip_hash))::integer;
    v_wait := public.seconds_until_free_token(
      (select tokens from public.ip_quotas where ip_hash = p_ip_hash),
      v_quota.capacity
    );
    return query select
      true, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait, 'wallet'::text, null::text;
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
  set tokens = v_quota.tokens,
      last_consume_at = now(),
      consume_count = consume_count + 1
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

-- Overload that binds a user id for service-role callers (initialize has a session).
create or replace function public.tick_credits_for_user(
  p_ip_hash text,
  p_user_id uuid,
  p_consume boolean default false
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
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Temporarily impersonate by setting a local claim is not available; inline by
  -- calling the same logic with p_user_id. Duplicate the consume path using p_user_id.
  return query
  select * from public.tick_credits_as(p_ip_hash, p_user_id, p_consume);
end;
$$;

create or replace function public.tick_credits_as(
  p_ip_hash text,
  p_user_id uuid,
  p_consume boolean
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

  if v_quota.last_consume_at is not null
     and extract(epoch from (now() - v_quota.last_consume_at)) * 1000 < v_min_ms then
    return query select
      false, v_paid + v_free, v_paid, v_free,
      now() + make_interval(secs => v_wait), v_wait, 'ip'::text, 'rate_limited'::text;
    return;
  end if;

  if v_uid is not null and v_paid > 0 then
    v_paid := v_paid - 1;
    update public.wallets set balance = v_paid where user_id = v_uid;
    insert into public.credit_ledger (user_id, delta, reason, balance_after)
    values (v_uid, -1, 'generate', v_paid);
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

create or replace function public.publish_world(
  p_repo_url text,
  p_branch text,
  p_repo_name text,
  p_world_labs_id text,
  p_splat_url text,
  p_thumbnail_url text default null,
  p_caption text default null,
  p_marble_url text default null,
  p_is_public boolean default true,
  p_user_id uuid default null,
  p_pano_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid;
begin
  if not public.is_service_role() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_repo_url is null or length(trim(p_repo_url)) = 0 then
    raise exception 'invalid_repo' using errcode = '22023';
  end if;
  if p_world_labs_id is null or p_splat_url is null then
    raise exception 'invalid_world' using errcode = '22023';
  end if;

  v_uid := coalesce(p_user_id, auth.uid());

  insert into public.worlds (
    user_id, repo_url, branch, repo_name, world_labs_id, splat_url,
    thumbnail_url, caption, marble_url, pano_url, is_public
  ) values (
    v_uid, trim(p_repo_url), coalesce(nullif(trim(p_branch), ''), 'main'),
    nullif(trim(p_repo_name), ''), trim(p_world_labs_id), trim(p_splat_url),
    p_thumbnail_url, p_caption, p_marble_url, nullif(trim(p_pano_url), ''),
    coalesce(p_is_public, true)
  )
  on conflict (world_labs_id) do update set
    splat_url = excluded.splat_url,
    thumbnail_url = coalesce(excluded.thumbnail_url, public.worlds.thumbnail_url),
    caption = coalesce(excluded.caption, public.worlds.caption),
    marble_url = coalesce(excluded.marble_url, public.worlds.marble_url),
    pano_url = coalesce(excluded.pano_url, public.worlds.pano_url),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

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
        pano_url = coalesce(nullif(trim(p_pano_url), ''), pano_url),
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
      pano_url = coalesce(nullif(trim(p_pano_url), ''), pano_url),
      poll_locked_until = null
  where id = p_world_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Signup no longer mints extra wallet coins (that duplicated the IP bucket).
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

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ip_quotas enable row level security;
alter table public.ip_identities enable row level security;
alter table public.ip_quota_events enable row level security;
alter table public.worlds enable row level security;

-- No client policies on IP tables (deny by default).

drop policy if exists worlds_select_visible on public.worlds;
create policy worlds_select_visible on public.worlds
  for select to anon, authenticated
  using (is_public = true or user_id = auth.uid());

drop policy if exists worlds_update_own on public.worlds;
create policy worlds_update_own on public.worlds
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.ip_quotas from anon, authenticated, public;
revoke all on public.ip_identities from anon, authenticated, public;
revoke all on public.ip_quota_events from anon, authenticated, public;
revoke all on public.worlds from anon, authenticated, public;

grant select on public.worlds to anon, authenticated;
grant update on public.worlds to authenticated;

revoke all on function public.refill_ip_quota(text) from public, anon, authenticated;
revoke all on function public.tick_credits(text, boolean) from public, anon, authenticated;
revoke all on function public.tick_credits_for_user(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.tick_credits_as(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.pre_save_pending_world(text, text, text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_latest_pending_worlds(integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.protect_world_row() from public, anon, authenticated;
revoke all on function public.seconds_until_free_token(double precision, integer) from public, anon, authenticated;

grant execute on function public.tick_credits(text, boolean) to service_role;
grant execute on function public.tick_credits_as(text, uuid, boolean) to service_role;
grant execute on function public.tick_credits_for_user(text, uuid, boolean) to service_role;
grant execute on function public.publish_world(text, text, text, text, text, text, text, text, boolean, uuid, text) to service_role;
grant execute on function public.pre_save_pending_world(text, text, text, text, uuid, boolean) to service_role;
grant execute on function public.claim_latest_pending_worlds(integer, uuid, uuid) to service_role;
grant execute on function public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.refill_ip_quota(text) to service_role;

-- ===========================================================================
-- Mapping checks (SELECT only). Run after the DDL above in the same paste.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Required columns (one row per expected column; missing = not mapped)
-- ---------------------------------------------------------------------------
with expected(table_name, column_name, data_type) as (
  values
    ('app_config', 'key', 'text'),
    ('app_config', 'value_int', 'integer'),
    ('app_config', 'updated_at', 'timestamp with time zone'),

    ('coin_packs', 'id', 'text'),
    ('coin_packs', 'label', 'text'),
    ('coin_packs', 'usd_cents', 'integer'),
    ('coin_packs', 'coins', 'integer'),
    ('coin_packs', 'sort_order', 'integer'),
    ('coin_packs', 'accent', 'text'),

    ('profiles', 'id', 'uuid'),
    ('profiles', 'email', 'text'),
    ('profiles', 'created_at', 'timestamp with time zone'),
    ('profiles', 'updated_at', 'timestamp with time zone'),

    ('wallets', 'user_id', 'uuid'),
    ('wallets', 'balance', 'integer'),
    ('wallets', 'last_refill_at', 'timestamp with time zone'),
    ('wallets', 'created_at', 'timestamp with time zone'),
    ('wallets', 'updated_at', 'timestamp with time zone'),

    ('payments', 'id', 'uuid'),
    ('payments', 'user_id', 'uuid'),
    ('payments', 'reference', 'text'),
    ('payments', 'access_code', 'text'),
    ('payments', 'amount', 'integer'),
    ('payments', 'currency', 'text'),
    ('payments', 'pack_id', 'text'),
    ('payments', 'pack_size', 'integer'),
    ('payments', 'status', 'USER-DEFINED'),
    ('payments', 'paid_at', 'timestamp with time zone'),
    ('payments', 'paystack_transaction_id', 'bigint'),
    ('payments', 'metadata', 'jsonb'),
    ('payments', 'created_at', 'timestamp with time zone'),
    ('payments', 'updated_at', 'timestamp with time zone'),

    ('credit_ledger', 'id', 'uuid'),
    ('credit_ledger', 'user_id', 'uuid'),
    ('credit_ledger', 'delta', 'integer'),
    ('credit_ledger', 'reason', 'USER-DEFINED'),
    ('credit_ledger', 'balance_after', 'integer'),
    ('credit_ledger', 'payment_id', 'uuid'),
    ('credit_ledger', 'metadata', 'jsonb'),
    ('credit_ledger', 'created_at', 'timestamp with time zone'),

    ('paystack_events', 'id', 'uuid'),
    ('paystack_events', 'event', 'text'),
    ('paystack_events', 'reference', 'text'),
    ('paystack_events', 'signature_valid', 'boolean'),
    ('paystack_events', 'payload', 'jsonb'),
    ('paystack_events', 'processed_at', 'timestamp with time zone'),
    ('paystack_events', 'created_at', 'timestamp with time zone'),

    ('ip_quotas', 'ip_hash', 'text'),
    ('ip_quotas', 'tokens', 'double precision'),
    ('ip_quotas', 'capacity', 'integer'),
    ('ip_quotas', 'last_refill_at', 'timestamp with time zone'),
    ('ip_quotas', 'last_consume_at', 'timestamp with time zone'),
    ('ip_quotas', 'consume_count', 'integer'),
    ('ip_quotas', 'created_at', 'timestamp with time zone'),
    ('ip_quotas', 'updated_at', 'timestamp with time zone'),

    ('ip_identities', 'ip_hash', 'text'),
    ('ip_identities', 'user_id', 'uuid'),
    ('ip_identities', 'created_at', 'timestamp with time zone'),

    ('ip_quota_events', 'id', 'uuid'),
    ('ip_quota_events', 'ip_hash', 'text'),
    ('ip_quota_events', 'user_id', 'uuid'),
    ('ip_quota_events', 'delta', 'double precision'),
    ('ip_quota_events', 'reason', 'text'),
    ('ip_quota_events', 'tokens_after', 'double precision'),
    ('ip_quota_events', 'created_at', 'timestamp with time zone'),

    ('worlds', 'id', 'uuid'),
    ('worlds', 'user_id', 'uuid'),
    ('worlds', 'repo_url', 'text'),
    ('worlds', 'branch', 'text'),
    ('worlds', 'repo_name', 'text'),
    ('worlds', 'world_labs_id', 'text'),
    ('worlds', 'operation_id', 'text'),
    ('worlds', 'status', 'text'),
    ('worlds', 'progress', 'text'),
    ('worlds', 'poll_locked_until', 'timestamp with time zone'),
    ('worlds', 'splat_url', 'text'),
    ('worlds', 'thumbnail_url', 'text'),
    ('worlds', 'caption', 'text'),
    ('worlds', 'marble_url', 'text'),
    ('worlds', 'pano_url', 'text'),
    ('worlds', 'is_public', 'boolean'),
    ('worlds', 'created_at', 'timestamp with time zone'),
    ('worlds', 'updated_at', 'timestamp with time zone')
)
select
  e.table_name,
  e.column_name,
  e.data_type as expected_type,
  c.data_type as actual_type,
  (c.column_name is not null) as present
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
order by e.table_name, e.column_name;

-- Any row with present = false is a mapping gap.
-- Any row with expected_type <> actual_type needs a type review
-- (enums show as USER-DEFINED).

-- ---------------------------------------------------------------------------
-- 2. RLS must be on for every public table (IP tables too: deny-by-default)
-- ---------------------------------------------------------------------------
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'app_config', 'coin_packs', 'profiles', 'wallets',
    'payments', 'credit_ledger', 'paystack_events',
    'ip_quotas', 'ip_identities', 'ip_quota_events', 'worlds'
  )
order by 1;

-- ---------------------------------------------------------------------------
-- 3. Client policies — paystack_events and IP tables must have ZERO
--    anon/authenticated policies
-- ---------------------------------------------------------------------------
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ---------------------------------------------------------------------------
-- 4. Table grants — authenticated must not have INSERT/UPDATE/DELETE on
--    money or IP tables. worlds allows SELECT (anon+auth) and UPDATE (auth).
-- ---------------------------------------------------------------------------
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'app_config', 'coin_packs', 'profiles', 'wallets',
    'payments', 'credit_ledger', 'paystack_events',
    'ip_quotas', 'ip_identities', 'ip_quota_events', 'worlds'
  )
  and grantee in ('anon', 'authenticated', 'public')
order by table_name, grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- 5. RPC execute grants
-- ---------------------------------------------------------------------------
select
  g.routine_name as function,
  g.grantee,
  g.privilege_type
from information_schema.routine_privileges g
where g.routine_schema = 'public'
  and g.routine_name in (
    'consume_coin', 'create_payment', 'credit_pack', 'fail_payment',
    'get_my_wallet', 'grant_signup_coins', 'record_paystack_event',
    'coins_for_usd_cents', 'config_int', 'is_service_role',
    'tick_credits', 'tick_credits_as', 'tick_credits_for_user',
    'publish_world', 'refill_ip_quota', 'seconds_until_free_token'
  )
  and g.grantee in ('anon', 'authenticated', 'public', 'service_role')
order by function, grantee;

-- Expected:
--   authenticated: consume_coin, fail_payment, get_my_wallet, coins_for_usd_cents
--   service_role:  create_payment, credit_pack, grant_signup_coins,
--                  record_paystack_event, fail_payment, coins_for_usd_cents,
--                  tick_credits, tick_credits_as, tick_credits_for_user,
--                  publish_world, refill_ip_quota
--   anon:          none of the money / quota RPCs

-- ---------------------------------------------------------------------------
-- 6. Seed catalog (purchase UI + coins_for_usd_cents + quota knobs)
-- ---------------------------------------------------------------------------
select id, label, usd_cents, coins, sort_order, accent
from public.coin_packs
order by sort_order;

select key, value_int from public.app_config order by key;

select
  public.coins_for_usd_cents(500) as p10,    -- 10
  public.coins_for_usd_cents(1000) as p20,   -- 20
  public.coins_for_usd_cents(2000) as p40,   -- 40
  public.coins_for_usd_cents(1500) as custom_15; -- 15

-- ---------------------------------------------------------------------------
-- 7. Pricing / auth mapping used by the app (documentation only)
-- ---------------------------------------------------------------------------
-- Env                         → destination
-- NEXT_PUBLIC_SUPABASE_URL    → browser + server clients
-- NEXT_PUBLIC_SUPABASE_ANON_KEY → browser RLS (user JWT)
-- SUPABASE_SERVICE_ROLE_KEY   → initialize / verify / webhook / tick / publish RPCs
-- NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY → Paystack Inline (access_code path)
-- PAYSTACK_SECRET_KEY         → initialize, verify, webhook HMAC
-- PAYSTACK_CURRENCY           → payments.currency (default USD)
-- CREDITS_IP_PEPPER           → sha256 pepper for ip_quotas.ip_hash (never store raw IPs)
--
-- Flow
--   GitHub OAuth → auth.users insert → handle_new_user
--     → profiles + wallets (paid balance 0; free gens live on ip_quotas)
--   Generate → tick_credits_as(ip_hash, user_id, consume) (service)
--     → spend wallet first, else leaky-bucket token on the IP hash
--   Purchase → /api/paystack/initialize (session) → create_payment (service)
--     → pack_size = coins_for_usd_cents(amount)
--     → Inline resumeTransaction(access_code)
--     → verify/webhook → credit_pack(reference, txn_id, paid_amount)
--     → amount mismatch raises; already-success is idempotent
--   World ready → apply_world_poll_result(...) (service) → Explore reads public.worlds
