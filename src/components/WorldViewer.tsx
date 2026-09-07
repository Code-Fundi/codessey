"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, Image as ImageIcon, Loader2, Map } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PostcardFront } from "@/components/BrandCard";
import { PostcardModal } from "@/components/PostcardModal";
import { useWallet } from "@/hooks/useWallet";
import { ownerRepoHeading, viewerMedia } from "@/lib/cached-world";
import type { CreditTick } from "@/lib/credit-status";
import { POSTCARD_COINS } from "@/lib/generation";
import type { CachedWorld } from "@/lib/localStorage";
import { proxiedPanoSrc } from "@/lib/pano-proxy";
import {
  EXPORT_HOLO_VARS,
  filenameForPostcard,
  openBlobInNewTab,
  openExportTab,
  preloadPostcardAssets,
  rasterizePostcard,
} from "@/lib/postcard-export";

interface WorldViewerProps {
  world: CachedWorld | null;
  isGenerating: boolean;
  progress: string | null;
  repoUrl?: string | null;
  repoName?: string | null;
  retryNonce?: number;
  onNeedSignIn: () => void;
  onNeedCredits: () => void;
  onConsumed: () => void;
}

export function WorldViewer({
  world,
  isGenerating,
  progress,
  repoUrl,
  repoName,
  retryNonce = 0,
  onNeedSignIn,
  onNeedCredits,
  onConsumed,
}: WorldViewerProps) {
  const { user } = useWallet();
  const exportRef = useRef<HTMLDivElement>(null);
  const [postcardOpen, setPostcardOpen] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRetry = useRef(0);
  const pendingRetry = useRef(false);

  const { splatUrl, panoUrl } = viewerMedia({
    splatUrl: world?.splatUrl,
    panoUrl: world?.panoUrl,
  });
  const heading = ownerRepoHeading(repoUrl ?? world?.repoUrl, repoName ?? world?.repoName);
  const imageUrl = proxiedPanoSrc(world?.panoUrl) ?? world?.thumbnailUrl ?? null;
  const canDownload = Boolean(splatUrl || panoUrl) && !isGenerating && world?.status !== "pending";

  useEffect(() => {
    setCapturedUrl(null);
    setPostcardOpen(false);
  }, [world?.id]);

  const runExport = useCallback(async () => {
    if (!canDownload || busy) return;
    if (!user) {
      onNeedSignIn();
      return;
    }

    const src = proxiedPanoSrc(world?.panoUrl);
    let preview: Window | null = null;
    if (user) preview = openExportTab();
    setBusy(true);
    try {
      await preloadPostcardAssets(src);
      const consumeRes = await fetch("/api/credits/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: POSTCARD_COINS }),
      });
      const tick = (await consumeRes.json()) as CreditTick;
      if (consumeRes.status === 401 || tick.error === "not_authenticated") {
        preview?.close();
        onNeedSignIn();
        return;
      }
      if (!consumeRes.ok || !tick.ok) {
        preview?.close();
        if (tick.error === "insufficient_coins" || consumeRes.status === 402) {
          onNeedCredits();
          return;
        }
        throw new Error(tick.error || "Could not use a credit.");
      }
      onConsumed();
      setPostcardOpen(true);
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const node = exportRef.current;
      if (!node) throw new Error("Postcard is not ready to export.");
      const blob = await rasterizePostcard(node);
      const objectUrl = openBlobInNewTab(blob, filenameForPostcard(heading), preview);
      setCapturedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });
    } catch (error) {
      preview?.close();
      toast.error(error instanceof Error ? error.message : "Postcard export failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, canDownload, heading, onConsumed, onNeedCredits, onNeedSignIn, user, world?.panoUrl]);

  useEffect(() => {
    if (retryNonce && retryNonce !== lastRetry.current) {
      pendingRetry.current = true;
      lastRetry.current = retryNonce;
    }
    if (pendingRetry.current && canDownload && !busy) {
      pendingRetry.current = false;
      void runExport();
    }
  }, [retryNonce, canDownload, busy, runExport]);

  return (
    <section className="relative h-full w-full flex flex-col items-center p-3 sm:p-4 md:p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 radial-blue" />

      {heading && (
        <div className="relative shrink-0 mb-2 text-xs text-white/40 font-display uppercase tracking-[0.3em] text-center">
          {heading}
        </div>
      )}

      <div className="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden border border-white/10 bg-black/40">
        {splatUrl && !isGenerating ? (
          <SparkCanvas splatUrl={splatUrl} />
        ) : panoUrl && !isGenerating ? (
          <img src={panoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {isGenerating ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                <p className="text-sm text-white/80">{progress ?? "Generating landscape…"}</p>
                <p className="text-xs text-white/55 max-w-sm">
                  World generation in progress. You can reload this page while you wait.
                </p>
              </>
            ) : (
              <>
                <Map className="h-8 w-8 text-white/30" />
                <p className="text-sm text-white/70">Generate a world from Indexed Repos.</p>
                <p className="text-xs text-white/40">The landscape will appear here.</p>
              </>
            )}
          </div>
        )}
      </div>

      {(canDownload || (world?.marbleUrl && !isGenerating)) && (
        <div className="relative shrink-0 mt-3 flex flex-wrap items-center justify-center gap-2">
          {canDownload && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void runExport()}
              className="bg-transparent border-white/15 text-white/85 hover:bg-white/5 hover:text-white"
            >
              {busy ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <ImageIcon size={14} className="mr-1.5" />
              )}
              Download postcard
            </Button>
          )}
          {world?.marbleUrl && !isGenerating && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="bg-transparent border-white/15 text-white/85"
            >
              <a href={world.marbleUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} className="mr-1.5" />
                Open in Marble
              </a>
            </Button>
          )}
        </div>
      )}

      <div className="pointer-events-none fixed -left-[200vw] top-0" aria-hidden="true">
        <div ref={exportRef} className="card-postcard" style={EXPORT_HOLO_VARS as CSSProperties}>
          <PostcardFront
            repoName={heading}
            imageUrl={imageUrl}
            caption={world?.caption}
            showHolo
            holoIntensity={1}
            flat
          />
        </div>
      </div>

      <PostcardModal
        open={postcardOpen}
        onOpenChange={setPostcardOpen}
        repoName={heading}
        imageUrl={imageUrl}
        caption={world?.caption}
        capturedUrl={capturedUrl}
        onDownloadCaptured={() => {
          if (!capturedUrl) return;
          window.open(capturedUrl, "_blank", "noopener,noreferrer");
        }}
      />
    </section>
  );
}

