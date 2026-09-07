/**
 * CodeFundi API Client
 *
 * A production-ready TypeScript client for the CodeFundi API.
 * Supports both JSON and NDJSON streaming responses.
 *
 * @version 2.0.0
 */

import { sessionDataInvalidatePrefix } from "./codeFundiSessionDataStore";

// ============================================================================
// Configuration Types
// ============================================================================

export interface CodeFundiConfig {
  baseUrl: string;
  apiKey?: string;
  demoMode?: boolean;
}

// ============================================================================
// Common Types
// ============================================================================

/** Subscription / API tier names (aligned with fundiAI tierLimits + OpenAPI examples). */
export type TierName = "FREE" | "DEV" | "PRO" | "ENTERPRISE" | "ADMIN";

/** OpenRouter default for search/chat when no model is selected (aligned with fundiAI v2-search + AIModels). */
export const CODEFUNDI_DEFAULT_CHAT_MODEL_ID = "openai/gpt-oss-120b:free" as const;

export type SearchScope = "all" | "repos" | "files" | "code" | "functions";

/**
 * Search execution mode (POST /v2/search `scan_mode`).
 * - semantic: vector similarity (embeddings)
 * - grep_docs: substring match over persisted documentation JSON (`code_summary`)
 * - grep_code: substring match over persisted file source (`code`)
 */
export type ScanMode = "semantic" | "grep_docs" | "grep_code";

/**
 * Documentation field preset for search + file docs (OpenAPI enum).
 * The API also accepts a comma-separated list of dot-notation paths for advanced clients.
 */
export type FieldsPreset = "basic" | "summary" | "full" | "raw";
export type SearchFieldsParam = FieldsPreset | string;
export type SortOrder = "asc" | "desc";
/** Matches backend `parseStatsRange` (`/^(\d+)d$/i`) — not limited to OpenAPI enum. */
export type StatsRange = "1d" | "7d" | "30d" | "60d" | "90d" | "365d";
export type RepoScope = "private" | "public";
export type VisibilityFilter = "private" | "public" | "all";

/**
 * Repository key for `GET /v2/files/{repo_key}/…`: a `user_data_source.id` (UUID) or a clone URL
 * matched case-insensitively on the server. Non-UUID values are URL-encoded for the path segment.
 */
export type FilesRepoPathKey = string;

/** RFC 4122 UUID (case-insensitive), for disambiguation from repo URLs in file routes. */
const FILES_REPO_PATH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Encode a value for use as the `:repo_id` segment in `/v2/files/:repo_id` and `/v2/files/:repo_id/:file_id`.
 * UUIDs are returned unchanged; any other string (e.g. `https://github.com/org/repo`) is passed through
 * `encodeURIComponent` so it occupies a single path segment.
 */
export function encodeRepoKeyForV2FilesPath(repoKey: FilesRepoPathKey): string {
  const s = String(repoKey ?? "").trim();
  if (!s) {
    return s;
  }
  if (FILES_REPO_PATH_UUID_RE.test(s)) {
    return s;
  }
  return encodeURIComponent(s);
}

/** True if `repoKey` is treated as a UUID in `/v2/files/{repo_key}` (not URL-encoded). */
export function isFilesRepoPathUuidKey(repoKey: string): boolean {
  const s = String(repoKey ?? "").trim();
  return s.length > 0 && FILES_REPO_PATH_UUID_RE.test(s);
}

