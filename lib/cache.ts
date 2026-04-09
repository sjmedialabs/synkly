/**
 * Lightweight in-memory TTL cache for server-side use.
 *
 * Each named cache instance holds key-value pairs that auto-expire after a
 * configurable TTL.  No external infrastructure (Redis, Memcached, etc.) is
 * required — the cache lives in the Node.js process memory and is cleared on
 * restart/redeploy, which is a safe default.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class ServerCache {
  private store = new Map<string, CacheEntry<unknown>>()
  private readonly defaultTtlMs: number

  constructor(defaultTtlMs: number = 60_000) {
    this.defaultTtlMs = defaultTtlMs
  }

  /** Retrieve a cached value. Returns `undefined` when missing or expired. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value as T
  }

  /** Store a value with an optional per-key TTL (defaults to the instance TTL). */
  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    })
  }

  /** Delete a single key. */
  delete(key: string): void {
    this.store.delete(key)
  }

  /** Delete all keys that start with the given prefix. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key)
      }
    }
  }

  /** Drop everything. */
  clear(): void {
    this.store.clear()
  }

  /** Number of live (non-expired) entries — useful for diagnostics. */
  get size(): number {
    let count = 0
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
      } else {
        count++
      }
    }
    return count
  }
}

// ---------------------------------------------------------------------------
// Named cache instances
// ---------------------------------------------------------------------------

/** Auth context per user — short TTL so permission changes propagate fast. */
export const authCache = new ServerCache(30_000) // 30 s

/** People-table resolution (`team` vs `users`) — doesn't change at runtime. */
export const tableCache = new ServerCache(5 * 60_000) // 5 min

/** Roles, skills, departments, designations, master_data_types. */
export const masterDataCache = new ServerCache(3 * 60_000) // 3 min

/** Dashboard, project list, /me — per-user, medium TTL. */
export const apiCache = new ServerCache(60_000) // 60 s

// ---------------------------------------------------------------------------
// HTTP Cache-Control header helpers
// ---------------------------------------------------------------------------

/**
 * Create a NextResponse.json with Cache-Control headers for browser-level caching.
 * Uses `private` directive since responses are user-specific.
 */
export function cachedJsonResponse<T>(data: T, maxAgeSec: number): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `private, max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec * 2}`,
    },
  })
}

/** Cache-Control for data that almost never changes (roles, master data). */
export function longCacheHeaders(): HeadersInit {
  return { 'Cache-Control': 'private, max-age=180, stale-while-revalidate=360' }
}

/** Cache-Control for frequently changing per-user data (dashboard, projects). */
export function shortCacheHeaders(): HeadersInit {
  return { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' }
}
