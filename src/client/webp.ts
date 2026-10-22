/** Largest original we will try to read; the converted file is far smaller. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/**
 * Re-encodes an upload as WebP, scaled so its longest side is at most
 * `maxSide` pixels and rotated per its EXIF orientation. Browsers that cannot
 * encode WebP get a JPEG instead, which the server also accepts.
 */
export async function toWebp(file: File, maxSide = PHOTO_SIDE): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error(`${file.name} is over 25 MB. Choose a smaller image.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      `${file.name} could not be read. Use a JPEG, PNG or WebP image.`,
    );
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  let blob = webp;
  if (webp?.type !== "image/webp") {
    // JPEG has no transparency: put white behind cut-out PNGs instead of black.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    blob = await encode("image/jpeg");
  }
  if (!blob) throw new Error(`${file.name} could not be converted.`);
  return blob;
}
/** Photos stay sharp on the website; posters keep small specification text legible. */
export const PHOTO_SIDE = 1600;
export const POSTER_SIDE = 2400;

/**
 * Saves the 600 px grid version beside an uploaded image. Best effort: lists
 * fall back to the full image if this fails.
 */
export async function uploadThumb(file: File, mediaUrl: string | null) {
  const key = mediaUrl?.split("/api/media/")[1];
  if (!key) return;
  try {
    await fetch(`/api/admin/media/${key}/thumb`, {
      method: "PUT",
      body: await toWebp(file, 600),
    });
  } catch {
    // The full image still works everywhere.
  }
}
