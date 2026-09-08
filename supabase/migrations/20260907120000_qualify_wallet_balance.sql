-- Qualify wallets.balance in RPCs that also return a column named balance.
-- Unqualified `select balance from wallets` is ambiguous with RETURNS TABLE (..., balance integer, ...).
-- Do not rewrite 20260906190000. Paste into the Supabase SQL editor (or let CI db push on merge).

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

  select w.balance into v_balance from public.wallets w where w.user_id = p_user_id for update;

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
    select w.balance into v_paid from public.wallets w where w.user_id = v_uid for update;
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
