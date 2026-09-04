import type { FileListItem, RepositoryIndexInitRepo, RepoIndexFileEntry } from "./codefundi.client";

/** GitHub owner from clone URL, e.g. https://github.com/rauchg/blog → rauchg */
export function parseRepoOwner(repoLink: string): string {
  const link = repoLink?.trim();
  if (!link) return "owner";

  try {
    let cleanLink = link;
    if (cleanLink.startsWith("git@github.com:")) {
      cleanLink = cleanLink.replace("git@github.com:", "https://github.com/");
    }
    if (!cleanLink.includes("://") && cleanLink.split("/").filter(Boolean).length >= 2) {
      return cleanLink
        .split("/")
        .filter(Boolean)[0]
        .replace(/\.git$/, "");
    }
    const url = new URL(cleanLink);
    const owner = url.pathname.split("/").filter(Boolean)[0];
    if (owner) return owner.replace(/\.git$/, "");
  } catch {
    const parts = link.split("/").filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2].replace(/\.git$/, "");
  }

  return "owner";
}

export type LandscapePromptInput = {
  index: RepositoryIndexInitRepo;
  documentedFiles?: FileListItem[];
};

export type CompiledLandscape = {
  placeName: string;
  fileCount: number;
  buildingCount: number;
  scale: string;
  skyline: string;
  architecture: string;
  biome: string;
  timeOfDay: string;
  weather: string;
  districts: string[];
  landmarks: string[];
  languages: string;
  folders: string;
  prompt: string;
};

type LangCount = { lang: string; count: number };
type FolderCount = { folder: string; count: number };

function djb2(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pick<T>(items: T[], key: string): T {
  return items[djb2(key) % items.length];
}

function cleanText(value: string, max = 280): string {
  return value
    .replace(/[#*`[\]|<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function indexFiles(index: RepositoryIndexInitRepo): RepoIndexFileEntry[] {
  return index.files?.index ?? [];
}

function languageCounts(files: RepoIndexFileEntry[]): LangCount[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const lang = (file.language || file.ext || "unknown").replace(/^\./, "").toLowerCase();
    if (!lang || lang === "unknown") continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang));
}

function folderCounts(files: RepoIndexFileEntry[]): FolderCount[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const folder = file.path.split("/").filter(Boolean)[0] ?? "root";
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder));
}

function maxDepth(files: RepoIndexFileEntry[]): number {
  return files.reduce((max, file) => {
    const depth = file.path.split("/").filter(Boolean).length;
    return Math.max(max, depth);
  }, 0);
}

function ratio(files: RepoIndexFileEntry[], test: (path: string) => boolean): number {
  if (!files.length) return 0;
  return files.filter((file) => test(file.path.toLowerCase())).length / files.length;
}

function corpus(index: RepositoryIndexInitRepo, documented: FileListItem[]): string {
  const files = indexFiles(index);
  return [
    index.description ?? "",
    index.url,
    index.branch ?? "",
    ...files.slice(0, 120).map((f) => `${f.path} ${f.language ?? ""} ${f.ext}`),
    ...documented
      .slice(0, 40)
      .flatMap((f) => [f.file_path, f.description ?? "", ...(f.dependencies ?? [])]),
  ]
    .join(" ")
    .toLowerCase();
}

