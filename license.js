export function getLicenseLabel(url) {
  const normalized = String(url).toLowerCase();
  if (normalized.includes("publicdomain/zero")) return "CC0";
  if (normalized.includes("publicdomain/mark")) return "公有领域标记";
  if (normalized.includes("by-nc-nd")) return "CC BY-NC-ND";
  if (normalized.includes("by-nc-sa")) return "CC BY-NC-SA";
  if (normalized.includes("licenses/by/")) return "CC BY";
  return String(url);
}
