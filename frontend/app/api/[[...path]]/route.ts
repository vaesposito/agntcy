// assisted-by Codex Codex-sonnet-4-6

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function configuredApiBase(): URL | Response {
  const rawBase = process.env.TTT_API_URL?.trim();
  if (!rawBase) {
    return Response.json(
      { detail: "TTT_API_URL is not configured" },
      { status: 503 },
    );
  }

  let base: URL;
  try {
    base = new URL(rawBase);
  } catch {
    return Response.json(
      { detail: "TTT_API_URL is invalid" },
      { status: 500 },
    );
  }

  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return Response.json(
      { detail: "TTT_API_URL must use http or https" },
      { status: 500 },
    );
  }

  return base;
}

function filterHeaders(headers: Headers): Headers {
  const filtered = new Headers(headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    filtered.delete(header);
  }
  return filtered;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const base = configuredApiBase();
  if (base instanceof Response) return base;

  const { path = [] } = await context.params;
  const requestUrl = new URL(request.url);
  const target = new URL(base);
  target.pathname = [
    base.pathname.replace(/\/+$/, ""),
    "api",
    ...path.map((segment) => encodeURIComponent(segment)),
  ].join("/");
  target.search = requestUrl.search;

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const upstream = await fetch(target, {
    method,
    headers: filterHeaders(request.headers),
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: filterHeaders(upstream.headers),
  });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}
