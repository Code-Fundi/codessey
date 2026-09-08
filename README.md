# codessey

Turn your codebase into a journey.

Index a GitHub repository with CodeFundi, generate a World Labs landscape from that index, and explore it in the browser.

## Setup

1. Copy `.env.example` to `.env.local` and fill in keys. Never commit real secrets.
2. Paste `supabase/schema-dry-run.sql` into the Supabase SQL editor once (full schema + mapping checks). Later schema changes live in `supabase/migrations/` and are applied by CI on merge to `main`.
3. Enable the GitHub auth provider in Supabase and set the redirect URL to `{origin}/auth/callback`.
4. Point Paystack's webhook to `{origin}/api/paystack/webhook`.
5. Keep `CODEFUNDI_API_KEY`, `PAYSTACK_SECRET_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` server-only. They are never sent to the browser. World Labs keys stay in the user's browser (`localStorage`); Codessey does not hold a platform World Labs key.

Generate uses the visitor's World Labs key. Codessey coins are for guestbook signatures and founder plaques (new GitHub accounts get 2). Generated worlds are stored and listed on the Explore tab (`is_public` defaults to true). World Labs has no completion webhooks — the browser polls Marble with the user's key until the splat is written back to `public.worlds`.

```bash
pnpm install
pnpm dev
```

Add a World Labs API key in the header dialog to generate. Purchase Codessey coins in the header via Paystack Inline.
