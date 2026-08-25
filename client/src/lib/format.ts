export function formatMoney(value: number | null | undefined, currency = "CNY") {
  if (value == null || !Number.isFinite(value)) return "未披露";
  const symbol = currency === "USD" ? "$" : currency === "HKD" ? "HK$" : "¥";
  if (Math.abs(value) >= 100_000_000) return `${symbol}${(value / 100_000_000).toFixed(1)}亿`;
  if (Math.abs(value) >= 10_000) return `${symbol}${(value / 10_000).toFixed(value >= 1_000_000 ? 0 : 1)}万`;
  return `${symbol}${value.toLocaleString("zh-CN")}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

export function formatDateCompact(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(value))
    .replaceAll("/", "-");
}

export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