export interface Meta {
  tier?: TierName;
  updated_at?: string;
  /**
   * When present on `GET /v2/repos` or `GET /v2/files/{repo_id}` list responses, echoes the
   * normalized `search` query substring used for name/path filtering.
   */
  search?: string | null;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface BaseResponse<T = unknown> {
  status: "success" | "error";
  message?: string;
  data?: T;
  meta?: Meta;
}

export interface PaginatedResponse<T> extends BaseResponse<T[]> {
  pagination?: Pagination;
}

export interface ErrorResponse {
  status: "error";
  message: string;
  code?: string;
}

// ============================================================================
// V2 Auth (fundiAI /v2/auth/*)
// ============================================================================

export type V2AuthMode = "otp" | "password";

export type V2AuthKeyState = "active" | "agent_pending";

export interface V2AuthApiKeySummary {
  key: string;
  key_state: V2AuthKeyState;
}

export interface V2AuthSessionEnvelope {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: unknown;
  [key: string]: unknown;
}

export interface V2AuthAuthenticateData {
  user_id: string;
  email: string;
  session: V2AuthSessionEnvelope | null;
  verification_required: boolean;
  api_key: V2AuthApiKeySummary | null;
}

export interface V2AuthAuthenticateResponse {
  status: "ok";
  data: V2AuthAuthenticateData;
}

export interface V2AuthVerifyData {
  user_id: string;
  email: string;
  session: V2AuthSessionEnvelope;
  api_key: V2AuthApiKeySummary | null;
}

export interface V2AuthVerifyResponse {
  status: "ok";
  data: V2AuthVerifyData;
}

export interface V2AuthResendResponse {
  status: "ok";
  data: Record<string, unknown>;
}

/** JSON body returned by `/v2/auth/*` on failure (aligned with fundiAI `v2-auth.js`). */
export interface V2AuthErrorBody {
  status: "error";
  code: string;
  message: string;
  /** Present on HTTP 429 from app rate limiting. */
  retry_after?: number;
}

/**
 * Optional headers for `/v2/auth/*` calls (rate-limit binding, idempotency, password header name).
 */
export interface V2AuthClientRequestOptions {
  /** Sent as `Idempotency-Key` (supported on authenticate by the API). */
  idempotencyKey?: string;
  /** Sent as `X-Fingerprint` — pairs with IP for `ip_addresses` rate-limit rows. */
  fingerprint?: string;
  /**
   * Which header carries the password for `auth_mode: "password"`.
   * @default 'x-codefundi-auth-password' → `X-CodeFundi-Auth-Password`
   */
  passwordHeader?: "x-codefundi-auth-password" | "x-auth-password";
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchFilters {
  file_types?: string[];
  file_paths?: string[];
  dependencies?: string[];
  function_names?: string[];
  has_functions?: boolean;
  min_lines?: number;
  max_lines?: number;
  visibility?: VisibilityFilter;
}

export interface SearchRequest {
  query: string;
  scope?: SearchScope;
  /** Defaults to `semantic` on the API if omitted. */
  scan_mode?: ScanMode;
  /** Filter by repository source UUIDs (`user_data_source.id`). */
  repo_ids?: string[];
  /**
   * Filter by stored repository clone URLs (`user_data_source.link`). Normalized case-insensitively
   * on the server; resolved IDs are merged with `repo_ids` (deduped). Requires authenticated API key.
   * Combined length of `repo_ids` + `repo_urls` must not exceed 25.
   */
  repo_urls?: string[];
  filters?: SearchFilters;
  similarity_threshold?: number;
  /**
   * `full` = safe extracted documentation (not raw code_summary JSON).
   * `raw` = raw code_summary blob (ADMIN tier only; API returns 400 otherwise).
   */
  fields?: SearchFieldsParam;
  chat?: boolean;
  model?: string;
}

/**
 * Markdown documentation returned by v2 endpoints (OpenAPI `documentation: string`).
 */
export type Documentation = string;

export interface SearchResult {
  id: string;
  repo_id: string;
  repo_name: string | null;
  repo_link: string | null;
  file_name: string;
  file_path: string;
  file_branch: string;
  file_size_kb: number;
  github_url: string | null;
  /** Null for grep modes and some edge cases. */
  similarity: number | null;
  documentation?: Documentation | null;
  created_at: string;
  updated_at?: string | null;
}

export interface SearchMeta extends Meta {
  search_time_ms?: number;
  similarity_threshold?: number;
  scope?: SearchScope;
  scan_mode?: ScanMode;
  filters_applied?: string[];
  raw_count?: number;
  filtered_count?: number;
  credits_used?: number;
  credits_remaining?: number;
  knowledge_search_length?: number;
}

export interface SearchResponse extends BaseResponse<SearchResult[]> {
  total?: number;
  meta?: SearchMeta;
}

// NDJSON Streaming Types
export interface NDJSONSearchChunk {
  type: "search";
  results: SearchResult[];
  total: number;
  meta: SearchMeta;
}

export interface NDJSONTextChunk {
  type: "chunk";
  text: string;
}

export interface NDJSONDoneChunk {
  type: "done";
  model: string;
  context_files: number;
}

export interface NDJSONErrorChunk {
  type: "error";
  message: string;
  code?: string;
}

export type NDJSONChunk = NDJSONSearchChunk | NDJSONTextChunk | NDJSONDoneChunk | NDJSONErrorChunk;

// ============================================================================
// Repository Types
// ============================================================================

export interface Repository {
  id: string;
  name: string;
  link: string;
  source: string;
  description?: string | null;
  branch?: string;
  is_updating?: boolean;
  status?: boolean;
  is_public?: boolean;
  organization_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface RepositoryListMeta extends Meta {
  scope?: RepoScope;
  max_repos_allowed?: number;
}

export interface RepositoryListResponse extends PaginatedResponse<Repository> {
  meta?: RepositoryListMeta;
}

export interface RepositoryStats {
  file_count: number;
  total_size_kb: number;
}

export interface RepositoryFileInfo {
  id: string;
  file_name: string;
  file_path: string;
  description?: string | null;
}

export interface RepositoryDetail extends Repository {
  stats?: RepositoryStats;
  files?: RepositoryFileInfo[];
}

export type RepositoryDetailResponse = BaseResponse<RepositoryDetail>;

export interface IndexRepoRequest {
  url: string;
  branch?: string;
  update?: boolean;
}

/** File entry from early indexing summary (`data.repo.files.index`). */
export interface RepoIndexFileEntry {
  path: string;
  name: string;
  ext: string;
  language?: string | null;
  sizeBytes?: number | null;
  modifiedAt?: string | null;
}

/** POST /v2/repos/index/new success `data.repo` (OpenAPI: RepositoryIndexInitResponse). */
export interface RepositoryIndexInitRepo {
  url: string;
  branch: string | null;
  data_source_id: string | null;
  total_files: number | null;
  description: string | null;
  files: {
    tree: Record<string, unknown> | null;
    index: RepoIndexFileEntry[];
  };
}

export interface RepositoryIndexInitData {
  repo: RepositoryIndexInitRepo;
}

export interface IndexRepoResponse extends BaseResponse<RepositoryIndexInitData> {
  message?: string;
}

export interface RepoStatusRequest {
  url: string;
}

export type RepoStatusResponse = BaseResponse<{
  updating: boolean;
  status: boolean;
  name?: string;
  last_updated?: string;
}>;

export interface ReadmeRepo {
  id: string;
  name: string;
  description?: string | null;
  link: string;
}

export interface ReadmeData {
  id: string;
  file_name: string;
  file_path: string;
  github_url: string;
  repo: ReadmeRepo;
  documentation: Documentation;
  data: string;
  created_at: string;
  updated_at?: string | null;
}

export type ReadmeResponse = BaseResponse<ReadmeData>;

export interface RepoBlueprintData {
  url?: string | null;
  branch?: string | null;
  description?: string | null;
  readme?: string | null;
  conventions?: string | string[] | null;
  dependencies?: unknown;
  languages?: unknown;
  total_files?: number | null;
  file_count?: number | null;
}

export type BlueprintResponse = BaseResponse<RepoBlueprintData>;

// ============================================================================
// File Types
// ============================================================================

export interface FileListItem {
  id: string;
  file_name: string;
  file_path: string;
  file_branch: string;
  file_size_kb: number;
  description?: string | null;
  dependencies?: string[];
  total_lines?: number | null;
  created_at: string;
  updated_at?: string | null;
}

export type FileListResponse = PaginatedResponse<FileListItem>;

export interface FileRepo {
  id: string;
  name: string;
  link: string;
  description?: string | null;
}

export interface FileDocumentationData {
  id: string;
  repo_id: string;
  file_name: string;
  file_path: string;
  file_branch: string;
  file_size_kb: number;
  github_url: string;
  repo: FileRepo;
  documentation: Documentation;
  created_at: string;
  updated_at?: string | null;
}

export interface FileDocumentationMeta extends Meta {
  fields_applied?: string;
}

export interface FileDocumentationResponse extends BaseResponse<FileDocumentationData> {
  meta?: FileDocumentationMeta;
}

// ============================================================================
// History Types
// ============================================================================

/**
 * Category of a history row, derived server-side from the endpoint / query_type.
 * Mirrors `categorizeEndpoint` in `apps/api/fundiAI/tools/creditCosts.js`.
 */
export type HistoryCategory =
  | "chat"
  | "search"
  | "research"
  | "files"
  | "index"
  | "repos"
  | "history"
  | "stats"
  | "keys"
  | "models"
  | "other";

/**
 * A single file surfaced in `HistoryItem.retrieved_knowledge_sources`.
 *
 * Mirrors the shape returned by `GET /v2/files/{repo_id}` (`FileListItem`)
 * plus three repo identifiers (`repo_id` / `repo_link` / `repo_name`) so
 * the UI can build a direct link to the repo documentation page without a
 * follow-up `/v2/repos` lookup. Pass the triple through
 * {@link buildRepoPageHref} (from `lib/repoHref`) to render the canonical
 * href for each card.
 *
 * When the caller has lost access to the source (the parent
 * `user_data_source` was deleted / unshared from the caller's org), only
 * `id` is populated — the rest collapse to `null` / empty arrays.
 */
export interface HistorySourceFile {
  id: string;
  file_name?: string | null;
  file_path?: string | null;
  file_branch?: string | null;
  file_size_kb?: number | null;
  description?: string | null;
  dependencies?: string[];
  total_lines?: number | null;
  /** Parent `user_data_source.id`. Canonical `?s=` key for `/repo/`. */
  repo_id?: string | null;
  /** Parent clone URL — `github.com` URLs resolve to `/repo/{owner}/{repo}`. */
  repo_link?: string | null;
  /** Human-readable repo label (UI-only; don't rely on it for routing). */
  repo_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HistoryItem {
  id: string;
  prompt: string;
  query_type: string | null;
  endpoint: string | null;
  category: HistoryCategory;
  mode: string | null;
  language?: string | null;
  model: string | null;
  conversation_id?: string | null;
  repo_id?: string | null;
  organization_id?: string | null;
  cost_credits: number;
  duration_ms: number | null;
  status_code: number | null;
  /**
   * Up to the first 10 knowledge-retrieval sources referenced at generation
   * time, enriched server-side into the `GET /v2/files` list shape. Entries
   * the caller has lost access to collapse to `{ id }`-only stubs.
   */
  retrieved_knowledge_sources: HistorySourceFile[];
  created_at: string;
  /** Short preview returned on list endpoints (verbose=false). */
  response_preview?: string | null;
  /** Full response returned on single-item + conversation endpoints (verbose=true). */
  response?: string | null;
}

export interface HistoryListMeta extends Meta {
  date_range?: {
    from: string;
    to: string;
  };
  /** True when the requested `from`/`to` window was narrowed to the tier history cap. */
  date_range_limited?: boolean;
  upgrade_message?: string;
  max_days_allowed?: number;
  filters_applied?: {
    endpoint: string | null;
    query_type: string | null;
    query_type_prefix: string | null;
    repo_id: string | null;
    conversation_id: string | null;
    categories: string[] | null;
  };
  warning?: string;
}

export interface HistoryListResponse extends PaginatedResponse<HistoryItem> {
  meta?: HistoryListMeta;
}

export interface HistoryItemDetail extends HistoryItem {
  search_params?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export type HistoryItemResponse = BaseResponse<HistoryItemDetail>;

export interface ConversationData {
  conversation_id: string;
  messages: HistoryItem[];
  message_count: number;
}

export type ConversationResponse = BaseResponse<ConversationData>;

// ============================================================================
// Statistics Types
// ============================================================================

export interface UsageByType {
  query_type: string;
  count: number;
  category?: string;
  mode?: string | null;
  cost_credits?: number;
  avg_duration_ms?: number;
  error_count?: number;
}

export interface UsageCategoryAggregate {
  category: string;
  count: number;
  cost_credits?: number;
}

export interface UsageStatsData {
  usage_by_type: UsageByType[];
  usage_by_category?: UsageCategoryAggregate[];
  total_queries: number;
  total_cost_credits?: number;
  error_count?: number;
}

export interface UsageStatsMeta extends Meta {
  range_applied?: string;
  date_range?: {
    from: string;
    to: string;
  };
  /** Set when the requested stats `range` exceeds the tier cap (see GET /v2/stats/*). */
  range_limited?: boolean;
  upgrade_message?: string;
}

export interface UsageStatsResponse extends BaseResponse<UsageStatsData> {
  meta?: UsageStatsMeta;
}

export interface ActivityByDay {
  date: string;
  count: number;
  cost_credits?: number;
  error_count?: number;
}

export interface ActivityStatsData {
  activity_by_day: ActivityByDay[];
  total_queries: number;
  active_days: number;
}

export interface ActivityStatsMeta extends Meta {
  range_applied?: string;
  date_range?: {
    from: string;
    to: string;
  };
  range_limited?: boolean;
  upgrade_message?: string;
}

export interface ActivityStatsResponse extends BaseResponse<ActivityStatsData> {
  meta?: ActivityStatsMeta;
}

export interface LanguageStat {
  language: string;
  /** API / DB may return numeric strings; normalize with `Number(count)`. */
  count: number | string;
}

export interface LanguageStatsData {
  languages: LanguageStat[];
  total_queries: number;
}

export type LanguageStatsResponse = BaseResponse<LanguageStatsData>;

// ============================================================================
// API Key Types
// ============================================================================

export interface ApiKey {
  id: string;
  key: string;
  name?: string | null;
  status: boolean;
  created_at: string;
}

export type ApiKeysListResponse = BaseResponse<ApiKey[]>;

export interface ApiKeyRegenerateData {
  id: string;
  key: string;
  name?: string | null;
  created_at: string;
}

export interface ApiKeyRegenerateResponse extends BaseResponse<ApiKeyRegenerateData> {
  message?: string;
}

export type DeleteResponse = BaseResponse<{
  id: string;
  deleted: boolean;
}>;

// ============================================================================
// V1 Chat Types
// ============================================================================

export interface ChatContext {
  role?: "user" | "assistant" | "system";
  content?: string;
  [key: string]: unknown;
}

export interface ChatRequest {
  prompt: string;
  model?: string;
  embed?: boolean;
  context?: ChatContext[];
  voice?: boolean;
  conversation?: string;
}

export interface ChatKnowledgeRequest extends ChatRequest {
  knowledge_id?: string[];
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface ChatResponse extends BaseResponse {
  response?: string;
  model?: string;
  usage?: ChatUsage;
}

// ============================================================================
// V1 Code Generation Types
// ============================================================================

export interface CodeBlockRequest {
  code_block: string;
  model?: string;
  context?: ChatContext[];
}

export interface ConvertCodeRequest extends CodeBlockRequest {
  language: string;
}

export interface CodeResponse extends BaseResponse {
  response?: string;
  model?: string;
}

// ============================================================================
// V1 Models Types
// ============================================================================

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  tier_required: TierName;
}

export interface ModelsResponse {
  models: AIModel[];
}

// ============================================================================
// Model Limits Types
// ============================================================================

export interface SubscriptionInfo {
  tokens: number;
  bonus_tokens: number;
  expiry_date: string;
}

export interface ModelInfo {
  name: string;
  provider: string;
  max_tokens: number;
  context_length: number;
  vector_search_length: number;
  knowledge_search_length: number;
  knowledge_storage_limit: number;
}

export interface TierLimits {
  history_days: number;
  history_max_records: number;
  repos_max: number;
  files_per_repo_max: number;
  stats_range_max_days: number;
  can_access_org_repos: boolean;
  can_share_to_org: boolean;
}

export interface ModelLimitsData {
  tier: TierName;
  subscription: SubscriptionInfo;
  model?: ModelInfo | null;
  limits: TierLimits;
}

export type ModelLimitsResponse = BaseResponse<ModelLimitsData>;

// ============================================================================
// Client Options Types
// ============================================================================

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  order_by?: string;
  order?: SortOrder;
}

export interface HistoryListOptions extends PaginationOptions {
  from?: string;
  to?: string;
  /** Exact endpoint match, e.g. "v2.search". */
  endpoint?: string;
  /** Exact query_type match, e.g. "search:semantic". */
  query_type?: string;
  /** Prefix match on query_type, e.g. "search:". */
  query_type_prefix?: string;
  /** Filter by repository UUID. */
  repo_id?: string;
  /** Filter to a single conversation thread. */
  conversation_id?: string;
  /** Filter by one or more category prefixes (chat/search/research/files/index). */
  categories?: HistoryCategory[];
}

export interface RepoListOptions extends PaginationOptions {
  scope?: RepoScope;
  /**
   * Case-insensitive substring filter on repository `name`. Null/undefined/empty = no filter.
   * (Server truncates to 200 characters.)
   */
  search?: string | null;
}

export interface FileListOptions extends PaginationOptions {
  /**
   * Case-insensitive substring filter on `file_name` or `file_path`. Null/undefined/empty = no filter.
   * (Server truncates to 200 characters.)
   */
  search?: string | null;
}

// ============================================================================
// Response Cache
// ============================================================================

/**
 * Lightweight client-side cache for GET responses whose data doesn't change
 * often — currently `listRepos` and `listFiles`, both of which cost `FETCH`
 * credits per call (see `creditCosts.js::v2.repos.list` / `v2.files.list`).
 *
 * Layers (in priority order):
 *   1. `memoryCache` — Map<key, entry>. Survives component unmounts / route
 *      transitions within the SPA, cleared on page reload.
 *   2. `localStorage` — **opt-in** (`enableLocalStorage: true`); default is
 *      memory-only so API payloads are not persisted to disk. When enabled,
 *      rapid reloads can still hit the cache; otherwise skipped (SSR, private
 *      mode, quota, etc.).
 *
 * Features:
 *   - In-flight deduplication: N simultaneous callers share the same
 *     Promise, so we never fire two identical requests back-to-back.
 *   - Prefix invalidation: `invalidate('v2/files:')` drops every file list
 *     entry without touching `v2/repos:` entries — used after indexRepo to
 *     drop stale file lists for a specific repo.
 *   - Explicit `forceRefresh` skips both layers and overwrites them with
 *     the fresh response — wired to the UI "Refresh" buttons.
 */
export interface ClientCacheOptions {
  /** TTL for localStorage entries in ms. Memory entries obey the same TTL. Defaults to 10 minutes. */
  ttlMs?: number;
  /** Prefix for localStorage keys. Defaults to `codefundi:cache:`. */
  storagePrefix?: string;
  /** Set to `false` to disable localStorage entirely (memory-only). */
  enableLocalStorage?: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class ClientCache {
  private readonly memoryCache = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly ttlMs: number;
  private readonly storagePrefix: string;
  private readonly storageEnabled: boolean;

  constructor(options: ClientCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.storagePrefix = options.storagePrefix ?? "codefundi:cache:";
    this.storageEnabled =
      (options.enableLocalStorage ?? false) &&
      typeof window !== "undefined" &&
      typeof window.localStorage !== "undefined";
  }

  private readFromStorage<T>(key: string): CacheEntry<T> | undefined {
    if (!this.storageEnabled) return undefined;
    try {
      const raw = window.localStorage.getItem(this.storagePrefix + key);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (parsed == null || typeof parsed !== "object" || typeof parsed.timestamp !== "number") {
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }

  private writeToStorage<T>(key: string, entry: CacheEntry<T>): void {
    if (!this.storageEnabled) return;
    try {
      window.localStorage.setItem(this.storagePrefix + key, JSON.stringify(entry));
    } catch {
      // Quota exceeded / disabled — silently degrade to memory-only.
    }
  }

  private removeFromStorage(key: string): void {
    if (!this.storageEnabled) return;
    try {
      window.localStorage.removeItem(this.storagePrefix + key);
    } catch {
      /* noop */
    }
  }

  private isFresh(entry: CacheEntry<unknown> | undefined): boolean {
    return !!entry && Date.now() - entry.timestamp < this.ttlMs;
  }

  /** Read the cached value for `key` if still fresh, else `undefined`. */
  get<T>(key: string): T | undefined {
    const mem = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (this.isFresh(mem)) return mem!.data;
    if (mem) this.memoryCache.delete(key);

    const stored = this.readFromStorage<T>(key);
    if (this.isFresh(stored)) {
      this.memoryCache.set(key, stored!);
      return stored!.data;
    }
    if (stored) this.removeFromStorage(key);
    return undefined;
  }

  /** Upsert `data` under `key` in both layers. */
  set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    this.memoryCache.set(key, entry);
    this.writeToStorage(key, entry);
  }

  /**
   * Fetch-with-cache. `forceRefresh` skips the cache lookup (but still
   * writes the fresh result). Concurrent callers for the same key share a
   * single Promise so we never duplicate the underlying request.
   */
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, forceRefresh = false): Promise<T> {
    if (!forceRefresh) {
      const cached = this.get<T>(key);
      if (cached !== undefined) return cached;
      const pending = this.inflight.get(key) as Promise<T> | undefined;
      if (pending) return pending;
    }

    const promise = fetcher().then(
      (data) => {
        this.set(key, data);
        this.inflight.delete(key);
        return data;
      },
      (err) => {
        this.inflight.delete(key);
        throw err;
      },
    );
    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Drop cache entries. Pass a key for exact match, a prefix ending with `:`
   * for wildcard, or nothing to clear everything.
   */
  invalidate(keyOrPrefix?: string): void {
    if (!keyOrPrefix) {
      this.memoryCache.clear();
      this.inflight.clear();
      if (this.storageEnabled) {
        try {
          const toDelete: string[] = [];
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const k = window.localStorage.key(i);
            if (k && k.startsWith(this.storagePrefix)) toDelete.push(k);
          }
          toDelete.forEach((k) => window.localStorage.removeItem(k));
        } catch {
          /* noop */
        }
      }
      return;
    }

    const isPrefix = keyOrPrefix.endsWith(":");
    const matches = (k: string): boolean =>
      isPrefix ? k.startsWith(keyOrPrefix) : k === keyOrPrefix;

    for (const k of Array.from(this.memoryCache.keys())) {
      if (matches(k)) this.memoryCache.delete(k);
    }
    for (const k of Array.from(this.inflight.keys())) {
      if (matches(k)) this.inflight.delete(k);
    }
    if (this.storageEnabled) {
      try {
        const toDelete: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const k = window.localStorage.key(i);
          if (!k || !k.startsWith(this.storagePrefix)) continue;
          const stripped = k.slice(this.storagePrefix.length);
          if (matches(stripped)) toDelete.push(k);
        }
        toDelete.forEach((k) => window.localStorage.removeItem(k));
      } catch {
        /* noop */
      }
    }
  }
}

// Cache key prefixes — exported so tests / other modules can reason about
// invalidation without string-matching magic.
export const REPOS_CACHE_PREFIX = "v2/repos:";
export const FILES_CACHE_PREFIX = "v2/files:";

function buildReposCacheKey(options: RepoListOptions, demoForKey: boolean): string {
  return [
    REPOS_CACHE_PREFIX,
    demoForKey ? "d1" : "d0",
    options.scope ?? "all",
    options.search?.trim() ?? "",
    options.limit ?? "default",
    options.offset ?? 0,
    options.order_by ?? "default",
    options.order ?? "default",
  ].join("|");
}

function buildFilesCacheKey(repoKey: FilesRepoPathKey, options: FileListOptions): string {
  return [
    FILES_CACHE_PREFIX,
    String(repoKey ?? ""),
    options.search?.trim() ?? "",
    options.limit ?? "default",
    options.offset ?? 0,
    options.order_by ?? "file_path",
    options.order ?? "default",
  ].join("|");
}

function buildFilesRepoPrefix(repoKey: FilesRepoPathKey): string {
  return `${FILES_CACHE_PREFIX}${String(repoKey ?? "")}|`;
}

/** Optional overrides for cached GET methods. */
export interface CachedRequestOptions {
  /** Skip cache read + overwrite the cached value with the fresh response. */
  forceRefresh?: boolean;
  /** Skip both cache read + write — use for one-off transient fetches. */
  skipCache?: boolean;
  /**
   * When set, controls whether `demo=true` is appended for this request only (and the repos
   * cache key). When omitted, {@link CodeFundiAPIClient} uses its configured `demoMode`.
   */
  overrideDemo?: boolean;
}

// ============================================================================
// API Client Implementation
// ============================================================================

export class CodeFundiAPIClient {
  private readonly config: CodeFundiConfig;

