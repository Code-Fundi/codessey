-- New ledger reasons must be their own statements (cannot be used in the
-- same transaction as the first ADD VALUE on older Postgres).
alter type public.ledger_reason add value if not exists 'guestbook_sign';
alter type public.ledger_reason add value if not exists 'founder_plaque';