function collectDependencies(
  files: RepoIndexFileEntry[],
  documented: FileListItem[],
  blob: string,
): string[] {
  const found = new Set<string>();
  for (const item of documented) {
    for (const dep of item.dependencies ?? []) {
      const name = dep.trim().toLowerCase();
      if (name) found.add(name.replace(/^@/, "").split("/").pop() ?? name);
    }
  }

  const manifests: [RegExp, string][] = [
    [/package\.json|pnpm-lock|yarn\.lock|package-lock/, "node"],
    [/cargo\.toml|cargo\.lock/, "cargo"],
    [/go\.mod|go\.sum/, "go-modules"],
    [/pyproject\.toml|requirements\.txt|poetry\.lock/, "python-env"],
    [/gemfile|gemfile\.lock/, "bundler"],
    [/pom\.xml|build\.gradle/, "jvm"],
    [/composer\.json/, "composer"],
    [/mix\.exs/, "hex"],
    [/pubspec\.ya?ml/, "dart"],
    [/package\.swift/, "swiftpm"],
  ];
  for (const file of files) {
    const path = file.path.toLowerCase();
    for (const [pattern, label] of manifests) {
      if (pattern.test(path)) found.add(label);
    }
  }

  const tokens: [RegExp, string][] = [
    [/\bnext(\.js|js)?\b|next\.config/, "next"],
    [/\breact\b/, "react"],
    [/\bvue\b/, "vue"],
    [/\bsvelte\b/, "svelte"],
    [/\btailwind\b/, "tailwind"],
    [/\bthree\b|\bspark\b/, "three"],
    [/\bsupabase\b/, "supabase"],
    [/\bpaystack\b|\bstripe\b/, "payments"],
    [/\bpostgres|prisma|drizzle\b/, "postgres"],
    [/\bredis\b/, "redis"],
    [/\bdocker|kubernetes|k8s|helm|terraform\b/, "infra"],
    [/\btensorflow|pytorch|transformers\b/, "ml"],
    [/\bdjango\b/, "django"],
    [/\brails\b/, "rails"],
    [/\bexpress\b|\bfastify\b|\bhono\b/, "http-api"],
    [/\bgraphql\b/, "graphql"],
  ];
  for (const [pattern, label] of tokens) {
    if (pattern.test(blob)) found.add(label);
  }

  return [...found].sort((a, b) => a.localeCompare(b)).slice(0, 10);
}

function settlement(fileCount: number): { scale: string; buildingCount: number } {
  if (fileCount <= 12) return { scale: "a lone homestead and workshop yard", buildingCount: 3 };
  if (fileCount <= 40) return { scale: "a compact hamlet", buildingCount: 8 };
  if (fileCount <= 120) return { scale: "a hillside village", buildingCount: 18 };
  if (fileCount <= 350) return { scale: "a walled market town", buildingCount: 32 };
  if (fileCount <= 900) return { scale: "a layered hillside city", buildingCount: 56 };
  return { scale: "a dense metropolis of stacked districts", buildingCount: 80 };
}

function skylineFor(fileCount: number, depth: number, folders: FolderCount[]): string {
  const dominant = folders[0] ? folders[0].count / Math.max(fileCount, 1) : 0;
  if (fileCount <= 20) return "low cottages and a single manor roof";
  if (depth >= 6 && dominant > 0.45) {
    return "one tall citadel over a low outer ring";
  }
  if (fileCount > 400 && folders.length >= 6)
    return "a packed tower skyline with stepped mid-rises";
  if (folders.length >= 5) return "mixed mid-rise blocks around a civic core";
  if (depth <= 2) return "a wide low sprawl along a ridge";
  return "clustered halls with a few taller lookouts";
}

