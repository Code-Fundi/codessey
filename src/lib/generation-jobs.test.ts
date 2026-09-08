import { describe, expect, it } from "vitest";
import type { WorldRow } from "./database.types";
import { jobFromWorldRow, jobLabel, upsertGenerationJob } from "./generation-jobs";

function row(over: Partial<WorldRow>): WorldRow {
  return {
    id: "a",
    user_id: null,
    repo_url: "https://github.com/acme/one",
    branch: "main",
    repo_name: "one",
    world_labs_id: "pending:op",
    splat_url: null,
    thumbnail_url: null,
    caption: null,
    marble_url: null,
    pano_url: null,
    is_public: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    status: "pending",
    ...over,
  };
}

describe("generation jobs", () => {
  it("labels owner/repo from a github url", () => {
    expect(jobLabel("https://github.com/acme/codessey")).toBe("acme/codessey");
  });

  it("upserts by id and keeps the newest first", () => {
    const first = jobFromWorldRow(row({ id: "a", status: "pending" }));
    const second = jobFromWorldRow(
      row({ id: "b", repo_url: "https://github.com/acme/two", status: "pending" }),
    );
    const updated = jobFromWorldRow(row({ id: "a", status: "complete" }));
    const next = upsertGenerationJob(upsertGenerationJob([first], second), updated);
    expect(next.map((job) => job.id)).toEqual(["a", "b"]);
    expect(next[0]?.status).toBe("complete");
  });
});
