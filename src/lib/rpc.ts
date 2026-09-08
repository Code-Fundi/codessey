export function firstRpcRow<T>(data: T | T[] | null | undefined): T | null {
  if (data == null) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}
