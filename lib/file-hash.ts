// Browser-side SHA-256 hashing.
// Uses the Web Crypto API — runs only in the browser / service worker.
// Used by the capture page to hash the raw photo bytes before upload so
// media.sha256 matches what the server records.

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256OfBlob(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer());
}
