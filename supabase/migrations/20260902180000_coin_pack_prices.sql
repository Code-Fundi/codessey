-- Update purchase catalog: $5/10, $10/20, $20/40 (1 coin per $0.50 on presets).
-- Idempotent so a DB initialized from schema-dry-run.sql can still receive this file.

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
