export function ipFromVpsUrl(vpsUrl: string | null | undefined): string | null {
  if (!vpsUrl) return null;
  const host = vpsUrl.replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : null;
}

/**
 * The benign "attacker/first" IP a rebind payload resolves to before flipping to
 * the internal target — the collab server's own public IP. Local mode stores it as
 * dnsResponseIp; remote mode derives it from an IP-form dnsVpsUrl. Null when neither
 * is available, in which case the operator must supply it explicitly.
 */
export function resolveDefaultAttackerIp(
  dnsResponseIp: string | null | undefined,
  dnsVpsUrl: string | null | undefined,
): string | null {
  return dnsResponseIp || ipFromVpsUrl(dnsVpsUrl) || null;
}
