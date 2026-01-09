export function readPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".").filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    if (!(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function resolveTokenKey(
  assetSymbol: string,
  tokens: Record<string, string>,
): string | undefined {
  const normalized = assetSymbol.trim().toLowerCase();
  for (const key of Object.keys(tokens)) {
    if (key.toLowerCase() === normalized) return key;
  }
  return undefined;
}
