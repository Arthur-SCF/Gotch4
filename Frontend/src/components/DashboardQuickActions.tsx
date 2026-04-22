import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";
import { apiFetch } from "@/lib/apiFetch";
import { useCopyButton } from "@/hooks/useCopyButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "@tanstack/react-router";
import {
  IconCopy,
  IconCopyCheck,
  IconRadar,
  IconAnchor,
  IconWorld,
  IconBriefcase,
  IconCode,
} from "@tabler/icons-react";

interface Settings {
  webhookPath: string;
  webhookUrl: string;
}

export function DashboardQuickActions() {
  const { copy, isCopied } = useCopyButton();

  const { data: settings } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const webhookUrl = settings?.webhookUrl ?? `${API_URL}/${settings?.webhookPath ?? "webhook"}`;
  const grabBaseUrl = `${API_URL}/grab/`;

  const navLinks = [
    { to: "/security/events", label: "Events",   icon: IconRadar },
    { to: "/security/grab",   label: "Grab",     icon: IconAnchor },
    { to: "/security/dns",    label: "DNS Tools", icon: IconWorld },
    { to: "/security/ezxss",  label: "ezXSS",    icon: IconCode },
    { to: "/programs",        label: "Programs", icon: IconBriefcase },
  ];

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Webhook URL copy */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-muted-foreground shrink-0">Webhook:</span>
            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[180px] sm:max-w-[260px]">
              {webhookUrl}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => copy(webhookUrl, "webhook", "webhook URL")}
            >
              {isCopied("webhook") ? (
                <IconCopyCheck className="size-3.5 text-emerald-500" />
              ) : (
                <IconCopy className="size-3.5" />
              )}
            </Button>
          </div>

          <Separator orientation="vertical" className="h-5 hidden sm:block" />

          {/* Grab base URL copy */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs text-muted-foreground shrink-0">Grab:</span>
            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded truncate max-w-[140px] sm:max-w-[200px]">
              {grabBaseUrl}:key
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => copy(grabBaseUrl, "grab", "grab base URL")}
            >
              {isCopied("grab") ? (
                <IconCopyCheck className="size-3.5 text-emerald-500" />
              ) : (
                <IconCopy className="size-3.5" />
              )}
            </Button>
          </div>

          <Separator orientation="vertical" className="h-5 hidden lg:block" />

          {/* Quick nav */}
          <div className="flex items-center gap-1 ml-auto">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to}>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