  /**
   * Shared response cache for credit-billable GETs (listRepos / listFiles).
   * Exposed as `public readonly` so components can drop entries explicitly
   * (e.g. the Refresh button on `/dashboard/history`) or inspect invalidation
   * state in tests.
   */
  public readonly cache: ClientCache;

  constructor(config: CodeFundiConfig, cacheOptions?: ClientCacheOptions) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      apiKey: config.apiKey,
      demoMode: config.demoMode ?? false,
    };
    this.cache = new ClientCache(cacheOptions);
  }

  // --------------------------------------------------------------------------
  // Private Helper Methods
  // --------------------------------------------------------------------------

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["X-API-Key"] = this.config.apiKey;
    }

    return headers;
  }

  private buildQueryString(params: Record<string, unknown>, includeDemo?: boolean): string {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }

    const useDemo = includeDemo !== undefined ? includeDemo : this.config.demoMode;
    if (useDemo) {
      searchParams.append("demo", "true");
    }

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : "";
  }

  /**
   * Combines fundiAI / SupaGet JSON error shapes into one message for {@link CodeFundiAPIError}.
   * Surfaces `details`, nested `error.message`, and `code` alongside `message` (many indexing
   * failures only had a generic `message` before this merge).
   */
  private mergeHttpErrorParts(body: Record<string, unknown>, fallbackStatusLine: string): string {
    const segments: string[] = [];

    const pushDistinct = (s: string | undefined): void => {
      const t = s?.trim();
      if (!t) return;
      if (segments.some((seg) => seg === t)) return;
      segments.push(t);
    };

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (code) {
      pushDistinct(`[${code}]`);
    }

    pushDistinct(typeof body.message === "string" ? body.message : undefined);

    if (typeof body.details === "string") {
      pushDistinct(body.details);
    }

    const nested = body.error;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nm = (nested as Record<string, unknown>).message;
      if (typeof nm === "string") {
        pushDistinct(nm);
      }
    }

    if (segments.length === 0) {
      return fallbackStatusLine;
    }

    return segments.join(" — ");
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    isStreaming = false,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = {
      ...this.getHeaders(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let body: Record<string, unknown> = {};
      try {
        const parsed = await response.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        /* non-JSON error bodies fall through with empty `body` */
      }
      const fallbackLine = `${response.status} ${response.statusText}`;
      const errorMessage = this.mergeHttpErrorParts(body, fallbackLine);
      const code = typeof body.code === "string" ? body.code : undefined;
      throw new CodeFundiAPIError(errorMessage, response.status, {
        code,
        body: Object.keys(body).length > 0 ? body : undefined,
      });
    }

    if (isStreaming) {
      return response.body as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * POST JSON without attaching X-API-Key (used for /v2/auth/*).
   * Parses `{ status, code, message, retry_after? }` error bodies into {@link CodeFundiAPIError}.
   */
  private async postJsonUnauthenticated<T>(
    endpoint: string,
    body: unknown,
    extraHeaders?: HeadersInit,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    };
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    let json: unknown = {};
    try {
      json = await response.json();
    } catch {
      json = {};
    }
    if (!response.ok) {
      const errBody = json as Partial<V2AuthErrorBody> & { message?: string };
      const errorMessage = errBody.message || `${response.status} ${response.statusText}`;
      const bodyObj =
        json && typeof json === "object" && !Array.isArray(json)
          ? (json as Record<string, unknown>)
          : undefined;
      throw new CodeFundiAPIError(errorMessage, response.status, {
        code: typeof errBody.code === "string" ? errBody.code : undefined,
        retryAfter: typeof errBody.retry_after === "number" ? errBody.retry_after : undefined,
        body: bodyObj,
      });
    }
    return json as T;
  }

  private mergeV2AuthClientHeaders(
    base: Record<string, string>,
    options?: V2AuthClientRequestOptions,
  ): Record<string, string> {
    const out = { ...base };
    if (options?.idempotencyKey) {
      out["Idempotency-Key"] = options.idempotencyKey;
    }
    if (options?.fingerprint) {
      out["X-Fingerprint"] = options.fingerprint;
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // NDJSON Stream Parsing
  // --------------------------------------------------------------------------

  /**
   * Parse an NDJSON stream and invoke callbacks for each chunk type.
   */
  async parseNDJSONStream(
    stream: ReadableStream<Uint8Array>,
    callbacks: {
      onSearch?: (chunk: NDJSONSearchChunk) => void;
      onChunk?: (chunk: NDJSONTextChunk) => void;
      onDone?: (chunk: NDJSONDoneChunk) => void;
      onError?: (chunk: NDJSONErrorChunk) => void;
      onRaw?: (data: NDJSONChunk) => void;
    },
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line) as NDJSONChunk;

              if (callbacks.onRaw) {
                callbacks.onRaw(data);
              }

              switch (data.type) {
                case "search":
                  if (callbacks.onSearch) callbacks.onSearch(data);
                  break;
                case "chunk":
                  if (callbacks.onChunk) callbacks.onChunk(data);
                  break;
                case "done":
                  if (callbacks.onDone) callbacks.onDone(data);
                  break;
                case "error":
                  if (callbacks.onError) callbacks.onError(data);
                  break;
              }
            } catch (e) {
              console.warn("Failed to parse NDJSON line:", line);
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer) as NDJSONChunk;

          if (callbacks.onRaw) {
            callbacks.onRaw(data);
          }

          switch (data.type) {
            case "search":
              if (callbacks.onSearch) callbacks.onSearch(data);
              break;
            case "chunk":
              if (callbacks.onChunk) callbacks.onChunk(data);
              break;
            case "done":
              if (callbacks.onDone) callbacks.onDone(data);
              break;
            case "error":
              if (callbacks.onError) callbacks.onError(data);
              break;
          }
        } catch (e) {
          console.warn("Failed to parse remaining buffer:", buffer);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Collect all text chunks from an NDJSON stream into a single string.
   */
  async collectStreamText(stream: ReadableStream<Uint8Array>): Promise<{
    text: string;
    searchResults?: SearchResult[];
    model?: string;
    contextFiles?: number;
  }> {
    let text = "";
    let searchResults: SearchResult[] | undefined;
    let model: string | undefined;
    let contextFiles: number | undefined;

    await this.parseNDJSONStream(stream, {
      onSearch: (chunk) => {
        searchResults = chunk.results;
      },
      onChunk: (chunk) => {
        text += chunk.text;
      },
      onDone: (chunk) => {
        model = chunk.model;
        contextFiles = chunk.context_files;
      },
    });

    return { text, searchResults, model, contextFiles };
  }

  // --------------------------------------------------------------------------
  // V1 API Endpoints - Status
  // --------------------------------------------------------------------------

  /**
   * Get API status.
   */
  async getStatus(): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/v1/fundi`, {
      headers: this.getHeaders(),
    });
    return response.text();
  }

  // --------------------------------------------------------------------------
  // V1 API Endpoints - Models
  // --------------------------------------------------------------------------

  /**
   * List available AI models.
   */
  async getModels(): Promise<ModelsResponse> {
    return this.makeRequest<ModelsResponse>("/v1/fundi/models", { method: "GET" });
  }

  // --------------------------------------------------------------------------
  // V1 API Endpoints - AI Chat
  // --------------------------------------------------------------------------

  /**
   * Send a chat message to the AI.
   * Returns streaming response if the API streams, otherwise JSON.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.makeRequest<ChatResponse>("/v1/fundi/chat", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Send a chat message with knowledge base context.
   */
  async chatWithKnowledge(request: ChatKnowledgeRequest): Promise<ChatResponse> {
    return this.makeRequest<ChatResponse>("/v1/fundi/chat/knowledge", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Chat with streaming response.
   */
  async chatStream(request: ChatRequest): Promise<ReadableStream<Uint8Array> | null> {
    const stream = await this.makeRequest<ReadableStream<Uint8Array>>(
      "/v1/fundi/chat",
      {
        method: "POST",
        body: JSON.stringify(request),
      },
      true,
    );
    return stream;
  }

  // --------------------------------------------------------------------------
  // V1 API Endpoints - Code Generation
  // --------------------------------------------------------------------------

  /**
   * Get an AI explanation for a code block.
   */
  async explainCode(request: CodeBlockRequest): Promise<CodeResponse> {
    return this.makeRequest<CodeResponse>("/v1/fundi/explain", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get optimization suggestions for a code block.
   */
  async optimizeCode(request: CodeBlockRequest): Promise<CodeResponse> {
    return this.makeRequest<CodeResponse>("/v1/fundi/optimize", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get debugging suggestions for a code block.
   */
  async debugCode(request: CodeBlockRequest): Promise<CodeResponse> {
    return this.makeRequest<CodeResponse>("/v1/fundi/debug", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Generate comments for a code block.
   */
  async commentCode(request: CodeBlockRequest): Promise<CodeResponse> {
    return this.makeRequest<CodeResponse>("/v1/fundi/comment", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Convert code from one language to another.
   */
  async convertCode(request: ConvertCodeRequest): Promise<CodeResponse> {
    return this.makeRequest<CodeResponse>("/v1/fundi/convert", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // --------------------------------------------------------------------------
  // V1 API Endpoints - History (Legacy)
  // --------------------------------------------------------------------------

  /**
   * Get user history (legacy endpoint).
   * Use V2 history endpoints for pagination support.
   */
  async getHistoryLegacy(): Promise<BaseResponse<HistoryItem[]>> {
    return this.makeRequest<BaseResponse<HistoryItem[]>>("/v1/fundi/history", {
      method: "POST",
      body: JSON.stringify({ api_key: this.config.apiKey }),
    });
  }

  // --------------------------------------------------------------------------
  // V2 API Endpoints - Auth (`POST /v2/auth/authenticate`, `/verify`, `/resend`)
  // --------------------------------------------------------------------------

  /**
   * `POST /v2/auth/authenticate` — start OTP email or password sign-up / sign-in.
   *
   * - **OTP:** `auth_mode: "otp"`, `should_create_user` true (register) or false (returning).
   * - **Password:** same path with `auth_mode: "password"`; set `authPassword` (sent as
   *   `X-CodeFundi-Auth-Password` by default, or `X-Auth-Password` when `request.passwordHeader` is set).
   * - Body may use **`mode`** instead of **`auth_mode`** (server accepts both); this client sends `auth_mode` when provided.
   */
  async authAuthenticate(
    params: {
      /** Preferred; if omitted, `mode` is used when set. */
      auth_mode?: V2AuthMode;
      /** Alias for `auth_mode` (matches API `mode` field). */
      mode?: V2AuthMode;
      email: string;
      should_create_user?: boolean;
      data?: Record<string, unknown>;
      authPassword?: string;
    },
    request?: V2AuthClientRequestOptions,
  ): Promise<V2AuthAuthenticateResponse> {
    const authMode = params.auth_mode ?? params.mode;
    if (!authMode) {
      throw new TypeError("authAuthenticate requires auth_mode or mode");
    }
    const passHeaderName =
      request?.passwordHeader === "x-auth-password"
        ? "X-Auth-Password"
        : "X-CodeFundi-Auth-Password";

    const headers: Record<string, string> = {};
    if (authMode === "password" && params.authPassword) {
      headers[passHeaderName] = params.authPassword;
    }
    const body: Record<string, unknown> = {
      auth_mode: authMode,
      email: params.email,
      should_create_user: Boolean(params.should_create_user),
    };
    if (params.data) {
      body.data = params.data;
    }
    return this.postJsonUnauthenticated<V2AuthAuthenticateResponse>(
      "/v2/auth/authenticate",
      body,
      this.mergeV2AuthClientHeaders(headers, request),
    );
  }

  /**
   * `POST /v2/auth/verify` — exchange email + 6-digit OTP for a session; activates `api_key` when the server is configured.
   */
  async authVerify(
    params: { email: string; token: string },
    request?: V2AuthClientRequestOptions,
  ): Promise<V2AuthVerifyResponse> {
    return this.postJsonUnauthenticated<V2AuthVerifyResponse>(
      "/v2/auth/verify",
      {
        email: params.email,
        token: params.token,
      },
      this.mergeV2AuthClientHeaders({}, request),
    );
  }

  /**
   * `POST /v2/auth/resend` — Supabase `auth.resend` wrapper (`type` defaults to `signup`).
   */
  async authResend(
    params: {
      email: string;
      type?: "signup" | "email_change" | "email";
    },
    request?: V2AuthClientRequestOptions,
  ): Promise<V2AuthResendResponse> {
    return this.postJsonUnauthenticated<V2AuthResendResponse>(
      "/v2/auth/resend",
      {
        email: params.email,
        type: params.type ?? "signup",
      },
      this.mergeV2AuthClientHeaders({}, request),
    );
  }

  // --------------------------------------------------------------------------
  // V2 API Endpoints - Search
  // --------------------------------------------------------------------------

  /**
   * Unified search across repositories, files, and code (POST /v2/search).
   * Use `scan_mode` for semantic vs grep_docs vs grep_code; optional `fields` controls documentation shape (`raw` is ADMIN-only).
   * If chat=true, use searchWithChat for streaming response.
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const queryParams = this.buildQueryString({});
    return this.makeRequest<SearchResponse>(`/v2/search${queryParams}`, {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Search with AI chat mode (streaming NDJSON response).
   */
  async searchWithChat(
    request: Omit<SearchRequest, "chat"> & { chat?: true; model?: string },
  ): Promise<ReadableStream<Uint8Array> | null> {
    const queryParams = this.buildQueryString({});
    const body = { ...request, chat: true };

    const stream = await this.makeRequest<ReadableStream<Uint8Array>>(
      `/v2/search${queryParams}`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      true,
    );
    return stream;
  }

  // --------------------------------------------------------------------------
  // V2 API Endpoints - Repositories
  // --------------------------------------------------------------------------

  /**
   * List repositories. Cached in memory + localStorage (see `ClientCache`
   * for the full TTL / invalidation contract) to avoid burning the `FETCH`
   * credit on `v2.repos.list` for every component that needs the list.
   *
   * Pass `{ forceRefresh: true }` when the user explicitly triggers a
   * refresh (e.g. the Refresh button on /dashboard/history) or right after
   * a mutation that's known to add repos outside of `indexRepo` (rare).
   * Pass `{ skipCache: true }` to bypass both read + write for one-offs.
   */
  async listRepos(
    options: RepoListOptions = {},
    cacheOptions: CachedRequestOptions = {},
  ): Promise<RepositoryListResponse> {
    const effectiveDemo =
      cacheOptions.overrideDemo !== undefined
        ? cacheOptions.overrideDemo
        : (this.config.demoMode ?? false);

    const fetcher = (): Promise<RepositoryListResponse> => {
      const queryParams = this.buildQueryString(
        {
          scope: options.scope,
          search: options.search,
          limit: options.limit,
          offset: options.offset,
          order_by: options.order_by,
          order: options.order,
        },
        effectiveDemo,
      );
      return this.makeRequest<RepositoryListResponse>(`/v2/repos${queryParams}`, { method: "GET" });
    };

    if (cacheOptions.skipCache) return fetcher();
    return this.cache.getOrFetch(
      buildReposCacheKey(options, effectiveDemo),
      fetcher,
      cacheOptions.forceRefresh ?? false,
    );
  }

  /**
   * Index a new repository. Invalidates every cached repos list (a new
   * source is visible regardless of scope/ordering) and every cached file
   * list (files lists are scoped to a repo and a freshly-indexed repo
   * will populate asynchronously).
   */
  async indexRepo(request: IndexRepoRequest): Promise<IndexRepoResponse> {
    const queryParams = this.buildQueryString({});
    const response = await this.makeRequest<IndexRepoResponse>(
      `/v2/repos/index/new${queryParams}`,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
    this.cache.invalidate(REPOS_CACHE_PREFIX);
    this.cache.invalidate(FILES_CACHE_PREFIX);
    sessionDataInvalidatePrefix("repos:");
    return response;
  }

  /**
   * Get repository indexing status.
   */
  async getRepoStatus(request: RepoStatusRequest): Promise<RepoStatusResponse> {
    return this.makeRequest<RepoStatusResponse>("/v2/repos/status", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get repository README.
   * @param repoKey - Source UUID or raw clone URL (same path encoding as {@link CodeFundiAPIClient.listFiles} / OpenAPI RepoId).
   */
  async getRepoReadme(repoKey: FilesRepoPathKey): Promise<ReadmeResponse> {
    const segment = encodeRepoKeyForV2FilesPath(repoKey);
    const queryParams = this.buildQueryString({});
    return this.makeRequest<ReadmeResponse>(`/v2/repos/${segment}/readme${queryParams}`, {
      method: "GET",
    });
  }

  /**
   * Get a CodeFundi repo blueprint (README, deps, conventions) when already indexed.
   * @param repoKey - Source UUID or raw clone URL (same path encoding as {@link CodeFundiAPIClient.getRepoReadme}).
   */
  async getRepoBlueprint(repoKey: FilesRepoPathKey): Promise<BlueprintResponse> {
    const segment = encodeRepoKeyForV2FilesPath(repoKey);
    const queryParams = this.buildQueryString({});
    return this.makeRequest<BlueprintResponse>(`/v2/repos/${segment}/blueprint${queryParams}`, {
      method: "GET",
    });
  }

  // --------------------------------------------------------------------------
  // V2 API Endpoints - Files
  // --------------------------------------------------------------------------

  /**
   * List files in a repository. Cached in memory + localStorage (see
   * `ClientCache`) — each call would otherwise cost `FETCH` credits on
   * `v2.files.list`, and the file tree only changes when the repo is
   * re-indexed (which invalidates this cache via `indexRepo`).
   *
   * @param repoKey - Source UUID or raw clone URL (non-UUID values are encoded for a single path segment).
   */
  async listFiles(
    repoKey: FilesRepoPathKey,
    options: FileListOptions = {},
    cacheOptions: CachedRequestOptions = {},
  ): Promise<FileListResponse> {
    const fetcher = (): Promise<FileListResponse> => {
      const segment = encodeRepoKeyForV2FilesPath(repoKey);
      const queryParams = this.buildQueryString({
        search: options.search,
        limit: options.limit,
        offset: options.offset,
        order_by: options.order_by ?? "file_path",
        order: options.order,
      });
      return this.makeRequest<FileListResponse>(`/v2/files/${segment}${queryParams}`, {
        method: "GET",
      });
    };

    if (cacheOptions.skipCache) return fetcher();
    return this.cache.getOrFetch(
      buildFilesCacheKey(repoKey, options),
      fetcher,
      cacheOptions.forceRefresh ?? false,
    );
  }

  /**
   * Drop every cached entry for `/v2/repos` (all scopes / pages / orderings).
   * Call this after any client-side action that changes repo membership
   * outside of `indexRepo` (share/unshare, delete).
   */
  invalidateReposCache(): void {
    this.cache.invalidate(REPOS_CACHE_PREFIX);
    sessionDataInvalidatePrefix("repos:");
  }

  /**
   * Drop cached `/v2/files` entries. Pass `repoKey` to invalidate a single
   * repo; pass nothing to drop every file list.
   */
  invalidateFilesCache(repoKey?: FilesRepoPathKey): void {
    if (repoKey) {
      this.cache.invalidate(buildFilesRepoPrefix(repoKey));
    } else {
      this.cache.invalidate(FILES_CACHE_PREFIX);
    }
  }

  /**
   * Get file documentation.
   * @param repoKey - Source UUID or raw clone URL (same rules as {@link CodeFundiAPIClient.listFiles}).
   */
  async getFileDocumentation(
    repoKey: FilesRepoPathKey,
    fileId: string,
    fields: SearchFieldsParam = "full",
  ): Promise<FileDocumentationResponse> {
    const segment = encodeRepoKeyForV2FilesPath(repoKey);
    const queryParams = this.buildQueryString({ fields });
    return this.makeRequest<FileDocumentationResponse>(
      `/v2/files/${segment}/${fileId}${queryParams}`,
      { method: "GET" },
    );
  }

  // --------------------------------------------------------------------------
  // V2 API Endpoints - History
  // --------------------------------------------------------------------------

  /**
   * List query history with pagination and date filtering.
   */
  async listHistory(options: HistoryListOptions = {}): Promise<HistoryListResponse> {
    const queryParams = this.buildQueryString({
      limit: options.limit,
      offset: options.offset,
      from: options.from,
      to: options.to,
      endpoint: options.endpoint,
      query_type: options.query_type,
      query_type_prefix: options.query_type_prefix,
      repo_id: options.repo_id,
      conversation_id: options.conversation_id,
      // Backend accepts a comma-separated list of category prefixes.
      categories:
        Array.isArray(options.categories) && options.categories.length > 0
          ? options.categories.join(",")
          : undefined,
    });
    return this.makeRequest<HistoryListResponse>(`/v2/history${queryParams}`, { method: "GET" });
  }

  /**
   * Get a single history item by ID.
   */
  async getHistoryItem(historyId: string): Promise<HistoryItemResponse> {
    return this.makeRequest<HistoryItemResponse>(`/v2/history/${historyId}`, { method: "GET" });
  }

  /**
   * Get all messages in a conversation thread.
   */
  async getConversation(conversationId: string): Promise<ConversationResponse> {
    return this.makeRequest<ConversationResponse>(`/v2/history/conversation/${conversationId}`, {
      method: "GET",
    });
  }

  // --------------------------------------------------------------------------
  // V2 API Endpoints - Statistics
  // --------------------------------------------------------------------------

  /**
   * Get query type usage statistics.
   */
  async getUsageStats(range: StatsRange = "7d"): Promise<UsageStatsResponse> {
    const queryParams = this.buildQueryString({ range });
    return this.makeRequest<UsageStatsResponse>(`/v2/stats/usage${queryParams}`, { method: "GET" });
  }

  /**
   * Get daily activity statistics.
   */
  async getActivityStats(range: StatsRange = "7d"): Promise<ActivityStatsResponse> {
    const queryParams = this.buildQueryString({ range });
    return this.makeRequest<ActivityStatsResponse>(`/v2/stats/activity${queryParams}`, {
      method: "GET",
    });
  }

  /**
   * Get programming language usage statistics.
   */
  async getLanguageStats(): Promise<LanguageStatsResponse> {
    return this.makeRequest<LanguageStatsResponse>("/v2/stats/languages", { method: "GET" });
  }

  // --------------------------------------------------------------------------
  // V2 API Endpoints - API Keys
  // --------------------------------------------------------------------------

  /**
   * List all API keys (masked).
   */
  async listApiKeys(): Promise<ApiKeysListResponse> {
    return this.makeRequest<ApiKeysListResponse>("/v2/keys", { method: "GET" });
  }

  /**
   * Regenerate API key. The full key is only shown once.
   */
  async regenerateApiKey(): Promise<ApiKeyRegenerateResponse> {
    return this.makeRequest<ApiKeyRegenerateResponse>("/v2/keys/regenerate", { method: "POST" });
  }

  /**
   * Disable an API key.
   */
  async disableApiKey(keyId: string): Promise<DeleteResponse> {
    return this.makeRequest<DeleteResponse>(`/v2/keys/${keyId}`, { method: "DELETE" });
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Update the API key.
   */
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  /**
   * Enable or disable demo mode.
   */
  setDemoMode(enabled: boolean): void {
    this.config.demoMode = enabled;
  }

  /**
   * Get the current configuration (without sensitive data).
   */
  getConfig(): Omit<CodeFundiConfig, "apiKey"> & { hasApiKey: boolean } {
    return {
      baseUrl: this.config.baseUrl,
      demoMode: this.config.demoMode,
      hasApiKey: !!this.config.apiKey,
    };
  }

  /**
   * Check if pagination has more results.
   */
  hasMoreResults(pagination?: Pagination): boolean {
    return pagination?.has_more ?? false;
  }

  /**
   * Calculate the next offset for pagination.
   */
  getNextOffset(pagination?: Pagination): number {
    if (!pagination) return 0;
    return pagination.offset + pagination.limit;
  }

  /**
   * Validate and constrain limit value.
   */
  validateLimit(limit: number, min = 1, max = 100): number {
    return Math.min(Math.max(limit, min), max);
  }
}

// ============================================================================
// Custom Error Class
// ============================================================================

export class CodeFundiAPIError extends Error {
  public readonly statusCode: number;
  /** Populated for `/v2/auth/*` JSON errors when the server returns `code`. */
  public readonly code?: string;
  /** Populated for HTTP 429 when the server returns `retry_after` (seconds). */
  public readonly retryAfter?: number;
  /** Parsed JSON error body from `makeRequest` when the server returned JSON. */
  public readonly body?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    meta?: { code?: string; retryAfter?: number; body?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "CodeFundiAPIError";
    this.statusCode = statusCode;
    this.code = meta?.code;
    this.retryAfter = meta?.retryAfter;
    this.body = meta?.body;
  }

  /**
   * Check if the error is an authentication error.
   */
  isAuthError(): boolean {
    return this.statusCode === 401;
  }

  /**
   * Check if the error is a forbidden/permission error.
   */
  isForbiddenError(): boolean {
    return this.statusCode === 403;
  }

  /**
   * Check if the error is a not found error.
   */
  isNotFoundError(): boolean {
    return this.statusCode === 404;
  }

  /**
   * Check if the error is an insufficient credits error.
   */
  isInsufficientCreditsError(): boolean {
    return this.statusCode === 402;
  }

  /**
   * Demo / anonymous daily credits exhausted — server may use HTTP 402 with `code: "DEMO_CREDITS_EXHAUSTED"`.
   */
  isDemoCreditsExhaustedError(): boolean {
    const c = this.code ?? (typeof this.body?.code === "string" ? (this.body.code as string) : "");
    return c === "DEMO_CREDITS_EXHAUSTED";
  }

  /**
   * Check if the error is a rate limit error.
   */
  isRateLimitError(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Check if the error is a server error.
   */
  isServerError(): boolean {
    return this.statusCode >= 500;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new CodeFundi API client instance.
 */
export function createCodeFundiClient(config: CodeFundiConfig): CodeFundiAPIClient {
  return new CodeFundiAPIClient(config);
}

// ============================================================================
// Default Export
// ============================================================================

export default CodeFundiAPIClient;
