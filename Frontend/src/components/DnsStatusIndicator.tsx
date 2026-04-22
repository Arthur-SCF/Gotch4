import { useQuery } from '@tanstack/react-query';
import { Badge } from './ui/badge';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { apiFetch } from '@/lib/apiFetch';
import { API_URL } from '@/lib/config';

// Types (will be replaced with actual RPC types later)
interface DnsStatus {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  nsConfigured: boolean;
  domain: string | null;
  responseIp: string | null;
}

export function DnsStatusIndicator() {
  const { data: status } = useQuery<DnsStatus>({
    queryKey: ['dns-status'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/dns/status`);
      if (!res.ok) throw new Error('Failed to fetch DNS status');
      return await res.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });

  if (!status) {
    return null;
  }

  // Not configured state
  if (!status.configured) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1.5 cursor-help">
              <WifiOff className="w-3 h-3" />
              <span className="hidden sm:inline">DNS</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">DNS not configured</p>
            <p className="text-xs text-muted-foreground">Configure in Settings</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Configured but disabled
  if (!status.enabled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1.5 cursor-help">
              <WifiOff className="w-3 h-3" />
              <span className="hidden sm:inline">DNS</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">DNS server disabled</p>
            {status.domain && (
              <p className="text-xs text-muted-foreground">{status.domain}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Three states: healthy (running + NS ok), degraded (running but NS not configured), error (not running)
  const isHealthy = status.enabled && status.running && status.nsConfigured;
  const isDegraded = status.enabled && status.running && !status.nsConfigured;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={isHealthy ? "default" : isDegraded ? "outline" : "destructive"}
            className={`gap-1.5 cursor-help${isDegraded ? " border-yellow-500 text-yellow-600 dark:text-yellow-400" : ""}`}
          >
            {isHealthy ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">DNS</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">
            {isHealthy ? 'DNS server active' : isDegraded ? 'DNS running — NS not configured' : 'DNS server error'}
          </p>
          {isDegraded && (
            <p className="text-xs text-muted-foreground">NS records not found at registrar</p>
          )}
          {status.domain && (
            <p className="text-xs text-muted-foreground">{status.domain}</p>
          )}
          {status.responseIp && (
            <p className="text-xs text-muted-foreground">→ {status.responseIp}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
