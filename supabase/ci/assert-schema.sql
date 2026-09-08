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
      ('worlds', 'pano_url'),
      ('worlds', 'generation_mode'),
      ('worlds', 'billing_source'),
      ('worlds', 'repo_url_norm'),
      ('worlds', 'discovered_by'),
      ('worlds', 'plaque_at'),
      ('profiles', 'github_username'),
      ('world_signatures', 'message'),
      ('world_signatures', 'signature_png'),
      ('world_visits', 'visitor_id'),
      ('world_ranking_snapshots', 'is_stale')
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
      'ip_quotas', 'ip_identities', 'ip_quota_events', 'worlds',
      'world_signatures', 'world_visits', 'world_ranking_snapshots'
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
  if public.coins_for_usd_cents(1500) <> 30 then
    raise exception 'coins_for_usd_cents(1500) expected 30';
  end if;
  if public.coins_for_usd_cents(600) <> 12 then
    raise exception 'coins_for_usd_cents(600) expected 12';
  end if;
  if to_regprocedure('public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text)') is null then
    raise exception 'missing pre_save_pending_world';
  end if;
  if to_regprocedure('public.claim_latest_pending_worlds(integer, uuid, uuid)') is null then
    raise exception 'missing claim_latest_pending_worlds';
  end if;
  if to_regprocedure('public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text)') is null then
    raise exception 'missing apply_world_poll_result';
  end if;
  if to_regprocedure('public.tick_credits_as(text, uuid, boolean, integer)') is null then
    raise exception 'missing tick_credits_as';
  end if;
  if to_regprocedure('public.lookup_world_by_repo_url(text)') is null then
    raise exception 'missing lookup_world_by_repo_url';
  end if;
  if to_regprocedure('public.create_my_payment(text, integer)') is null then
    raise exception 'missing create_my_payment';
  end if;
  if to_regprocedure('public.sign_guestbook(uuid, text, text)') is null then
    raise exception 'missing sign_guestbook';
  end if;
  if to_regprocedure('public.buy_founder_plaque(uuid)') is null then
    raise exception 'missing buy_founder_plaque';
  end if;
  if to_regprocedure('public.record_world_visit(uuid)') is null then
    raise exception 'missing record_world_visit';
  end if;
  if to_regprocedure('public.snapshot_world_rankings()') is null then
    raise exception 'missing snapshot_world_rankings';
  end if;
end
$$;

do $$
begin
  if not has_table_privilege('service_role', 'public.worlds', 'SELECT')
     or not has_table_privilege('service_role', 'public.worlds', 'INSERT')
     or not has_table_privilege('service_role', 'public.worlds', 'UPDATE') then
    raise exception 'service_role missing worlds DML';
  end if;
  if not has_table_privilege('anon', 'public.worlds', 'SELECT') then
    raise exception 'anon missing worlds SELECT';
  end if;
  if has_table_privilege('anon', 'public.worlds', 'INSERT')
     or has_table_privilege('authenticated', 'public.worlds', 'INSERT') then
    raise exception 'clients must not INSERT worlds';
  end if;
  if has_table_privilege('anon', 'public.world_signatures', 'INSERT')
     or has_table_privilege('authenticated', 'public.world_signatures', 'INSERT')
     or has_table_privilege('anon', 'public.world_visits', 'INSERT')
     or has_table_privilege('authenticated', 'public.world_visits', 'INSERT')
     or has_table_privilege('anon', 'public.world_visits', 'SELECT')
     or has_table_privilege('authenticated', 'public.world_visits', 'SELECT') then
    raise exception 'clients must not write signatures/visits or read visits';
  end if;
  if not has_function_privilege(
       'authenticated',
       'public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'anon',
       'public.pre_save_pending_world(text, text, text, text, uuid, boolean, text, text)',
       'EXECUTE'
     ) then
    raise exception 'clients missing pre_save_pending_world';
  end if;
  if not has_function_privilege(
       'anon',
       'public.apply_world_poll_result(uuid, boolean, text, text, text, text, text, text, text, text)',
       'EXECUTE'
     ) then
    raise exception 'anon missing apply_world_poll_result';
  end if;
  if not has_function_privilege(
       'anon',
       'public.lookup_world_by_repo_url(text)',
       'EXECUTE'
     ) then
    raise exception 'anon missing lookup_world_by_repo_url';
  end if;
  if has_function_privilege(
       'anon',
       'public.create_payment(text, integer, text, text, text, uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.create_payment(text, integer, text, text, text, uuid)',
       'EXECUTE'
     ) then
    raise exception 'clients must not execute create_payment';
  end if;
  if not has_function_privilege(
       'authenticated',
       'public.create_my_payment(text, integer)',
       'EXECUTE'
     ) then
    raise exception 'authenticated missing create_my_payment';
  end if;
end
$$;
