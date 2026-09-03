-- Fail CI if schema-dry-run.sql did not land the mapped objects.

do $$
declare
  missing text;
begin
  select string_agg(format('%s.%s', e.table_name, e.column_name), ', ' order by e.table_name, e.column_name)
  into missing
  from (
    values
      ('app_config', 'key'),
      ('app_config', 'value_int'),
      ('coin_packs', 'id'),
      ('coin_packs', 'usd_cents'),
      ('coin_packs', 'coins'),
      ('profiles', 'id'),
      ('wallets', 'user_id'),
      ('wallets', 'balance'),
      ('wallets', 'last_refill_at'),
      ('payments', 'reference'),
      ('payments', 'pack_size'),
      ('credit_ledger', 'delta'),
      ('paystack_events', 'payload'),
      ('ip_quotas', 'ip_hash'),
      ('ip_quotas', 'tokens'),
      ('ip_identities', 'user_id'),
      ('ip_quota_events', 'reason'),
      ('worlds', 'world_labs_id'),
      ('worlds', 'splat_url'),
      ('worlds', 'is_public'),
      ('worlds', 'operation_id'),
      ('worlds', 'status'),
      ('worlds', 'pano_url')
  ) as e(table_name, column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = e.table_name
   and c.column_name = e.column_name
  where c.column_name is null;

  if missing is not null then
    raise exception 'schema mapping gap: %', missing;
  end if;
end
$$;

do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'app_config', 'coin_packs', 'profiles', 'wallets',
      'payments', 'credit_ledger', 'paystack_events',
      'ip_quotas', 'ip_identities', 'ip_quota_events', 'worlds'
    )
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS disabled on: %', missing;
  end if;
end
$$;

do $$
begin
  if public.coins_for_usd_cents(500) <> 10 then
    raise exception 'coins_for_usd_cents(500) expected 10';
  end if;
  if public.coins_for_usd_cents(1000) <> 20 then
    raise exception 'coins_for_usd_cents(1000) expected 20';
  end if;
  if public.coins_for_usd_cents(2000) <> 40 then
    raise exception 'coins_for_usd_cents(2000) expected 40';
  end if;
  if public.coins_for_usd_cents(1500) <> 15 then
    raise exception 'coins_for_usd_cents(1500) expected 15';
  end if;
  if to_regprocedure('public.pre_save_pending_world(text, text, text, text, uuid, boolean)') is null then
    raise exception 'missing pre_save_pending_world';
  end if;
  if to_regprocedure('public.claim_latest_pending_worlds(integer, uuid, uuid)') is null then
    raise exception 'missing claim_latest_pending_worlds';
  end if;
  if to_regprocedure('public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text)') is null then
    raise exception 'missing apply_world_poll_result';
  end if;
end
$$;
