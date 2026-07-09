export type SsrfTargetCategory = "loopback" | "metadata" | "rfc1918";

export type SsrfTarget = {
  readonly ip: string;
  readonly label: string;
  readonly description: string;
  readonly category: SsrfTargetCategory;
};

// Curated internal rebind targets surfaced in the DNS toolkit's generator UI.
export const SSRF_TARGETS: readonly SsrfTarget[] = [
  { ip: "127.0.0.1", label: "localhost (127.0.0.1)", description: "IPv4 loopback", category: "loopback" },
  { ip: "0.0.0.0", label: "0.0.0.0", description: "This host, all interfaces — bypasses some 127.0.0.1 filters", category: "loopback" },
  { ip: "169.254.169.254", label: "Cloud IMDS (AWS/GCP/Azure)", description: "Link-local instance metadata service", category: "metadata" },
  { ip: "100.100.100.200", label: "Alibaba Cloud metadata", description: "Alibaba Cloud IMDS", category: "metadata" },
  { ip: "10.0.0.1", label: "RFC1918 10.0.0.1", description: "Private range sample", category: "rfc1918" },
  { ip: "172.16.0.1", label: "RFC1918 172.16.0.1", description: "Private range sample", category: "rfc1918" },
  { ip: "192.168.0.1", label: "RFC1918 192.168.0.1", description: "Private range / common router", category: "rfc1918" },
] as const;
