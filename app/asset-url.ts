export function assetUrl(path: string) {
  const relativePath = path.replace(/^\/+/, "");
  const configuredBase = import.meta.env?.BASE_URL || "/";
  const base = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;
  return `${base}${relativePath}`;
}
