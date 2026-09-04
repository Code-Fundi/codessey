"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostcardModal } from "@/components/PostcardModal";
import type { CachedWorld } from "@/lib/localStorage";

interface WorldViewerProps {
  world: CachedWorld | null;
  isGenerating: boolean;
  progress: string | null;
  repoName?: string | null;
}

export function WorldViewer({ world, isGenerating, progress, repoName }: WorldViewerProps) {
  const [postcardOpen, setPostcardOpen] = useState(false);
  const canDownload = Boolean(world?.splatUrl) && !isGenerating && world?.status !== "pending";
  return (
    <section className="relative h-full w-full flex flex-col items-center p-3 sm:p-4 md:p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 radial-green" />

      {repoName && (
        <div className="relative shrink-0 mb-2 text-xs text-white/40 font-display uppercase tracking-[0.3em] text-center">
          {repoName}
        </div>
      )}

      <div className="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden border border-white/10 bg-black/40">
        {world?.splatUrl && !isGenerating ? (
          <SparkCanvas splatUrl={world.splatUrl} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {isGenerating ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-green-400" />
                <p className="text-sm text-white/80">{progress ?? "Generating landscape…"}</p>
                <p className="text-xs text-white/40">World Labs usually takes a few minutes.</p>
              </>
            ) : (
              <>
                <Map className="h-8 w-8 text-white/30" />
                <p className="text-sm text-white/70">
                  Search Worlds from Explore to generate a landscape.
                </p>
                <p className="text-xs text-white/40">The 3D world will appear here.</p>
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
              onClick={() => setPostcardOpen(true)}
              className="bg-transparent border-white/15 text-white/85 hover:bg-white/5 hover:text-white"
            >
              <Download size={14} className="mr-1.5" />
              Download
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

      <PostcardModal
        open={postcardOpen}
        onOpenChange={setPostcardOpen}
        repoName={repoName ?? world?.repoName ?? null}
        imageUrl={world?.thumbnailUrl ?? world?.panoUrl ?? null}
      />
    </section>
  );
}

function SparkCanvas({ splatUrl }: { splatUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let disposed = false;
    let cleanup = () => {};

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

    void start();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [splatUrl]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
