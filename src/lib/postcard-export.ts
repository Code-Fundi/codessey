export const EXPORT_HOLO_VARS = {
  "--holo-x": "50%",
  "--holo-y": "30%",
  "--holo-o": "0.16",
  "--holo-intensity": "1",
} as const;

export async function preloadImage(src: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load panorama."));
    img.src = src;
  });
}

export async function preloadPostcardAssets(imageSrc: string | null): Promise<void> {
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
  if (imageSrc) await preloadImage(imageSrc);
}

export function freezeHoloForExport(node: HTMLElement) {
  node.style.setProperty("--holo-x", EXPORT_HOLO_VARS["--holo-x"]);
  node.style.setProperty("--holo-y", EXPORT_HOLO_VARS["--holo-y"]);
  node.style.setProperty("--holo-o", EXPORT_HOLO_VARS["--holo-o"]);
  node.style.setProperty("--holo-intensity", EXPORT_HOLO_VARS["--holo-intensity"]);
}

export async function rasterizePostcard(node: HTMLElement): Promise<Blob> {
  freezeHoloForExport(node);
  const { domToBlob } = await import("modern-screenshot");
  const blob = await domToBlob(node, { scale: 2 });
  if (!blob) throw new Error("Could not render postcard.");
  return blob;
}

export function openExportTab(): Window | null {
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

export function openBlobInNewTab(blob: Blob, filename: string, tab?: Window | null) {
  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) {
    tab.location.replace(url);
    return url;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  return url;
}

export function filenameForPostcard(repoName: string | null | undefined): string {
  const slug = (repoName || "codessey").replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "codessey"}-postcard.png`;
}
