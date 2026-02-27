const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_RAW_SIZE = 2 * 1024 * 1024;
const OUTPUT_SIZE = 256;
const WEBP_QUALITY = 0.85;

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Please upload a PNG, JPG, WebP, or SVG file";
  }
  if (file.size > MAX_RAW_SIZE) {
    return "File must be under 2MB";
  }
  return null;
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropAndCompress(
  imageSrc: string,
  cropArea: CropArea,
): Promise<string> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  ctx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  const webpUrl = canvas.toDataURL("image/webp", WEBP_QUALITY);
  if (webpUrl.startsWith("data:image/webp")) {
    return webpUrl;
  }
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
