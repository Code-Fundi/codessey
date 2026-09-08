import { describe, expect, it } from "vitest";
import { buildLandscapePrompt, compileLandscapeScene, parseRepoOwner } from "./prompts";
import type { FileListItem, RepositoryIndexInitRepo } from "./codefundi.client";

function index(
  partial: Partial<RepositoryIndexInitRepo> & { url: string },
): RepositoryIndexInitRepo {
  return {
    branch: "main",
    data_source_id: null,
    description: null,
    total_files: partial.files?.index.length ?? 2,
    files: { tree: null, index: [] },
    ...partial,
  };
}

describe("parseRepoOwner", () => {
  it("reads https GitHub URLs", () => {
    expect(parseRepoOwner("https://github.com/rauchg/blog")).toBe("rauchg");
  });

  it("reads ssh GitHub URLs", () => {
    expect(parseRepoOwner("git@github.com:FelixWaweru/codessey.git")).toBe("FelixWaweru");
  });

  it("reads owner/repo shorthand", () => {
    expect(parseRepoOwner("code-Fundi/codessey")).toBe("code-Fundi");
  });

  it("falls back when empty", () => {
    expect(parseRepoOwner("")).toBe("owner");
  });
});

describe("buildLandscapePrompt", () => {
  const frontend: RepositoryIndexInitRepo = index({
    url: "https://github.com/code-Fundi/codessey",
    description: "Turn a repo into a walkable world",
    total_files: 40,
    files: {
      tree: null,
      index: [
        { path: "src/app/page.tsx", name: "page.tsx", language: "tsx", ext: "tsx" },
        { path: "src/lib/credits.ts", name: "credits.ts", language: "ts", ext: "ts" },
        { path: "src/components/Header.tsx", name: "Header.tsx", language: "tsx", ext: "tsx" },
      ],
    },
  });

  it("stays within the World Labs 2000-character cap", () => {
    expect(buildLandscapePrompt(frontend).length).toBeLessThanOrEqual(2000);
  });

  it("asks for an outdoor landscape, not a UI mockup", () => {
    const prompt = buildLandscapePrompt(frontend);
    expect(prompt).toMatch(/outdoor landscape/i);
    expect(prompt).toMatch(/Not an indoor office/);
  });

  it("embeds the CodeFundi description and file count", () => {
    const prompt = buildLandscapePrompt(frontend);
    expect(prompt).toMatch(/walkable terrain/);
    expect(prompt).toMatch(/40 files/);
    expect(prompt).toMatch(/tsx:/);
  });

  it("is stable for the same CodeFundi payload", () => {
    expect(buildLandscapePrompt(frontend)).toBe(buildLandscapePrompt(frontend));
  });

  it("grows the settlement when CodeFundi reports more files", () => {
    const small = compileLandscapeScene({
      index: index({
        url: "https://github.com/acme/cli",
        total_files: 8,
        files: {
          tree: null,
          index: [{ path: "bin/cli.go", name: "cli.go", language: "go", ext: "go" }],
        },
      }),
    });
    const huge = compileLandscapeScene({
      index: index({
        url: "https://github.com/acme/monorepo",
        total_files: 1400,
        files: {
          tree: null,
          index: [
            { path: "apps/web/page.tsx", name: "page.tsx", language: "tsx", ext: "tsx" },
            { path: "services/api/main.go", name: "main.go", language: "go", ext: "go" },
            { path: "infra/helm/chart.yaml", name: "chart.yaml", language: "yaml", ext: "yaml" },
          ],
        },
      }),
    });
    expect(small.buildingCount).toBeLessThan(huge.buildingCount);
    expect(huge.scale).toMatch(/metropolis|city/i);
  });

  it("compiles different stacks into different architecture and landform", () => {
    const rust = compileLandscapeScene({
      index: index({
        url: "https://github.com/oxidize/foundry",
        description: "Embedded firmware runtime",
        total_files: 90,
        files: {
          tree: null,
          index: [
            { path: "Cargo.toml", name: "Cargo.toml", language: "toml", ext: "toml" },
            { path: "src/main.rs", name: "main.rs", language: "rust", ext: "rs" },
            { path: "src/hal/clock.rs", name: "clock.rs", language: "rust", ext: "rs" },
          ],
        },
      }),
    });
    const react = compileLandscapeScene({ index: frontend });
    expect(rust.architecture).not.toBe(react.architecture);
    expect(rust.biome).not.toBe(react.biome);
    expect(rust.prompt).not.toBe(react.prompt);
    expect(rust.prompt).not.toMatch(/lighthouse/i);
    expect(react.prompt).not.toMatch(/lighthouse/i);
  });

  it("turns CodeFundi documented dependencies into landmarks", () => {
    const documented: FileListItem[] = [
      {
        id: "1",
        file_name: "page.tsx",
        file_path: "src/app/page.tsx",
        file_branch: "main",
        file_size_kb: 12,
        description: "Home canvas that loads public worlds",
        dependencies: ["next", "react", "supabase"],
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const scene = compileLandscapeScene({ index: frontend, documentedFiles: documented });
    expect(scene.landmarks.join(" ")).toMatch(/gallery|balcony|cloister/i);
    expect(scene.prompt).toMatch(/File notes from CodeFundi/);
    expect(scene.prompt).toMatch(/Home canvas/);
  });

  it("does not collapse two different repos into the same scene", () => {
    const a = buildLandscapePrompt(
      index({
        url: "https://github.com/alice/notes",
        description: "Personal markdown garden",
        total_files: 22,
        files: {
          tree: null,
          index: [
            { path: "notes/day-one.md", name: "day-one.md", language: "markdown", ext: "md" },
            { path: "notes/maps.md", name: "maps.md", language: "markdown", ext: "md" },
          ],
        },
      }),
    );
    const b = buildLandscapePrompt(
      index({
        url: "https://github.com/bruno/payments",
        description: "Card vault and settlement rails",
        total_files: 220,
        files: {
          tree: null,
          index: [
            { path: "api/charge.go", name: "charge.go", language: "go", ext: "go" },
            { path: "internal/vault/token.go", name: "token.go", language: "go", ext: "go" },
            { path: "deploy/helm/values.yaml", name: "values.yaml", language: "yaml", ext: "yaml" },
          ],
        },
      }),
    );
    expect(a).not.toBe(b);
  });

  it("does not throw when CodeFundi dependencies are objects", () => {
    const documented: FileListItem[] = [
      {
        id: "1",
        file_name: "page.tsx",
        file_path: "src/app/page.tsx",
        file_branch: "main",
        file_size_kb: 12,
        description: "Home canvas",
        dependencies: [{ name: "react" } as never],
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(() =>
      compileLandscapeScene({ index: frontend, documentedFiles: documented }),
    ).not.toThrow();
  });

  it("turns notable index files into named buildings and skips lockfiles", () => {
    const scene = compileLandscapeScene({
      index: index({
        url: "https://github.com/acme/app",
        total_files: 12,
        files: {
          tree: null,
          index: [
            {
              path: "src/components/WorldViewer.tsx",
              name: "WorldViewer.tsx",
              language: "tsx",
              ext: "tsx",
              sizeBytes: 40_000,
            },
            {
              path: "src/lib/prompts.ts",
              name: "prompts.ts",
              language: "ts",
              ext: "ts",
              sizeBytes: 30_000,
            },
            {
              path: "package-lock.json",
              name: "package-lock.json",
              language: "json",
              ext: "json",
              sizeBytes: 400_000,
            },
            {
              path: "node_modules/react/index.js",
              name: "index.js",
              language: "js",
              ext: "js",
              sizeBytes: 80_000,
            },
          ],
        },
      }),
    });
    expect(scene.prompt).toMatch(/Named buildings from notable files/);
    expect(scene.prompt).toMatch(/WorldViewer keep \(tsx\)/);
    expect(scene.prompt).toMatch(/prompts mill \(ts\)/);
    const named = scene.prompt.match(/Named buildings from notable files: ([^.]+)/)?.[1] ?? "";
    expect(named).not.toMatch(/package-lock|node_modules/);
    expect(scene.prompt.length).toBeLessThanOrEqual(2000);
  });
});
