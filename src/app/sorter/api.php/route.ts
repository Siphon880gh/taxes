import { ensureSorterPhp, SORTER_PHP_ORIGIN } from "@/lib/sorter-php";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(request: Request): Promise<Response> {
  try {
    await ensureSorterPhp();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The document sorter is not available.";
    return Response.json({ ok: false, error: message }, { status: 503 });
  }

  const incoming = new URL(request.url);
  const target = new URL(`${SORTER_PHP_ORIGIN}/api.php`);
  target.search = incoming.search;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Buffer.from(await request.arrayBuffer());
  }

  try {
    const upstream = await fetch(target, init);
    const payload = await upstream.arrayBuffer();
    return new Response(payload, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ ok: false, error: "The document sorter did not respond." }, { status: 503 });
  }
}

export function GET(request: Request) {
  return forward(request);
}

export function POST(request: Request) {
  return forward(request);
}