function architectureFor(langs: LangCount[], blob: string, key: string): string {
  const primary = langs[0]?.lang ?? "mixed";
  const styles: Record<string, string[]> = {
    tsx: [
      "glass atriums, painted stucco walkways, and rounded plaza pavilions",
      "timber galleries with white plaster and hanging gardens",
    ],
    jsx: [
      "colorful arcade streets, tiled roofs, and open-air courtyards",
      "lattice balconies over brick workshop rows",
    ],
    ts: ["precise stone civic halls with copper roofs and colonnades"],
    js: ["painted timber shops along a canal with lantern bridges"],
    rs: ["riveted iron foundries, brick kilns, and cantilevered walkways"],
    rust: ["riveted iron foundries, brick kilns, and cantilevered walkways"],
    py: ["stepped stone terraces, observatory drums, and shaded cloisters"],
    python: ["stepped stone terraces, observatory drums, and shaded cloisters"],
    go: ["brutalist concrete piers, harbor warehouses, and signal masts"],
    java: ["grid civic blocks, granite stairs, and clock towers"],
    kt: ["terraced hillside apartments with tiled eaves"],
    kotlin: ["terraced hillside apartments with tiled eaves"],
    swift: ["pale stone villas on switchback lanes"],
    rb: ["wrought-iron markets and red-tile courtyards"],
    php: ["arcade courtyards with mosaic fountains"],
    c: ["bastion walls, dry docks, and masonry magazines"],
    cpp: ["bastion walls, dry docks, and masonry magazines"],
    cs: ["symmetrical campus quads and brick lecture halls"],
    dart: ["bright stucco towers with sky bridges"],
    md: ["library terraces, scriptoria, and quiet cloister gardens"],
  };
  const options = styles[primary] ?? [
    "mixed masonry halls, timber workshops, and a central gathering court",
  ];
  let style = pick(options, `${primary}:${key}`);
  if (/next|react|vue|svelte/.test(blob)) {
    style += ", pedestrian plazas instead of highways";
  }
  if (/rust|c\+\+|embedded/.test(blob)) {
    style += ", heavy industry kept to the river edge";
  }
  return style;
}

function biomeFor(blob: string, fileCount: number, folders: FolderCount[], key: string): string {
  const folderBlob = folders.map((f) => f.folder).join(" ");
  const hay = `${blob} ${folderBlob}`;
  if (/pytorch|tensorflow|llm|embedding|transformers|jupyter/.test(hay)) {
    return pick(
      [
        "high desert mesa with stone cairns and constellation-lined ridges",
        "salt flats around a circular observatory bowl under a huge sky",
      ],
      key,
    );
  }
  if (/k8s|kubernetes|terraform|docker|helm|infra|deploy/.test(hay)) {
    return pick(
      [
        "an archipelago of tower-islands joined by light bridges in low marine fog",
        "a fjord of stacked piers and hanging causeways",
      ],
      key,
    );
  }
  if (/auth|oauth|jwt|crypto|security|vault/.test(hay)) {
    return "a moonlit mountain keep above a pine valley, lantern paths to vaulted gates";
  }
  if (/postgres|sql|prisma|mongo|redis|supabase/.test(hay)) {
    return "a plateau cut by glowing mineral canyons, cistern mouths opening onto orchards";
  }
  if (/rust|cargo|llvm|embedded|systems/.test(hay)) {
    return "a deep canyon foundry, ember light on iron cliffs, a dark river far below";
  }
  if (/android|ios|swift|kotlin|flutter|mobile/.test(hay)) {
    return "switchback hillside neighborhoods over a glittering bay";
  }
  if (/game|unity|unreal|godot|three|spark|webgl/.test(hay)) {
    return "a theatrical valley of sculpted mesas and mirrored water gardens";
  }
  if (/docs|readme|wiki|docusaurus|gitbook/.test(hay) && fileCount < 80) {
    return "a quiet lake campus of terraces, bridges, and reading gardens";
  }
  if (/react|vue|svelte|tailwind|storybook|css|tsx/.test(hay)) {
    return pick(
      [
        "terraced garden city on a warm hillside, flowering courts and tiled roofs",
        "a river delta town of footbridges, orchards, and pale towers",
        "sunlit canyon neighborhoods carved into ochre cliffs",
      ],
      key,
    );
  }
  if (/cli|shell|bash|eslint|linter/.test(hay) && fileCount < 60) {
    return "wind-scoured highland scrub with signal cairns and a single ridge road";
  }
  if (fileCount > 400) {
    return "a vast alpine range at first light, stacked biomes falling into a river valley";
  }
  return pick(
    [
      "rolling temperate valley with a winding river and stone landmarks",
      "a karst highland of sinkhole gardens and limestone bluffs",
      "cedar forest benches opening onto a glacial lake",
      "ochre badlands with a green ribbon oasis",
    ],
    key,
  );
}

