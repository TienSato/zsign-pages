// functions/plist.js — Cloudflare Pages Function
// Thay cho plist.php / server.php. Route: https://sign.zsign.app/plist
// Nhận param thường (KHÔNG mã hoá): bundleid, name, version, fetchurl, smallimage, largeimage, t
export function onRequestGet({ request }) {
  const p = new URL(request.url).searchParams;
  const g = (k) => (p.get(k) || "").trim();

  const bundleid = g("bundleid");
  const name     = g("name");
  const version  = g("version");
  const fetchurl = g("fetchurl");
  const small    = g("smallimage");
  const large    = g("largeimage");

  // Param bắt buộc
  if (!bundleid || !name || !fetchurl) {
    return new Response("Bad Request", { status: 400 });
  }

  // (tuỳ chọn) Chặn link cũ quá 15 phút — hạn chế bị lưu lại & phát tán.
  // KHÔNG bắt buộc vì check này không cứu quota; chống spam chính là Rate Limiting ở edge.
  const t = parseInt(g("t"), 10);
  if (t && Math.abs(Date.now() / 1000 - t) > 900) {
    return new Response("Expired", { status: 403 });
  }

  const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c]));

  const asset = (kind, url) => url
    ? `                <dict>
                    <key>kind</key>
                    <string>${kind}</string>
                    <key>url</key>
                    <string>${esc(url)}</string>
                </dict>`
    : "";

  const assets = [
    asset("software-package", fetchurl),
    asset("display-image", small),
    asset("full-size-image", large),
  ].filter(Boolean).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
${assets}
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${esc(bundleid)}</string>
                <key>bundle-version</key>
                <string>${esc(version)}</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${esc(name)}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
}
