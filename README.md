# codessey

Turn your codebase into a journey.

Index a GitHub repository with CodeFundi, generate a World Labs landscape from that index, and explore it in the browser.

## Setup

1. Copy `.env.example` to `.env.local` and fill in keys. Never commit real secrets.
2. Paste `supabase/schema-dry-run.sql` into the Supabase SQL editor once (full schema + mapping checks). Later schema changes live in `supabase/migrations/` and are applied by CI on merge to `main`.
3. Enable the GitHub auth provider in Supabase and set the redirect URL to `{origin}/auth/callback`.
4. Point Paystack's webhook to `{origin}/api/paystack/webhook`.
5. Keep `CODEFUNDI_API_KEY`, `WORLDLABS_API_KEY`, `PAYSTACK_SECRET_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` server-only. They are never sent to the browser.

Free credits refill on a 12-hour leaky bucket keyed by a hashed IP (shared across accounts on that IP to block dupe farming). Purchased coins sit on the signed-in wallet and skip the free queue. Generated worlds are stored and listed on the Explore tab (`is_public` defaults to true). World Labs has no completion webhooks — generate returns immediately after a pending world is pre-saved, then only the latest pending job is polled sequentially until the splat is written back to `public.worlds`.

```bash
pnpm install
pnpm dev
```

Free credits refill every 12 hours. One coin generates one world. Purchase packs in the header via Paystack Inline.