function climateFor(
  files: RepoIndexFileEntry[],
  blob: string,
  key: string,
): { timeOfDay: string; weather: string } {
  const tests = ratio(files, (p) => /test|spec|__tests__|e2e/.test(p));
  const docs = ratio(files, (p) => /\.md$|\/docs\/|readme/.test(p));
  const times = [
    "pre-dawn blue hour",
    "golden sunrise",
    "clear late morning",
    "high noon with hard shadows",
    "late afternoon sidelight",
    "warm golden hour",
    "blue dusk",
    "lantern-lit night",
  ];
  let time = pick(times, key);
  if (docs > 0.25) time = "clear late morning";
  else if (/ml|model|train/.test(blob)) time = "blue dusk";
  else if (/auth|security|crypto/.test(blob)) time = "lantern-lit night";
  else if (/react|css|design|ui/.test(blob)) time = "golden sunrise";
  else if (/deploy|docker|k8s/.test(blob)) time = "blue dusk";

  let weather = "dry air and long visibility";
  if (tests > 0.2) weather = "just after rain, wet stone and clean air";
  else if (/docker|k8s|helm/.test(blob)) weather = "low marine fog in the valleys";
  else if (/security|auth/.test(blob)) weather = "cold frost on roofs and pines";
  else if (/game|three|spark/.test(blob)) weather = "dramatic stacked clouds, shafts of sun";
  else
    weather = pick(
      [
        "dry air and long visibility",
        "soft high haze",
        "a distant storm on the horizon",
        "crisp wind and racing cloud shadows",
      ],
      `${key}:wx`,
    );
  return { timeOfDay: time, weather };
}

function districtFor(folder: string, count: number): string {
  const name = folder.toLowerCase();
  const label = `${folder} (${count} files)`;
  if (/src|lib|pkg|internal/.test(name)) return `${label} as workshop halls and tool yards`;
  if (/app|apps|pages|web|frontend|ui|components/.test(name)) {
    return `${label} as civic plazas and gallery streets`;
  }
  if (/api|server|backend|services/.test(name)) return `${label} as signal towers and relay houses`;
  if (/test|spec|e2e|__tests__/.test(name))
    return `${label} as training grounds and proving courts`;
  if (/doc|readme|wiki/.test(name)) return `${label} as library terraces`;
  if (/infra|deploy|ops|k8s|terraform|docker/.test(name)) {
    return `${label} as docks, cranes, and bridge heads`;
  }
  if (/model|ml|data|notebook/.test(name)) return `${label} as observatory gardens`;
  if (/mobile|ios|android/.test(name)) return `${label} as hillside apartment stacks`;
  if (/script|bin|cli|tool/.test(name)) return `${label} as ridge signal posts`;
  if (/public|static|asset/.test(name)) return `${label} as market stalls and storehouses`;
  if (/supabase|prisma|db|migration/.test(name)) return `${label} as cistern houses`;
  return `${label} as a named neighborhood of ${Math.max(2, Math.min(12, Math.round(count / 4)))} buildings`;
}

function landmarkFor(dep: string): string {
  const name = dep.toLowerCase();
  const map: Record<string, string> = {
    next: "layered gallery terraces",
    react: "lattice balcony courts",
    vue: "green-roof pavilions",
    svelte: "compact artisan houses",
    tailwind: "geometric tiled gardens",
    three: "mirrored sculpture courtyards",
    spark: "mirrored sculpture courtyards",
    supabase: "sandstone cloisters with cool arcades",
    payments: "a vaulted mint hall",
    postgres: "subterranean cisterns with glowing water",
    prisma: "subterranean cisterns with glowing water",
    redis: "a red-lantern alley of storehouses",
    infra: "hanging causeways and beacon masts",
    docker: "dry-dock basins",
    ml: "a circular observatory bowl",
    django: "colonnaded campus quads",
    rails: "iron market sheds",
    "http-api": "a row of relay houses",
    graphql: "a star-planned plaza",
    node: "timber crane wharves",
    cargo: "an iron slipway",
    "go-modules": "concrete harbor sheds",
    "python-env": "stepped greenhouse benches",
  };
  return map[name] ?? `a distinctive ${name.replace(/[^a-z0-9-]+/g, " ").trim()} landmark hall`;
}

