import type { Repository, RepositoryListResponse } from "./codefundi.client";
import { REPOS_PER_PAGE } from "./api";
import mockReposPayload from "../data/mock-repos.json";

type MockReposPayload = {
  status: "success" | "error";
  data: Repository[];
  pagination?: {
    limit?: number;
    offset?: number;
    has_next?: boolean;
    has_prev?: boolean;
    total?: number;
    nextToken?: string;
  };
  meta?: RepositoryListResponse["meta"];
};

const raw = mockReposPayload as MockReposPayload | { default: MockReposPayload };
const payload: MockReposPayload =
  "data" in raw && Array.isArray(raw.data) ? raw : (raw as { default: MockReposPayload }).default;
const ALL_REPOS: Repository[] = payload.data ?? [];

/** Paginated repo list from hardcoded demo data (no CodeFundi listRepos call). */
export function listMockRepos(params: { limit?: number; offset?: number }): RepositoryListResponse {
  const limit = params.limit ?? REPOS_PER_PAGE;
  const offset = params.offset ?? 0;
  const page = ALL_REPOS.slice(offset, offset + limit);
  const hasMore = offset + page.length < ALL_REPOS.length;

  return {
    status: "success",
    data: page,
    pagination: {
      limit,
      offset,
      has_more: hasMore,
      total: ALL_REPOS.length,
    },
    meta: payload.meta,
  };
}
