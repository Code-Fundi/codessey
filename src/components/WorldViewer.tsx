"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, Link2, Loader2, Map, PenLine, Award } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PostcardFront } from "@/components/BrandCard";
import { GuestbookSignDialog } from "@/components/GuestbookSignDialog";
import { PostcardModal } from "@/components/PostcardModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWallet } from "@/hooks/useWallet";
import { ownerRepoHeading, viewerMedia } from "@/lib/cached-world";
import type { CreditsDialogReason } from "@/components/CreditPurchaseDialog";
import { PLAQUE_COINS } from "@/lib/generation";
import type { CachedWorld } from "@/lib/localStorage";
import { proxiedPanoSrc } from "@/lib/pano-proxy";
import { EXPORT_HOLO_VARS, preloadPostcardAssets, rasterizePostcard } from "@/lib/postcard-export";
import { firstRpcRow } from "@/lib/rpc";
import {
  codesseyShareText,
  codesseyShareUrl,
  facebookShareHref,
  twitterShareHref,
} from "@/lib/share";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BuyPlaqueResult, SignGuestbookResult } from "@/lib/database.types";

interface WorldViewerProps {
  world: CachedWorld | null;
  isGenerating: boolean;
  progress: string | null;
  repoUrl?: string | null;
  repoName?: string | null;
  retryNonce?: number;
  onNeedSignIn: () => void;
  onNeedCredits: (reason?: CreditsDialogReason) => void;
  onConsumed: () => void;
  onPlaqueClaimed?: (discoveredBy: string) => void;
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
  onPlaqueClaimed,
}: WorldViewerProps) {
  const { user } = useWallet();
  const exportRef = useRef<HTMLDivElement>(null);
  const [postcardOpen, setPostcardOpen] = useState(false);
  const [guestbookOpen, setGuestbookOpen] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [signatureSrc, setSignatureSrc] = useState<string | null>(null);
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
  const canClaimPlaque =
    Boolean(user) &&
    world?.status === "complete" &&
    Boolean(world.userId) &&
    world.userId === user?.id &&
    !world.discoveredBy;
  const shareSource = repoUrl ?? world?.repoUrl ?? "";
  const shareUrl = codesseyShareUrl(shareSource);
  const shareText = codesseyShareText(shareSource);
  const canShare = Boolean(shareUrl) && world?.status === "complete" && !isGenerating;

  useEffect(() => {
    setCapturedUrl(null);
    setPostcardOpen(false);
    setGuestbookOpen(false);
    setSignatureSrc(null);
  }, [world?.id]);

  const showDeed = useCallback(
    async (nextSignature: string) => {
      const src = proxiedPanoSrc(world?.panoUrl);
      await preloadPostcardAssets(src);
      setSignatureSrc(nextSignature);
      setPostcardOpen(true);
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const node = exportRef.current;
      if (!node) throw new Error("Postcard is not ready to export.");
      const blob = await rasterizePostcard(node);
      const objectUrl = URL.createObjectURL(blob);
      setCapturedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });
    },
    [world?.panoUrl],
  );

  const openGuestbook = useCallback(() => {
    if (!canDownload || busy) return;
    if (!user) {
      onNeedSignIn();
      return;
    }
    setGuestbookOpen(true);
  }, [busy, canDownload, onNeedSignIn, user]);

  const submitGuestbook = useCallback(
    async ({ message, signature }: { message: string; signature: string }) => {
      if (!world?.id) throw new Error("World is not ready.");
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("sign_guestbook", {
        p_world_id: world.id,
        p_signature: signature,
        p_message: message,
      });
      const row = firstRpcRow(data as SignGuestbookResult | SignGuestbookResult[] | null);
      if (error) throw new Error(error.message);
      if (!row?.ok) {
        if (row?.error === "not_authenticated") {
          onNeedSignIn();
          return false;
        }
        if (row?.error === "insufficient_coins") {
          onNeedCredits("guestbook");
          return false;
        }
        throw new Error(row?.error || "Could not sign the guestbook.");
      }
      onConsumed();
      setGuestbookOpen(false);
      if (row.already_signed) {
        toast.message("You already signed this guestbook.");
      }
      await showDeed(row.signature_png || signature);
      return true;
    },
    [onConsumed, onNeedCredits, onNeedSignIn, showDeed, world?.id],
  );

  const claimPlaque = useCallback(async () => {
    if (!world?.id || busy) return;
    if (!user) {
      onNeedSignIn();
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("buy_founder_plaque", {
        p_world_id: world.id,
      });
      const row = firstRpcRow(data as BuyPlaqueResult | BuyPlaqueResult[] | null);
      if (error) throw new Error(error.message);
      if (!row?.ok) {
        if (row?.error === "not_authenticated") {
          onNeedSignIn();
          return;
        }
        if (row?.error === "insufficient_coins") {
          onNeedCredits("plaque");
          return;
        }
        throw new Error(row?.error || "Could not claim the plaque.");
      }
      onConsumed();
      if (row.discovered_by) onPlaqueClaimed?.(row.discovered_by);
      toast.success(`Founder's plaque claimed. ${PLAQUE_COINS} credit used.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not claim the plaque.");
    } finally {
      setBusy(false);
    }
  }, [busy, onConsumed, onNeedCredits, onNeedSignIn, onPlaqueClaimed, user, world?.id]);

  useEffect(() => {
    if (retryNonce && retryNonce !== lastRetry.current) {
      pendingRetry.current = true;
      lastRetry.current = retryNonce;
    }
    if (pendingRetry.current && canDownload && !busy) {
      pendingRetry.current = false;
      openGuestbook();
    }
  }, [retryNonce, canDownload, busy, openGuestbook]);

  return (
    <section className="relative h-full w-full flex flex-col items-center p-3 sm:p-4 md:p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 radial-blue" />

      {heading && (
        <div className="relative shrink-0 mb-2 text-xs text-white/40 font-display uppercase tracking-[0.3em] text-center">
          {heading}
        </div>
      )}

      <div className="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden border border-white/10 bg-black/40">
        {world?.discoveredBy && !isGenerating && (
          <div className="absolute bottom-3 left-3 z-[2] rounded-md border border-amber-400/30 bg-black/55 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.16em] text-amber-100/90">
            Discovered by @{world.discoveredBy}
          </div>
        )}
        {world?.marbleUrl && !isGenerating && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={world.marbleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open in Marble"
                  title="Open in Marble"
                  className="absolute top-2 right-2 z-[2] inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/40 text-white/80"
                >
                  <ExternalLink size={14} />
                </a>
              </TooltipTrigger>
              <TooltipContent side="left">Open in Marble</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
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

      {(canDownload || canShare) && (
        <div className="relative shrink-0 mt-3 flex flex-wrap items-center justify-center gap-2">
          {canDownload && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                data-tour="guestbook"
                onClick={openGuestbook}
                className="bg-transparent border-white/15 text-white/85 hover:bg-white/5 hover:text-white"
              >
                {busy ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <PenLine size={14} className="mr-1.5" />
                )}
                Sign Guestbook
              </Button>
              {canClaimPlaque && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void claimPlaque()}
                  className="bg-transparent border-white/15 text-white/85 hover:bg-white/5 hover:text-white"
                >
                  {busy ? (
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                  ) : (
                    <Award size={14} className="mr-1.5" />
                  )}
                  Founder&apos;s plaque
                </Button>
              )}
            </>
          )}
          {canShare && shareUrl && (
            <>
              <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                Share on
              </span>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="bg-transparent border-white/15 text-white/85 hover:bg-white/5 hover:text-white"
              >
                <a
                  href={twitterShareHref(shareText, shareUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <XLogo />
                  <span className="sr-only">X</span>
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="bg-transparent border-white/15 text-white/85 hover:bg-white/5 hover:text-white"
              >
                <a href={facebookShareHref(shareUrl)} target="_blank" rel="noopener noreferrer">
                  <FacebookLogo />
                  <span className="sr-only">Facebook</span>
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl).then(
                    () => toast.success("Link copied."),
                    () => toast.error("Could not copy link."),
                  );
                }}
                className="bg-transparent border-white/15 text-white/85 hover:bg-white/5 hover:text-white"
              >
                <Link2 size={14} className="mr-1.5" />
                Copy link
              </Button>
            </>
          )}
        </div>
      )}

      <div className="pointer-events-none fixed -left-[200vw] top-0" aria-hidden="true">
        <div ref={exportRef} className="card-postcard" style={EXPORT_HOLO_VARS as CSSProperties}>
          <PostcardFront
            repoName={heading}
            imageUrl={imageUrl}
            caption={world?.caption}
            signatureSrc={signatureSrc}
            showHolo
            holoIntensity={1}
            flat
          />
        </div>
      </div>

      <GuestbookSignDialog
        open={guestbookOpen}
        onOpenChange={setGuestbookOpen}
        worldId={world?.id ?? ""}
        busy={busy}
        onSubmit={submitGuestbook}
      />

      <PostcardModal
        open={postcardOpen}
        onOpenChange={setPostcardOpen}
        repoName={heading}
        imageUrl={imageUrl}
        caption={world?.caption}
        capturedUrl={capturedUrl}
        signatureSrc={signatureSrc}
      />
    </section>
  );
}

function XLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12.07C22 6.48 17.52 2 11.93 2S2 6.48 2 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.02H7.9v-2.91h2.54V9.41c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.91h-2.34V22c4.78-.75 8.44-4.91 8.44-9.93z" />
    </svg>
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
