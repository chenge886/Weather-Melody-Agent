export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAllowedTarget(url: URL): boolean {
  if (!["http:", "https:"].includes(url.protocol)) return false;

  const whitelist = (process.env.MUSIC_STREAM_PROXY_WHITELIST ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (whitelist.length === 0) return true;

  const host = url.hostname.toLowerCase();
  return whitelist.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("target");

  if (!target) {
    return new Response("missing target", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("invalid target url", { status: 400 });
  }

  if (!isAllowedTarget(targetUrl)) {
    return new Response("target not allowed", { status: 403 });
  }

  const headers: Record<string, string> = {
    "User-Agent": "WeatherMelodyAgent/1.0",
    Accept: "*/*"
  };

  const range = request.headers.get("range");
  if (range) headers.Range = range;

  const upstream = await fetch(targetUrl.toString(), {
    method: "GET",
    headers,
    cache: "no-store"
  });

  if (!upstream.ok || !upstream.body) {
    const details = await upstream.text().catch(() => "");
    return new Response(details || "upstream failed", { status: upstream.status || 502 });
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
  responseHeaders.set("Content-Type", contentType);
  responseHeaders.set("Cache-Control", "no-store");

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  const contentRange = upstream.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  const acceptRanges = upstream.headers.get("accept-ranges");
  responseHeaders.set("Accept-Ranges", acceptRanges ?? "bytes");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

