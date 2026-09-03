export interface WorldLabsConfig {
  baseUrl?: string;
  apiKey: string;
}

export type WorldLabsModel = "marble-1.0-draft" | "marble-1.0" | "marble-1.1" | "marble-1.1-plus";

export type SplatQuality = "100k" | "500k" | "full_res";

export interface WorldTextPrompt {
  type: "text";
  text_prompt: string;
}

export interface GenerateWorldRequest {
  display_name?: string;
  model?: WorldLabsModel;
  world_prompt: WorldTextPrompt;
}

export interface OperationProgress {
  status?: string;
  description?: string;
}

export interface OperationMetadata {
  progress?: OperationProgress;
  world_id?: string;
}

export interface SplatAssets {
  spz_urls?: Partial<Record<SplatQuality, string>>;
}

export interface WorldAssets {
  caption?: string | null;
  thumbnail_url?: string | null;
  splats?: SplatAssets | null;
  imagery?: { pano_url?: string | null } | null;
}

export interface World {
  world_id?: string;
  id?: string;
  display_name: string;
  world_marble_url: string;
  assets?: WorldAssets | null;
  model?: string | null;
}

export interface Operation {
  operation_id: string;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  done: boolean;
  error?: { message?: string } | null;
  metadata?: OperationMetadata | null;
  response?: World | null;
}

export interface ListWorldsResponse {
  worlds?: World[];
}

export class WorldLabsAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "WorldLabsAPIError";
  }
}

export class WorldLabsAPIClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: WorldLabsConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.worldlabs.ai/marble/v1").replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private async makeRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${path.replace(/^\//, "")}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "WLT-Api-Key": this.apiKey,
        ...options.headers,
      },
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const message =
        (typeof record.detail === "string" && record.detail) ||
        (typeof record.message === "string" && record.message) ||
        `World Labs request failed: ${response.status} ${response.statusText}`;
      throw new WorldLabsAPIError(message, response.status, body);
    }

    return body as T;
  }

  async generateWorld(request: GenerateWorldRequest): Promise<Operation> {
    return this.makeRequest<Operation>("worlds:generate", {
      method: "POST",
      body: JSON.stringify({
        display_name: request.display_name,
        model: request.model ?? "marble-1.1",
        world_prompt: request.world_prompt,
      }),
    });
  }

  async getOperation(operationId: string): Promise<Operation> {
    return this.makeRequest<Operation>(`operations/${operationId}`, { method: "GET" });
  }

  async waitForOperation(
    operationId: string,
    options: {
      intervalMs?: number;
      onProgress?: (operation: Operation) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<Operation> {
    const intervalMs = options.intervalMs ?? 5000;
    while (true) {
      if (options.signal?.aborted) {
        throw new DOMException("World generation aborted", "AbortError");
      }
      const operation = await this.getOperation(operationId);
      options.onProgress?.(operation);
      if (operation.done) {
        if (operation.error?.message) {
          throw new WorldLabsAPIError(operation.error.message, 500, operation.error);
        }
        return operation;
      }
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, intervalMs);
        options.signal?.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer);
            reject(new DOMException("World generation aborted", "AbortError"));
          },
          { once: true },
        );
      });
    }
  }

  async getWorld(worldId: string): Promise<World> {
    return this.makeRequest<World>(`worlds/${worldId}`, { method: "GET" });
  }

  async listWorlds(): Promise<World[]> {
    const body = await this.makeRequest<ListWorldsResponse>("worlds:list", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return body.worlds ?? [];
  }

  getWorldId(world: World | null | undefined): string | null {
    return world?.world_id ?? world?.id ?? null;
  }

  getSplatUrl(world: World | null | undefined, quality: SplatQuality = "500k"): string | null {
    const urls = world?.assets?.splats?.spz_urls;
    if (!urls) return null;
    return urls[quality] ?? urls["500k"] ?? urls.full_res ?? urls["100k"] ?? null;
  }

  getPanoUrl(world: World | null | undefined): string | null {
    return world?.assets?.imagery?.pano_url ?? null;
  }
}

export function createWorldLabsClient(config: WorldLabsConfig): WorldLabsAPIClient {
  return new WorldLabsAPIClient(config);
}
