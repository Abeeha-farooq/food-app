// src/lib/imageCompress.ts
// ===============================
// Purpose: Resize + compress an image File IN THE BROWSER before
//          it's sent to the server.
//
// Why this exists:
//   We hit a 413 (Request Entity Too Large) when admins uploaded
//   menu item photos. Two limits stacked against us:
//     1. Vercel's serverless function hard cap is 4.5 MB for the
//        request body. Once you cross it, Vercel's edge returns
//        413 BEFORE your Express code ever runs.
//     2. Our own express.json() body parser was set to "16kb" —
//        tiny enough that even small base64 images would have
//        been rejected.
//
//   Compressing on the client solves both:
//     - A 5 MB iPhone photo becomes ~150-300 KB after resize +
//       JPEG compression, well under Vercel's 4.5 MB cap.
//     - The same image is ~10x smaller in the JSON body, so
//       Express's limit is no longer a concern.
//
// How it works:
//   1. Load the File into an HTMLImageElement via createObjectURL.
//   2. Draw it to an off-screen <canvas> at the target dimensions
//      (preserving aspect ratio, capped at MAX_WIDTH).
//   3. canvas.toBlob() re-encodes as JPEG at the target quality.
//   4. FileReader reads the blob back as a base64 data URL —
//      THIS is what the server receives.
//
// Why canvas + toBlob (not a library):
//   - No new npm dependency. The browser does all the work.
//   - The same primitive works in every modern browser.
//   - A 5 MB photo becomes ~200 KB in 200-500ms on a modern
//     laptop. Worth the wait vs. waiting on a 5 MB upload.
//
// Why JPEG by default:
//   - JPEG is ~10x smaller than PNG for photos (the common case).
//   - PNG transparency is rare for menu photos. If a user uploads
//     a PNG with transparency, the JPEG re-encode just fills
//     transparency with white (the default canvas bg) — fine
//     for menu items.
//
// Limits:
//   - MAX_WIDTH = 1200px. This is the sweet spot: large enough
//     that the image looks crisp on retina displays, small
//     enough to keep file size down. A 4000px iPhone photo at
//     1200px wide looks identical to the human eye on a 6"
//     phone screen.
//   - QUALITY = 0.85. Visually indistinguishable from 1.0 for
//     menu photos; cuts file size by ~50% vs. 1.0.
// ===============================

// ============================================================
// TYPES
// ============================================================
export interface CompressOptions {
  /**
   * Max width OR height in pixels (whichever is larger in the
   * source). Defaults to 1200. The image is scaled to fit
   * within a max-W x max-H bounding box, preserving aspect
   * ratio. Smaller images are NOT upscaled — if the source is
   * 800x600, we return 800x600, not 1200x1200.
   */
  maxWidth?: number;

  /**
   * Max height in pixels. Same behavior as maxWidth.
   */
  maxHeight?: number;

  /**
   * JPEG quality 0..1. Defaults to 0.85. 1.0 = lossless (but
   * still JPEG, so still lossy), 0.5 = aggressive compression.
   * 0.85 is the sweet spot for photos.
   */
  quality?: number;

  /**
   * Output MIME type. Defaults to "image/jpeg". PNG preserves
   * transparency but produces much larger files; only use it
   * if the source has transparency you care about.
   */
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
}

export interface CompressResult {
  /**
   * The compressed image as a base64 data URL — drop-in
   * replacement for FileReader.readAsDataURL output.
   * e.g. "data:image/jpeg;base64,/9j/4AAQ..."
   */
  dataUrl: string;

  /**
   * Size of the compressed blob in bytes. Useful for
   * logging the compression ratio.
   */
  size: number;

  /**
   * Output dimensions. May be smaller than the source if the
   * source exceeded maxWidth/maxHeight.
   */
  width: number;
  height: number;

  /**
   * Output MIME type. Always matches the requested mimeType
   * (or "image/jpeg" by default).
   */
  mimeType: string;
}

// ============================================================
// DEFAULTS
// ============================================================
const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_MAX_HEIGHT = 1200;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_MIME = "image/jpeg";