/**
 * Deterministic scene from a CodeFundi index (+ optional documented file list).
 * Same payload always yields the same world; different trees/deps/langs do not.
 */
export function compileLandscapeScene(input: LandscapePromptInput): CompiledLandscape {
  const { index, documentedFiles = [] } = input;
  const files = indexFiles(index);
  const fileCount = index.total_files ?? files.length;
  const langs = languageCounts(files);
  const folders = folderCounts(files);
  const blob = corpus(index, documentedFiles);
  const deps = collectDependencies(files, documentedFiles, blob);
  const name =
    index.url
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/\.git$/, "") || "repository";
  const owner = parseRepoOwner(index.url);
  const placeName = `${owner}/${name}`;
  const identityKey = [
    placeName,
    index.branch ?? "",
    index.description ?? "",
    String(fileCount),
    langs.map((l) => `${l.lang}:${l.count}`).join(","),
    folders.map((f) => `${f.folder}:${f.count}`).join(","),
    deps.join(","),
    files
      .map((f) => f.path)
      .sort()
      .join("|"),
  ].join("::");

  const { scale, buildingCount } = settlement(fileCount);
  const skyline = skylineFor(fileCount, maxDepth(files), folders);
  const architecture = architectureFor(langs, blob, identityKey);
  const biome = biomeFor(blob, fileCount, folders, identityKey);
  const { timeOfDay, weather } = climateFor(files, blob, identityKey);
  const districts = folders.slice(0, 6).map((folder) => districtFor(folder.folder, folder.count));
  const landmarks = deps.slice(0, 6).map(landmarkFor);
  const languages = langs
    .slice(0, 8)
    .map((l) => `${l.lang}:${l.count}`)
    .join(", ");
  const folderSummary = folders
    .slice(0, 8)
    .map((f) => `${f.folder}:${f.count}`)
    .join(", ");
  const essence = cleanText(index.description ?? "");
  const documentedNotes = documentedFiles
    .filter((f) => f.description)
    .slice(0, 3)
    .map((f) => cleanText(`${f.file_name}: ${f.description}`, 90))
    .filter(Boolean);

  const prompt = [
    "Explorable outdoor landscape, persistent 3D world, ground plane and open sky, walkable terrain.",
    "Not an indoor office, not a UI mockup, not a HUD, not a product render.",
    `Place inspired by ${placeName}.`,
    `Settlement: ${scale} of about ${buildingCount} buildings, ${skyline}.`,
    `Time and climate: ${timeOfDay}, ${weather}.`,
    `Landform: ${biome}.`,
    `Architecture: ${architecture}.`,
    districts.length ? `Districts from the repo tree: ${districts.join("; ")}.` : "",
    landmarks.length ? `Landmarks from CodeFundi stack/dependencies: ${landmarks.join("; ")}.` : "",
    essence ? `Atmosphere from the CodeFundi description: ${essence}.` : "",
    languages ? `Material accents follow languages ${languages}.` : "",
    folderSummary ? `Top-level areas ${folderSummary}.` : "",
    documentedNotes.length ? `File notes from CodeFundi: ${documentedNotes.join("; ")}.` : "",
    `CodeFundi counted about ${fileCount} files on branch ${index.branch || "main"}.`,
    "Natural lighting, coherent geography, rich mid-ground detail, no floating text, no screenshots of code.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    placeName,
    fileCount,
    buildingCount,
    scale,
    skyline,
    architecture,
    biome,
    timeOfDay,
    weather,
    districts,
    landmarks,
    languages,
    folders: folderSummary,
    prompt: prompt.slice(0, 2000),
  };
}

/**
 * World Labs text prompts max out at 2000 characters and must describe a place.
 * The CodeFundi index (and optional documented file list) is compiled into the scene.
 */
export function buildLandscapePrompt(
  index: RepositoryIndexInitRepo,
  documentedFiles?: FileListItem[],
): string {
  return compileLandscapeScene({ index, documentedFiles }).prompt;
}
