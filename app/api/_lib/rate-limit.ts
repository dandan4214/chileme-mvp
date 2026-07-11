import { NextResponse } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitEntry>;

const globalWithRateLimit = globalThis as typeof globalThis & {
  __chilemeRateLimitStore?: RateLimitStore;
};

const store = globalWithRateLimit.__chilemeRateLimitStore || new Map<string, RateLimitEntry>();
globalWithRateLimit.__chilemeRateLimitStore = store;

function getClientId(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function enforceRateLimit(
  request: Request,
  scope: string,
  options: { limit: number; windowMs: number }
) {
  const now = Date.now();
  const key = `${scope}:${getClientId(request)}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  if (current.count >= options.limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "操作有些频繁，请稍等一会再试。", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Cache-Control": "no-store"
        }
      }
    );
  }

  current.count += 1;
  store.set(key, current);

  if (store.size > 2000) {
    for (const [entryKey, entry] of store) {
      if (entry.resetAt <= now) store.delete(entryKey);
    }
  }

  return null;
}
