import { useQuery } from "@tanstack/react-query";
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Please check the submitted values.",
    );
  }
  return res.json();
}
export function useData<T = any>(path: string) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path),
    retry: 1,
  });
}
export const number = (n: number | null | undefined) =>
  n == null
    ? "—"
    : Intl.NumberFormat("en", {
        notation: n >= 10000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(n);
export const money = (n: number | null | undefined) =>
  n == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(n);
export const duration = (n: number | null | undefined) =>
  n == null
    ? "In progress"
    : n >= 1000
      ? (n / 1000).toFixed(2) + "s"
      : Math.round(n) + "ms";
export const date = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
