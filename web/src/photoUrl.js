export function normalizePhotoUrlForImg(url) {
  if (!url) return "";
  const u = String(url).trim();
  const dm = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (dm) return `https://drive.google.com/thumbnail?id=${dm[1]}&sz=s400`;
  if (/drive\.google\.com\/open\?/i.test(u)) {
    const om = u.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (om) return `https://drive.google.com/thumbnail?id=${om[1]}&sz=s400`;
  }
  return u;
}

function extractFirstHttpUrl(s) {
  const m = String(s).match(/https?:\/\/[^\s"'<>\]]+/i);
  if (!m) return "";
  return m[0].replace(/[),.;]+$/g, "");
}

export function photoUrlFromMasterCell(raw) {
  if (raw == null) return "";
  let s = String(raw)
    .trim()
    .replace(/[\u201c\u201d\u2018\u2019]/g, '"');
  if (!s) return "";
  let m = s.match(/^=IMAGE\s*\(\s*"([^"]+)"/i);
  if (m) return normalizePhotoUrlForImg(m[1].trim());
  m = s.match(/^=IMAGE\s*\(\s*'([^']+)'/i);
  if (m) return normalizePhotoUrlForImg(m[1].trim());
  m = s.match(/^=HYPERLINK\s*\(\s*"([^"]+)"/i);
  if (m) return normalizePhotoUrlForImg(m[1].trim());
  m = s.match(/^=HYPERLINK\s*\(\s*'([^']+)'/i);
  if (m) return normalizePhotoUrlForImg(m[1].trim());
  if (/^https?:\/\//i.test(s)) return normalizePhotoUrlForImg(s);
  const extracted = extractFirstHttpUrl(s);
  if (extracted) return normalizePhotoUrlForImg(extracted);
  return "";
}
