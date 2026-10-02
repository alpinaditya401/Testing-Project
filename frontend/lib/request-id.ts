// request_id membuat perintah kontrol idempoten di server (API.md: 1-120 karakter
// ASCII alnum/:_.-). crypto.randomUUID hanya ada di secure context, padahal
// dashboard juga dibuka lewat http://<IP-LAN> dari HP di kolam. Di sana pemanggilan
// langsung melempar TypeError dan tombol kontrol diam tanpa pesan.
// crypto.getRandomValues tersedia di semua konteks, jadi itu cadangannya.
export function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
