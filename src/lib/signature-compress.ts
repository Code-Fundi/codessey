const MAX_CHARS = 60000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read signature."));
    img.src = src;
  });
}

function toUrl(canvas: HTMLCanvasElement, type: string, quality: number): string {
  return canvas.toDataURL(type, quality);
}

/** Shrink a pad export so it fits the guestbook RPC length cap. */
export async function compressSignatureDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Draw a signature first.");
  }
  if (dataUrl.length <= MAX_CHARS && dataUrl.startsWith("data:image/webp")) {
    return dataUrl;
  }

  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const maxEdge = 640;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height, 1));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not compress signature.");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const attempts: Array<[string, number]> = [
    ["image/webp", 0.72],
    ["image/webp", 0.5],
    ["image/png", 0.92],
    ["image/webp", 0.35],
  ];

  for (const [type, quality] of attempts) {
    const next = toUrl(canvas, type, quality);
    if (next.startsWith("data:image/") && next.length <= MAX_CHARS) return next;
  }

  canvas.width = Math.max(1, Math.round(canvas.width * 0.5));
  canvas.height = Math.max(1, Math.round(canvas.height * 0.5));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const fallback = toUrl(canvas, "image/webp", 0.4);
  if (fallback.length > MAX_CHARS) {
    throw new Error("Signature is too large. Draw a simpler mark and try again.");
  }
  return fallback;
}
