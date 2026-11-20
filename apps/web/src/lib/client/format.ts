export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

export function todayLabel(): string {
  return new Date().toLocaleDateString("en-IN", { dateStyle: "long" });
}
