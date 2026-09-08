/**
 * Codessey Supabase schema map (dry-run).
 *
 * Column owners:
 *   auth.users.id            → profiles.id, wallets.user_id, payments.user_id, credit_ledger.user_id
 *   coin_packs.usd_cents     → payments.amount (preset) via resolvePackAmount + coins_for_usd_cents()
 *   coins_for_usd_cents()    → payments.pack_size (never client-supplied)
 *   payments.id              → credit_ledger.payment_id (pack_purchase)
 *   payments.reference       → Paystack webhook + paystack_events.reference
 *   Paystack amount (cents)  → credit_pack(p_paid_amount) must equal payments.amount
 *   app_config.free_gen_coins → signup grant (2 coins)
 *   app_config.refill_* → unused for display; unauthed balance is 0
 *
 * Frontend (anon/public key + user JWT):
 *   SELECT  app_config, coin_packs, own profiles/wallets/payments/credit_ledger,
 *           complete public worlds and own rows, world_signatures, ranking snapshots
 *   UPDATE  own worlds.is_public (protect_world_row blocks asset/identity/plaque columns)
 *   RPC     get_my_wallet, create_my_payment, fail_payment, coins_for_usd_cents,
 *           lookup/pre_save/apply, sign_guestbook, buy_founder_plaque,
 *           record_world_visit, snapshot_world_rankings
 *
 * Service role only:
 *   publish_world, tick_credits_as, create_payment, credit_pack, record_paystack_event
 *   paystack_events + ip_* + world_visits writes — no anon/authenticated policies
 *
 * See supabase/schema-dry-run.sql to initialize the database and verify columns, RLS, and grants.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type LedgerReason =
  | "signup_grant"
  | "pack_purchase"
  | "generate"
  | "postcard_download"
  | "guestbook_sign"
  | "founder_plaque";
export type PaymentStatus = "pending" | "success" | "failed" | "abandoned";
export type CoinPackAccent = "amber" | "emerald" | "violet";
export type CoinPackId = "p10" | "p20" | "p40" | "custom";

export interface AppConfigRow {
  key: string;
  value_int: number;
  updated_at: string;
}

export interface CoinPackRow {
  id: Exclude<CoinPackId, "custom">;
  label: string;
  usd_cents: number;
  coins: number;
  sort_order: number;
  accent: CoinPackAccent;
}

export interface ProfileRow {
  id: string;
  email: string;
  github_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletRow {
  user_id: string;
  balance: number;
  last_refill_at: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  reference: string;
  access_code: string | null;
  amount: number;
  currency: string;
  pack_id: string;
  pack_size: number;
  status: PaymentStatus;
  paid_at: string | null;
  paystack_transaction_id: number | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface CreditLedgerRow {
  id: string;
  user_id: string;
  delta: number;
  reason: LedgerReason;
  balance_after: number;
  payment_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface PaystackEventRow {
  id: string;
  event: string;
  reference: string | null;
  signature_valid: boolean;
  payload: Json;
  processed_at: string | null;
  created_at: string;
}

export type WorldStatus = "pending" | "complete" | "failed";
export type WorldGenerationMode = "pano" | "world";
export type WorldBillingSource = "credits" | "user_key";

export interface WorldRow {
  id: string;
  user_id: string | null;
  repo_url: string;
  repo_url_norm?: string | null;
  branch: string;
  repo_name: string | null;
  world_labs_id: string;
  operation_id?: string | null;
  status?: WorldStatus;
  progress?: string | null;
  splat_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  marble_url: string | null;
  pano_url: string | null;
  generation_mode?: WorldGenerationMode;
  billing_source?: WorldBillingSource;
  is_public: boolean;
  discovered_by?: string | null;
  plaque_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorldSignatureRow {
  id: string;
  world_id: string;
  user_id: string;
  github_username: string;
  message: string;
  signature_png: string;
  created_at: string;
}

export interface WorldRankingSnapshotRow {
  id: string;
  world_id: string;
  visit_count: number;
  signature_count: number;
  rank_visits: number;
  rank_populated: number;
  snapshot_at: string;
  is_stale: boolean;
}

export interface SignGuestbookResult {
  ok: boolean;
  balance: number;
  error: string | null;
  already_signed: boolean;
  github_username: string | null;
  message: string | null;
  signature_png: string | null;
}

export interface BuyPlaqueResult {
  ok: boolean;
  balance: number;
  error: string | null;
  discovered_by: string | null;
}

export interface CreateMyPaymentResult {
  reference: string;
  amount: number;
  coins: number;
  pack_id: string;
  email: string;
  currency: string;
}

export interface CreditTickRow {
  ok: boolean;
  balance: number;
  paid_balance: number;
  free_balance: number;
  next_refresh_at: string;
  seconds_until_refresh: number;
  source: string;
  error: string | null;
}

export interface ConsumeCoinResult {
  ok: boolean;
  balance: number;
  error: string | null;
}

export interface CreditPackResult {
  credited: boolean;
  balance: number;
}

export interface MyWalletResult {
  balance: number;
  email: string;
}

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      app_config: Table<AppConfigRow, AppConfigRow, Partial<AppConfigRow>>;
      coin_packs: Table<CoinPackRow, CoinPackRow, Partial<CoinPackRow>>;
      profiles: Table<ProfileRow, ProfileRow, Partial<ProfileRow>>;
      wallets: Table<WalletRow, WalletRow, Partial<WalletRow>>;
      payments: Table<PaymentRow, PaymentRow, Partial<PaymentRow>>;
      credit_ledger: Table<CreditLedgerRow, CreditLedgerRow, Partial<CreditLedgerRow>>;
      paystack_events: Table<PaystackEventRow, PaystackEventRow, Partial<PaystackEventRow>>;
      worlds: Table<WorldRow, WorldRow, Partial<WorldRow>>;
      world_signatures: Table<WorldSignatureRow, WorldSignatureRow, Partial<WorldSignatureRow>>;
      world_ranking_snapshots: Table<
        WorldRankingSnapshotRow,
        WorldRankingSnapshotRow,
        Partial<WorldRankingSnapshotRow>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      tick_credits_as: {
        Args: {
          p_ip_hash: string;
          p_user_id: string | null;
          p_consume: boolean;
          p_amount?: number;
        };
        Returns: CreditTickRow[];
      };
      publish_world: {
        Args: {
          p_repo_url: string;
          p_branch: string;
          p_repo_name: string;
          p_world_labs_id: string;
          p_splat_url?: string | null;
          p_thumbnail_url?: string | null;
          p_caption?: string | null;
          p_marble_url?: string | null;
          p_is_public?: boolean;
          p_user_id?: string | null;
          p_pano_url?: string | null;
          p_generation_mode?: WorldGenerationMode;
          p_billing_source?: WorldBillingSource;
        };
        Returns: string;
      };
      pre_save_pending_world: {
        Args: {
          p_operation_id: string;
          p_repo_url: string;
          p_branch: string;
          p_repo_name: string;
          p_user_id?: string | null;
          p_is_public?: boolean;
          p_generation_mode?: WorldGenerationMode;
          p_billing_source?: WorldBillingSource;
        };
        Returns: WorldRow;
      };
      claim_latest_pending_worlds: {
        Args: {
          p_limit?: number;
          p_user_id?: string | null;
          p_world_id?: string | null;
        };
        Returns: WorldRow[];
      };
      lookup_world_by_repo_url: {
        Args: { p_repo_url: string };
        Returns: WorldRow | null;
      };
      apply_world_poll_result: {
        Args: {
          p_world_id: string;
          p_done: boolean;
          p_progress?: string | null;
          p_error?: string | null;
          p_world_labs_id?: string | null;
          p_splat_url?: string | null;
          p_thumbnail_url?: string | null;
          p_caption?: string | null;
          p_marble_url?: string | null;
          p_pano_url?: string | null;
        };
        Returns: WorldRow;
      };
      create_my_payment: {
        Args: { p_pack_id: string; p_custom_cents?: number | null };
        Returns: CreateMyPaymentResult[];
      };
      sign_guestbook: {
        Args: { p_world_id: string; p_signature: string; p_message: string };
        Returns: SignGuestbookResult[];
      };
      buy_founder_plaque: {
        Args: { p_world_id: string };
        Returns: BuyPlaqueResult[];
      };
      record_world_visit: { Args: { p_world_id: string }; Returns: undefined };
      snapshot_world_rankings: { Args: Record<PropertyKey, never>; Returns: undefined };
      create_payment: {
        Args: {
          p_reference: string;
          p_amount: number;
          p_currency: string;
          p_pack_id: string;
          p_access_code?: string | null;
          p_user_id?: string | null;
        };
        Returns: string;
      };
      fail_payment: { Args: { p_reference: string }; Returns: undefined };
      get_my_wallet: { Args: Record<PropertyKey, never>; Returns: MyWalletResult[] };
      coins_for_usd_cents: { Args: { p_cents: number }; Returns: number };
      credit_pack: {
        Args: {
          p_reference: string;
          p_paystack_transaction_id?: number | null;
          p_paid_amount?: number | null;
        };
        Returns: CreditPackResult[];
      };
      record_paystack_event: {
        Args: {
          p_event: string;
          p_reference: string | null;
          p_signature_valid: boolean;
          p_payload: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      ledger_reason: LedgerReason;
      payment_status: PaymentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