// ============================================================
// MAIN FUNCTION
// ============================================================
/**
 * Compress an image File (or Blob) to a smaller base64 data URL.
 *
 * @example
 *   const result = await compressImage(file);
 *   console.log(`Reduced from ${file.size} to ${result.size} bytes`);
 *   setImageUrl(result.dataUrl);
 */
export const compressImage = async (
  file: File | Blob,
  options: CompressOptions = {}
): Promise<CompressResult> => {
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const mimeType = options.mimeType ?? DEFAULT_MIME;

  // ----- 1. Load the file into an Image -----
  // createObjectURL gives the browser a stable reference to
  // the in-memory blob. We revoke it after the image loads
  // to free memory.
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } finally {
    // Revoke immediately after we've decoded the image — the
    // browser keeps the decoded pixels in memory; the URL is
    // no longer needed.
    URL.revokeObjectURL(url);
  }

  // ----- 2. Compute target dimensions -----
  // We scale to fit within (maxWidth, maxHeight), preserving
  // aspect ratio. We never upscale — small images stay small.
  const { width: srcW, height: srcH } = img;
  const { width: tgtW, height: tgtH } = computeTargetSize(
    srcW,
    srcH,
    maxWidth,
    maxHeight
  );

  // ----- 3. Draw to an off-screen canvas at the target size -----
  // Canvas is the workhorse here. Drawing an Image to a canvas
  // at a different size tells the browser to resample — that's
  // the resize step. We then call toBlob() to re-encode.
  const canvas = document.createElement("canvas");
  canvas.width = tgtW;
  canvas.height = tgtH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Should never happen in any browser we support, but the
    // type system makes us handle it.
    throw new Error("Could not get 2D canvas context");
  }
  // Fill white background BEFORE drawing the image. This
  // matters for PNGs with transparency — JPEG doesn't
  // support alpha, so transparent areas would default to
  // black otherwise. White is what most menu photos want
  // (a white card behind the food).
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, tgtW, tgtH);
  // imageSmoothingEnabled is on by default in canvas, but
  // being explicit — and setting the quality to "high" — gives
  // a noticeably better resize on large downsamples.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, tgtW, tgtH);

  // ----- 4. Re-encode via toBlob → read as base64 data URL -----
  // toBlob is async; it runs the encoder in a worker so the
  // UI thread stays responsive. We then FileReader-read the
  // blob to get the base64 data URL the existing upload
  // pipeline expects.
  const blob = await canvasToBlob(canvas, mimeType, quality);
  const dataUrl = await blobToDataUrl(blob);

  return {
    dataUrl,
    size: blob.size,
    width: tgtW,
    height: tgtH,
    mimeType: blob.type || mimeType,
  };
};

// ============================================================
// HELPERS
// ============================================================

// Load an image from a URL, returning a promise that resolves
// once the image has fully decoded. Throws on load errors
// (e.g. corrupt file, unsupported format).
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Failed to load image. The file may be corrupt or in an unsupported format."));
    img.src = url;
  });
}

// Compute the target dimensions for a resize. We pick the
// largest size that fits inside the maxWidth x maxHeight box
// and preserves the source aspect ratio. Never upscales.
function computeTargetSize(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  // If the source is already within bounds, return as-is.
  // (We don't bother with sub-pixel rounding — the canvas
  // handles non-integer dimensions fine.)
  if (srcW <= maxW && srcH <= maxH) {
    return { width: srcW, height: srcH };
  }
  // Pick the constraint that produces the smaller result
  // (i.e. the one that's tighter relative to the source).
  const ratioW = maxW / srcW;
  const ratioH = maxH / srcH;
  const ratio = Math.min(ratioW, ratioH);
  return {
    width: Math.round(srcW * ratio),
    height: Math.round(srcH * ratio),
  };
}

// Wrap canvas.toBlob in a promise. toBlob is the modern API
// and runs the encoder off the main thread.
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode image"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

// Read a Blob as a base64 data URL using FileReader. We could
// also use Response/arrayBuffer + btoa, but FileReader is
// the most battle-tested path and matches the existing code
// style in MenuManagement.
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}
