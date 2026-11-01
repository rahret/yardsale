"use client";

/** Phone photos are 3–5 MB; buyers load them over cellular at the curb.
 * Before upload, a photo is scaled to at most MAX_EDGE pixels on its long
 * side and re-saved as JPEG. That also applies the camera's rotation and
 * drops its EXIF data (including the GPS location of the seller's home).
 * Anything the browser can't decode is uploaded as it is. */
export const MAX_EDGE = 1600;
const QUALITY = 0.85;

/** The scaled size for a photo, keeping its shape. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function shrinkImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    // keep the original if re-saving didn't actually make it smaller
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
