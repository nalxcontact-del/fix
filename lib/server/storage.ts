function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.SUPABASE_STORAGE_BUCKET?.trim());
}

function parseDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) return null;
  return { mime, bytes };
}

function extensionForMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}

export async function storeImageDataUrl(input: string, objectPrefix: string) {
  if (!supabaseConfigured()) return input;
  const parsed = parseDataUrl(input);
  if (!parsed || !parsed.mime.startsWith("image/")) return input;
  const maxBytes = 2_000_000;
  if (parsed.bytes.byteLength > maxBytes) throw new Error("IMAGE_TOO_LARGE");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET!.trim();
  const objectPath = `${objectPrefix}/${crypto.randomUUID()}.${extensionForMime(parsed.mime)}`;
  const url = `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      "Content-Type": parsed.mime,
      "x-upsert": "true",
    },
    body: parsed.bytes,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`STORAGE_UPLOAD_${response.status}`);
  const publicBase = process.env.SUPABASE_STORAGE_PUBLIC_BASE_URL?.trim() || `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}`;
  return `${publicBase}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
}
