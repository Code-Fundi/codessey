-- Must commit before any function uses this enum value (Postgres rule).
alter type public.ledger_reason add value if not exists 'postcard_download';