function SparkCanvas({ splatUrl }: { splatUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let disposed = false;
    let cleanup = () => {};
    setLoading(true);

    const start = async () => {
      const THREE = await import("three");
      const { SparkRenderer, SplatMesh, SplatLoader, SparkControls } =
        await import("@sparkjsdev/spark");

      if (disposed) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        65,
        wrap.clientWidth / wrap.clientHeight,
        0.01,
        1000,
      );
      scene.add(camera);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);

      const spark = new SparkRenderer({ renderer });
      scene.add(spark);

      const resize = () => {
        if (!wrap) return;
        camera.aspect = wrap.clientWidth / Math.max(wrap.clientHeight, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
      };
      window.addEventListener("resize", resize);

      const controls = new SparkControls({ canvas });
      const loader = new SplatLoader();
      const decoded = await loader.loadAsync(splatUrl);
      if (disposed) {
        return;
      }
      if (!("packedArray" in decoded)) {
        throw new Error("Unsupported splat format.");
      }

      const mesh = new SplatMesh({ packedSplats: decoded });
      mesh.quaternion.set(1, 0, 0, 0);
      scene.add(mesh);
      camera.position.set(0, 0, 0);
      camera.quaternion.set(0, 0, 0, 1);
      setLoading(false);

      renderer.setAnimationLoop(() => {
        controls.update(camera);
        renderer.render(scene, camera);
      });

      cleanup = () => {
        window.removeEventListener("resize", resize);
        renderer.setAnimationLoop(null);
        scene.remove(mesh);
        mesh.dispose?.();
        renderer.dispose();
      };
    };

    void start().catch(() => {
      if (!disposed) setLoading(false);
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [splatUrl]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-black/45">
          <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
          <p className="text-xs uppercase tracking-[0.18em] text-white/70">Loading landscape…</p>
        </div>
      )}
    </div>
  );
}
