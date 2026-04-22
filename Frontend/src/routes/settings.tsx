import { createFileRoute, useLocation } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, XCircle, AlertCircle, AlertTriangle, Loader2, Server, Wifi, WifiOff, Globe, Shield, Terminal, Bell, Send, Slack, Mail, Eye, EyeOff, FileText, Code2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { API_URL } from '@/lib/config';
import { apiFetch } from '@/lib/apiFetch';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

interface Settings {
  id: number;
  dnsEnabled: boolean;
  dnsMode: 'local' | 'remote';
  dnsBaseDomain: string | null;
  dnsResponseIp: string | null;
  dnsTtl: number;
  dnsVpsUrl: string | null;
  dnsWebhookUrl: string | null;
  dnsAuthToken: string | null;
  webhookUrl: string;
  webhookPath: string;
  webhookDomain: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FieldConfig { show: boolean; redact: boolean; }
interface NotifyFieldConfig {
  ip?: FieldConfig; userAgent?: FieldConfig; referer?: FieldConfig;
  cookies?: FieldConfig; body?: FieldConfig; contentType?: FieldConfig;
  contentLength?: FieldConfig; grabKey?: FieldConfig; grabQuery?: FieldConfig;
  dnsQuery?: FieldConfig; ezUri?: FieldConfig; ezScreenshot?: FieldConfig;
}
const FIELD_DEFAULTS: Required<NotifyFieldConfig> = {
  ip:            { show: true, redact: false },
  userAgent:     { show: true, redact: false },
  referer:       { show: true, redact: false },
  cookies:       { show: true, redact: false },
  body:          { show: true, redact: false },
  contentType:   { show: true, redact: false },
  contentLength: { show: true, redact: false },
  grabKey:       { show: true, redact: false },
  grabQuery:     { show: true, redact: false },
  dnsQuery:      { show: true, redact: false },
  ezUri:         { show: true, redact: false },
  ezScreenshot:  { show: true, redact: false },
};
const FIELD_LABELS: Record<keyof NotifyFieldConfig, string> = {
  ip: 'IP Address', userAgent: 'User-Agent', referer: 'Referer',
  cookies: 'Cookies', body: 'Body', contentType: 'Content-Type',
  contentLength: 'Content-Length', grabKey: 'Grab Key', grabQuery: 'Query Params',
  dnsQuery: 'DNS Query', ezUri: 'EZ URI', ezScreenshot: 'EZ Screenshot (Telegram)',
};

const TEMPLATE_VARS: Record<'http' | 'dns' | 'grab' | 'ez', { var: string; desc: string }[]> = {
  http: [
    { var: '{{PROGRAM}}',        desc: 'Program name' },
    { var: '{{IP}}',             desc: 'Source IP address' },
    { var: '{{TIME}}',           desc: 'Timestamp (UTC)' },
    { var: '{{METHOD}}',         desc: 'HTTP method (GET, POST…)' },
    { var: '{{HOST}}',           desc: 'Request host' },
    { var: '{{URL}}',            desc: 'Full URL / path' },
    { var: '{{PROTOCOL}}',       desc: 'http or https' },
    { var: '{{USER_AGENT}}',     desc: 'User-Agent header' },
    { var: '{{REFERER}}',        desc: 'Referer header' },
    { var: '{{CONTENT_TYPE}}',   desc: 'Content-Type header' },
    { var: '{{CONTENT_LENGTH}}', desc: 'Body size in bytes' },
    { var: '{{COOKIES}}',        desc: 'Cookie header' },
    { var: '{{BODY}}',           desc: 'Request body' },
    { var: '{{FILENAME}}',       desc: 'File name (file hit detection only)' },
  ],
  dns: [
    { var: '{{PROGRAM}}',   desc: 'Program name' },
    { var: '{{IP}}',        desc: 'Source IP address' },
    { var: '{{TIME}}',      desc: 'Timestamp (UTC)' },
    { var: '{{DNS_QUERY}}', desc: 'Full DNS query name' },
    { var: '{{DNS_TYPE}}',  desc: 'Record type (A, TXT…)' },
  ],
  grab: [
    { var: '{{PROGRAM}}',     desc: 'Program name' },
    { var: '{{IP}}',          desc: 'Source IP address' },
    { var: '{{TIME}}',        desc: 'Timestamp (UTC)' },
    { var: '{{GRAB_KEY}}',    desc: 'Grab key used' },
    { var: '{{GRAB_METHOD}}', desc: 'HTTP method' },
    { var: '{{GRAB_ORIGIN}}', desc: 'Origin header' },
    { var: '{{GRAB_REFERER}}',desc: 'Referer header' },
    { var: '{{GRAB_UA}}',     desc: 'User-Agent header' },
    { var: '{{GRAB_QUERY}}',  desc: 'Query string' },
    { var: '{{GRAB_BODY}}',   desc: 'Request body' },
  ],
  ez: [
    { var: '{{PROGRAM}}',   desc: 'Program name' },
    { var: '{{IP}}',        desc: 'Source IP address' },
    { var: '{{TIME}}',      desc: 'Timestamp (UTC)' },
    { var: '{{EZ_ORIGIN}}', desc: 'Page origin' },
    { var: '{{EZ_URI}}',    desc: 'Vulnerable page URI' },
    { var: '{{EZ_COOKIES}}',desc: 'Captured cookies' },
  ],
};

const DEFAULT_TEMPLATES: Record<'http' | 'dns' | 'grab' | 'ez', string> = {
  http:
`🎯 *HTTP Capture* — {{PROGRAM}}
────────────────────────────
\`{{METHOD}} {{PROTOCOL}}://{{HOST}}{{URL}}\`

📍 IP           \`{{IP}}\`
🖥 User-Agent  \`{{USER_AGENT}}\`
🔗 Referer     \`{{REFERER}}\`
📦 Content-Type \`{{CONTENT_TYPE}}\`
📏 Content-Length \`{{CONTENT_LENGTH}} bytes\`
🍪 Cookies      \`{{COOKIES}}\`

*Body:*
\`\`\`
{{BODY}}
\`\`\`

⏱ {{TIME}}`,

  dns:
`🌐 *DNS Capture* — {{PROGRAM}}
────────────────────────────
\`{{DNS_QUERY}}\`

📋 Type        \`{{DNS_TYPE}}\`
📍 IP          \`{{IP}}\`

⏱ {{TIME}}`,

  grab:
`🪝 *Grab Capture* — {{PROGRAM}}
────────────────────────────
🔑 Key         \`{{GRAB_KEY}}\`
📡 Method      \`{{GRAB_METHOD}}\`

📍 IP          \`{{IP}}\`
🌍 Origin      \`{{GRAB_ORIGIN}}\`
🔗 Referer     \`{{GRAB_REFERER}}\`
🖥 User-Agent  \`{{GRAB_UA}}\`

*Query Params:*
\`{{GRAB_QUERY}}\`

*Body:*
\`\`\`
{{GRAB_BODY}}
\`\`\`

⏱ {{TIME}}`,

  ez:
`🎭 *EZ Capture* — {{PROGRAM}}
────────────────────────────
🌍 Origin      \`{{EZ_ORIGIN}}\`
🔗 URI         \`{{EZ_URI}}\`

📍 IP          \`{{IP}}\`
🍪 Cookies     \`{{EZ_COOKIES}}\`

⏱ {{TIME}}`,
};

interface NotificationSettings {
  telegramEnabled: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  discordEnabled: boolean;
  discordWebhookUrl: string | null;
  slackEnabled: boolean;
  slackWebhookUrl: string | null;
  emailEnabled: boolean;
  emailSmtpHost: string | null;
  emailSmtpPort: number | null;
  emailSmtpUser: string | null;
  emailSmtpPass: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  notifyOnAllEvents: boolean;
  notifyFieldConfig: string | null;
  notifyTemplate: string | null;
}

interface EzSettings {
  ezCollectDom: boolean;
  ezCollectCookies: boolean;
  ezCollectLocalStorage: boolean;
  ezCollectSessionStorage: boolean;
  ezCollectScreenshot: boolean;
}

interface DnsStatus {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  nsConfigured: boolean;
  domain: string | null;
  responseIp: string | null;
}

interface DnsTestResult {
  success: boolean;
  nsRecords?: string[];
  message: string;
  error?: string;
}

interface FormState {
  dnsMode: 'local' | 'remote';
  dnsBaseDomain: string;
  dnsResponseIp: string;
  dnsTtl: number;
  dnsVpsUrl: string;
  dnsWebhookUrl: string;
  dnsAuthToken: string;
}

interface ValidationErrors {
  dnsBaseDomain?: string;
  dnsResponseIp?: string;
  dnsTtl?: string;
  dnsVpsUrl?: string;
  dnsWebhookUrl?: string;
}

const validateDomain = (domain: string): boolean => {
  if (!domain) return false;
  if (domain === 'localhost') return true;
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  return domainRegex.test(domain);
};

const validateIpAddress = (ip: string): boolean => {
  if (!ip) return false;
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
};

const validateUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return validateIpAddress(url);
  }
};

const sanitizeInput = (input: string): string => input.trim().replace(/[<>]/g, '');

function SettingsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [testResult, setTestResult] = useState<DnsTestResult | null>(null);
  const [formState, setFormState] = useState<FormState>({
    dnsMode: 'local',
    dnsBaseDomain: '',
    dnsResponseIp: '',
    dnsTtl: 0,
    dnsVpsUrl: '',
    dnsWebhookUrl: '',
    dnsAuthToken: '',
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Notification form state
  const [notifForm, setNotifForm] = useState<NotificationSettings>({
    telegramEnabled: false, telegramBotToken: null, telegramChatId: null,
    discordEnabled: false, discordWebhookUrl: null,
    slackEnabled: false, slackWebhookUrl: null,
    emailEnabled: false, emailSmtpHost: null, emailSmtpPort: 587,
    emailSmtpUser: null, emailSmtpPass: null, emailFrom: null, emailTo: null,
    notifyOnAllEvents: false, notifyFieldConfig: null, notifyTemplate: null,
  });
  const [notifHasChanges, setNotifHasChanges] = useState(false);
  const [templateTab, setTemplateTab] = useState<'http' | 'dns' | 'grab' | 'ez'>('http');
  const validSections = ['dns', 'notifications', 'message', 'ez'] as const;
  type Section = typeof validSections[number];
  const hashSection = location.hash?.replace('#', '') as Section;
  const [activeSection, setActiveSection] = useState<Section>(
    validSections.includes(hashSection) ? hashSection : 'dns'
  );

  // EZ capture settings state
  const [ezForm, setEzForm] = useState<EzSettings>({
    ezCollectDom: true, ezCollectCookies: true,
    ezCollectLocalStorage: true, ezCollectSessionStorage: true, ezCollectScreenshot: false,
  });
  const [ezHasChanges, setEzHasChanges] = useState(false);

  // Fetch settings
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings`);
      if (!res.ok) throw new Error('Failed to fetch settings');
      return await res.json();
    },
  });

  // Initialize DNS form from loaded settings
  useEffect(() => {
    if (settings) {
      setFormState({
        dnsMode: settings.dnsMode,
        dnsBaseDomain: settings.dnsBaseDomain || '',
        dnsResponseIp: settings.dnsResponseIp || '',
        dnsTtl: settings.dnsTtl || 0,
        dnsVpsUrl: settings.dnsVpsUrl || '',
        dnsWebhookUrl: settings.dnsWebhookUrl || '',
        dnsAuthToken: settings.dnsAuthToken || '',
      });
      setHasUnsavedChanges(false);
    }
  }, [settings]);

  // Fetch DNS status
  const { data: dnsStatus } = useQuery<DnsStatus>({
    queryKey: ['dns-status'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/dns/status`);
      if (!res.ok) throw new Error('Failed to fetch DNS status');
      return res.json();
    },
    refetchInterval: 5000,
    staleTime: 0,
    gcTime: 0,
  });

  // Fetch notification settings
  const { data: notifSettings } = useQuery<NotificationSettings>({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/notifications`);
      if (!res.ok) throw new Error('Failed to fetch notification settings');
      return res.json();
    },
  });

  // Sync notification form when data loads
  useEffect(() => {
    if (notifSettings) {
      setNotifForm(notifSettings);
      setNotifHasChanges(false);
    }
  }, [notifSettings]);

  const updateNotifField = <K extends keyof NotificationSettings>(field: K, value: NotificationSettings[K]) => {
    setNotifForm((prev) => ({ ...prev, [field]: value }));
    setNotifHasChanges(true);
  };

  // Fetch EZ settings
  const { data: ezSettings } = useQuery<EzSettings>({
    queryKey: ['ez-settings'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/ez`);
      if (!res.ok) throw new Error('Failed to fetch EZ settings');
      return res.json();
    },
  });

  useEffect(() => {
    if (ezSettings) { setEzForm(ezSettings); setEzHasChanges(false); }
  }, [ezSettings]);

  const updateEzField = <K extends keyof EzSettings>(field: K, value: EzSettings[K]) => {
    setEzForm((prev) => ({ ...prev, [field]: value }));
    setEzHasChanges(true);
  };

  const updateEz = useMutation({
    mutationFn: async (data: EzSettings) => {
      const res = await apiFetch(`${API_URL}/api/settings/ez`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save EZ settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ez-settings'] });
      setEzHasChanges(false);
      toast.success('EZ capture settings saved');
    },
    onError: () => toast.error('Failed to save EZ settings'),
  });

  // Validate DNS form
  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};
    if (formState.dnsBaseDomain && !validateDomain(formState.dnsBaseDomain)) {
      errors.dnsBaseDomain = 'Invalid domain format (e.g., collab.example.com)';
    }
    if (formState.dnsMode === 'local' && formState.dnsResponseIp && !validateIpAddress(formState.dnsResponseIp)) {
      errors.dnsResponseIp = 'Invalid IP address format';
    }
    if (formState.dnsTtl < 0) {
      errors.dnsTtl = 'TTL must be non-negative';
    }
    if (formState.dnsMode === 'remote' && formState.dnsVpsUrl && !validateUrl(formState.dnsVpsUrl)) {
      errors.dnsVpsUrl = 'Invalid URL or IP address';
    }
    if (formState.dnsMode === 'remote' && formState.dnsWebhookUrl && !validateUrl(formState.dnsWebhookUrl)) {
      errors.dnsWebhookUrl = 'Invalid webhook URL';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Toggle DNS mutation
  const toggleDns = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/dns/toggle`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        const error: any = new Error(json.error || 'Failed to toggle DNS');
        error.details = json.details;
        throw error;
      }
      return json;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData<Settings>(['settings'], (old) =>
        old ? { ...old, dnsEnabled: data.enabled } : old
      );
      await queryClient.refetchQueries({ queryKey: ['dns-status'] });
      toast.success(data.enabled ? 'DNS server enabled' : 'DNS server disabled');
    },
    onError: async (error: any) => {
      await queryClient.refetchQueries({ queryKey: ['settings'] });
      await queryClient.refetchQueries({ queryKey: ['dns-status'] });
      if (error.details && Array.isArray(error.details)) {
        const msgs = error.details.map((d: any) => `${d.field}: ${d.message}`).join('\n');
        toast.error(`Cannot enable DNS:\n${msgs}`, { duration: 5000 });
      } else {
        toast.error(error.message || 'Failed to toggle DNS server');
      }
    },
  });

  // Update DNS settings mutation
  const updateDns = useMutation({
    mutationFn: async (data: Partial<FormState>) => {
      const res = await apiFetch(`${API_URL}/api/settings/dns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        const error: any = new Error(json.error || 'Failed to update DNS settings');
        error.details = json.details;
        throw error;
      }
      return json;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['settings'] });
      await queryClient.refetchQueries({ queryKey: ['dns-status'] });
      setHasUnsavedChanges(false);
    },
    onError: (error: any) => {
      if (error.details && Array.isArray(error.details)) {
        const backendErrors: ValidationErrors = {};
        error.details.forEach((detail: { field: string; message: string }) => {
          backendErrors[detail.field as keyof ValidationErrors] = detail.message;
        });
        setValidationErrors(backendErrors);
        toast.error('Server validation failed - check the form for errors');
      } else {
        toast.error(error.message || 'Failed to save DNS settings');
      }
    },
  });

  const handleSave = () => {
    if (!validateForm()) {
      toast.error('Please fix validation errors before saving');
      return;
    }
    const sanitizedData = {
      dnsMode: formState.dnsMode,
      dnsBaseDomain: sanitizeInput(formState.dnsBaseDomain),
      dnsResponseIp: sanitizeInput(formState.dnsResponseIp),
      dnsTtl: formState.dnsTtl,
      dnsVpsUrl: sanitizeInput(formState.dnsVpsUrl),
      dnsWebhookUrl: sanitizeInput(formState.dnsWebhookUrl),
      dnsAuthToken: sanitizeInput(formState.dnsAuthToken),
    };
    updateDns.mutate(sanitizedData, {
      onSuccess: () => toast.success('DNS settings saved successfully'),
    });
  };

  const updateFormField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    if (validationErrors[field as keyof ValidationErrors]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof ValidationErrors];
        return newErrors;
      });
    }
  };

  // Test DNS mutation
  const testDns = useMutation({
    mutationFn: async (domain: string) => {
      const res = await apiFetch(`${API_URL}/api/settings/dns/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      return await res.json();
    },
    onSuccess: (data) => setTestResult(data),
  });

  // Update notification settings mutation
  const updateNotifications = useMutation({
    mutationFn: async (data: Partial<NotificationSettings>) => {
      const res = await apiFetch(`${API_URL}/api/settings/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save notification settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      setNotifHasChanges(false);
      toast.success('Notification settings saved');
    },
    onError: () => toast.error('Failed to save notification settings'),
  });

  // Test notification mutation
  const testNotification = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/notifications/test`, { method: 'POST' });
      if (!res.ok) throw new Error('Test failed');
      return res.json();
    },
    onSuccess: () => toast.success('Test notification sent!'),
    onError: () => toast.error('Failed to send test notification — check your credentials'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Nav items definition (inside render so it can reference live state)
  const navItems = [
    { id: 'dns'           as const, label: 'DNS Server',    icon: Server,   dot: hasUnsavedChanges },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell,     dot: notifHasChanges },
    { id: 'message'       as const, label: 'Message',       icon: FileText, dot: notifHasChanges },
    { id: 'ez'            as const, label: 'EZ Capture',    icon: Code2,    dot: ezHasChanges },
  ];

  return (
    <div className="container mx-auto py-6 max-w-5xl px-4 sm:px-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your bug bounty capture server</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        {/* Mobile: horizontal scrollable tab strip */}
        <div className="md:hidden flex overflow-x-auto gap-1 border-b pb-2 mb-2 -mx-1 px-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap relative shrink-0 transition-colors ${
                activeSection === item.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
              {item.dot && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />}
              {item.id === 'dns' && dnsStatus?.enabled && (
                <span className={`w-1.5 h-1.5 rounded-full ${dnsStatus.running && dnsStatus.nsConfigured ? 'bg-green-500' : 'bg-amber-500'}`} />
              )}
            </button>
          ))}
        </div>
        {/* Desktop: vertical left nav */}
        <nav className="hidden md:block w-48 shrink-0 space-y-0.5 sticky top-6 self-start">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors relative ${
                activeSection === item.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
              {item.dot && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-amber-500 rounded-full" />
              )}
              {item.id === 'dns' && dnsStatus?.enabled && (
                <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${dnsStatus.running && dnsStatus.nsConfigured ? 'bg-green-500' : 'bg-amber-500'}`} />
              )}
            </button>
          ))}
        </nav>

        {/* ── Right content ── */}
        <div className="flex-1 min-w-0">

      {/* DNS Configuration Card */}
      {activeSection === 'dns' && <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>DNS Server</CardTitle>
                <CardDescription>
                  Capture DNS queries for blind SSRF and data exfiltration detection
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {dnsStatus && (() => {
                const healthy  = dnsStatus.enabled && dnsStatus.running && dnsStatus.nsConfigured;
                const degraded = dnsStatus.enabled && (!dnsStatus.running || !dnsStatus.nsConfigured);
                return (
                  <Badge
                    variant={healthy ? "default" : degraded ? "outline" : "secondary"}
                    className={`gap-1.5${degraded ? " border-amber-500 text-amber-600 dark:text-amber-400" : ""}`}
                  >
                    {healthy ? (
                      <><Wifi className="w-3 h-3" />Active</>
                    ) : degraded ? (
                      <><AlertTriangle className="w-3 h-3" />Degraded</>
                    ) : dnsStatus.configured ? (
                      <><WifiOff className="w-3 h-3" />Inactive</>
                    ) : (
                      <><XCircle className="w-3 h-3" />Not Configured</>
                    )}
                  </Badge>
                );
              })()}
              <Switch
                checked={settings?.dnsEnabled || false}
                onCheckedChange={() => toggleDns.mutate()}
                disabled={toggleDns.isPending}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!dnsStatus?.configured && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>DNS Not Configured</AlertTitle>
              <AlertDescription>
                Configure your DNS domain below to enable DNS capture functionality.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {/* DNS Mode Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Deployment Mode</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateFormField('dnsMode', 'local')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${formState.dnsMode === 'local' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                >
                  <div className="flex items-start gap-3">
                    <Server className="w-5 h-5 mt-0.5" />
                    <div>
                      <p className="font-medium">Local DNS Server</p>
                      <p className="text-xs text-muted-foreground mt-1">App has public IP. DNS runs on same server.</p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => updateFormField('dnsMode', 'remote')}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${formState.dnsMode === 'remote' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                >
                  <div className="flex items-start gap-3">
                    <Globe className="w-5 h-5 mt-0.5" />
                    <div>
                      <p className="font-medium">Remote DNS Server (VPS)</p>
                      <p className="text-xs text-muted-foreground mt-1">App uses Cloudflare Tunnel. DNS runs on separate VPS.</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <Separator />

            {/* Base Domain */}
            <div className="space-y-2">
              <Label htmlFor="dnsBaseDomain" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />Base Domain
              </Label>
              <Input
                id="dnsBaseDomain"
                placeholder="collab.yourdomain.com"
                value={formState.dnsBaseDomain}
                onChange={(e) => updateFormField('dnsBaseDomain', e.target.value)}
                className={validationErrors.dnsBaseDomain ? 'border-red-500' : ''}
              />
              {validationErrors.dnsBaseDomain && <p className="text-xs text-red-500">{validationErrors.dnsBaseDomain}</p>}
              <p className="text-xs text-muted-foreground">The domain that will receive DNS queries (e.g., *.collab.yourdomain.com)</p>
            </div>

            {/* Local Mode: Response IP */}
            {formState.dnsMode === 'local' && (
              <div className="space-y-2">
                <Label htmlFor="dnsResponseIp" className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />Response IP Address
                </Label>
                <Input
                  id="dnsResponseIp"
                  placeholder="1.2.3.4"
                  value={formState.dnsResponseIp}
                  onChange={(e) => updateFormField('dnsResponseIp', e.target.value)}
                  className={validationErrors.dnsResponseIp ? 'border-red-500' : ''}
                />
                {validationErrors.dnsResponseIp && <p className="text-xs text-red-500">{validationErrors.dnsResponseIp}</p>}
                <p className="text-xs text-muted-foreground">IP address to return in DNS A record responses (your server's public IP)</p>
              </div>
            )}

            {/* Remote Mode: VPS Configuration */}
            {formState.dnsMode === 'remote' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dnsVpsUrl" className="flex items-center gap-2"><Server className="w-4 h-4" />VPS URL/IP</Label>
                  <Input id="dnsVpsUrl" placeholder="https://vps.yourdomain.com or 1.2.3.4" value={formState.dnsVpsUrl} onChange={(e) => updateFormField('dnsVpsUrl', e.target.value)} className={validationErrors.dnsVpsUrl ? 'border-red-500' : ''} />
                  {validationErrors.dnsVpsUrl && <p className="text-xs text-red-500">{validationErrors.dnsVpsUrl}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dnsWebhookUrl" className="flex items-center gap-2"><Globe className="w-4 h-4" />Webhook Callback URL</Label>
                  <Input id="dnsWebhookUrl" placeholder="https://your-tunnel.trycloudflare.com/api/dns/callback" value={formState.dnsWebhookUrl} onChange={(e) => updateFormField('dnsWebhookUrl', e.target.value)} className={validationErrors.dnsWebhookUrl ? 'border-red-500' : ''} />
                  {validationErrors.dnsWebhookUrl && <p className="text-xs text-red-500">{validationErrors.dnsWebhookUrl}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dnsAuthToken" className="flex items-center gap-2"><Shield className="w-4 h-4" />Authentication Token</Label>
                  <div className="flex gap-2">
                    <Input id="dnsAuthToken" type="password" placeholder="Enter or generate a secure token" value={formState.dnsAuthToken} onChange={(e) => updateFormField('dnsAuthToken', e.target.value)} />
                    <Button variant="outline" onClick={() => { updateFormField('dnsAuthToken', crypto.randomUUID()); toast.success('Token generated. Click Save to apply changes.'); }}>Generate</Button>
                    <Button variant="outline" disabled={!formState.dnsAuthToken || formState.dnsAuthToken === '***'} onClick={() => { navigator.clipboard.writeText(formState.dnsAuthToken); toast.success('Token copied to clipboard.'); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
                <Alert>
                  <Server className="h-4 w-4" />
                  <AlertTitle>VPS Setup Required</AlertTitle>
                  <AlertDescription className="text-xs mt-1">You'll need to install the DNS server on your VPS. After configuring settings here, copy the setup command from the instructions below.</AlertDescription>
                </Alert>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="dnsTtl">TTL (seconds)</Label>
              <Input id="dnsTtl" type="number" min="0" value={formState.dnsTtl} onChange={(e) => updateFormField('dnsTtl', parseInt(e.target.value) || 0)} className={validationErrors.dnsTtl ? 'border-red-500' : ''} />
              {validationErrors.dnsTtl && <p className="text-xs text-red-500">{validationErrors.dnsTtl}</p>}
            </div>

            {hasUnsavedChanges && (
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                <AlertTitle className="text-amber-800 dark:text-amber-400">Unsaved Changes</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-500">You have unsaved changes. Click "Save Changes" to apply them.</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={updateDns.isPending || !hasUnsavedChanges} className="min-w-[120px]">
                {updateDns.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {hasUnsavedChanges ? 'Save Changes' : 'Saved'}
              </Button>
              {formState.dnsBaseDomain && (
                <Button variant="outline" onClick={() => testDns.mutate(formState.dnsBaseDomain)} disabled={testDns.isPending || hasUnsavedChanges}>
                  {testDns.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Test DNS Configuration
                </Button>
              )}
            </div>

            {testResult && (
              <Alert variant={testResult.success ? "default" : "destructive"}>
                {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertTitle>{testResult.success ? 'DNS Configuration Valid' : 'DNS Configuration Issue'}</AlertTitle>
                <AlertDescription>
                  {testResult.message}
                  {testResult.nsRecords && (
                    <div className="mt-2">
                      <p className="text-xs font-medium">NS Records:</p>
                      <ul className="text-xs list-disc list-inside">{testResult.nsRecords.map((r) => <li key={r}>{r}</li>)}</ul>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Setup Instructions */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium flex items-center gap-2 hover:text-primary transition-colors">
              <Shield className="w-4 h-4" />
              Setup Instructions ({formState.dnsMode === 'local' ? 'Local Mode' : 'Remote Mode'})
            </summary>
            <Alert className="mt-4">
              <AlertTitle>How to Enable DNS Capture - {formState.dnsMode === 'local' ? 'Local Mode' : 'Remote Mode (VPS)'}</AlertTitle>
              <AlertDescription className="space-y-3 mt-3">
                {formState.dnsMode === 'local' ? (
                  <>
                    <div>
                      <p className="font-semibold text-sm mb-2">1. Domain Configuration</p>
                      <pre className="bg-muted p-3 rounded mt-2 text-xs overflow-x-auto">{`collab.yourdomain.com.  IN  NS  ns1.yourdomain.com.\nns1.yourdomain.com.     IN  A   YOUR_SERVER_PUBLIC_IP`}</pre>
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-2">2. Firewall — open port 53 (UDP+TCP)</p>
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-2">3. Server Privileges</p>
                      <pre className="bg-muted p-3 rounded mt-2 text-xs overflow-x-auto">{`sudo setcap 'cap_net_bind_service=+ep' $(which bun)`}</pre>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="font-semibold text-sm mb-2">1. Point NS records to your VPS IP</p>
                      <pre className="bg-muted p-3 rounded mt-2 text-xs overflow-x-auto">{`collab.yourdomain.com.  IN  NS  ns1.yourdomain.com.\nns1.yourdomain.com.     IN  A   YOUR_VPS_PUBLIC_IP`}</pre>
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-2">2. Configure DNS server on VPS</p>
                      <pre className="bg-muted p-3 rounded mt-2 text-xs overflow-x-auto">{`dns-server configure \\\n  --domain "${formState.dnsBaseDomain || 'collab.yourdomain.com'}" \\\n  --webhook "${formState.dnsWebhookUrl || 'https://your-tunnel.trycloudflare.com/api/dns/callback'}" \\\n  --token "${formState.dnsAuthToken || 'YOUR_AUTH_TOKEN'}"`}</pre>
                    </div>
                  </>
                )}
              </AlertDescription>
            </Alert>
          </details>
        </CardContent>
      </Card>}

      {/* ── Notifications Card ────────────────────────────────────────────────── */}
      {activeSection === 'notifications' && <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Get alerted on Telegram, Discord, Slack, or Email when a capture comes in
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Notify scope setting */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Notify on all captures</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When off, notifications are only sent for captures that match a program scope
              </p>
            </div>
            <Switch
              checked={notifForm.notifyOnAllEvents}
              onCheckedChange={(v) => updateNotifField('notifyOnAllEvents', v)}
            />
          </div>

          <Separator />

          {/* Telegram */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-500" />
                <Label className="text-base font-semibold">Telegram</Label>
                {notifForm.telegramEnabled && <Badge variant="default" className="text-xs">Enabled</Badge>}
              </div>
              <Switch checked={notifForm.telegramEnabled} onCheckedChange={(v) => updateNotifField('telegramEnabled', v)} />
            </div>
            {notifForm.telegramEnabled && (
              <div className="space-y-3 pl-6">
                <div className="space-y-1.5">
                  <Label htmlFor="tg-token" className="text-sm">Bot Token</Label>
                  <Input id="tg-token" type="password"
                    placeholder={notifForm.telegramBotToken === '***' ? 'Token saved (enter new to change)' : '1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ'}
                    onChange={(e) => updateNotifField('telegramBotToken', e.target.value || null)}
                    className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@BotFather</a></p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tg-chat" className="text-sm">Chat ID</Label>
                  <Input id="tg-chat" placeholder="-100123456789"
                    value={notifForm.telegramChatId ?? ''}
                    onChange={(e) => updateNotifField('telegramChatId', e.target.value || null)}
                    className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">Your personal chat ID or a group/channel ID</p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Discord */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-500" />
                <Label className="text-base font-semibold">Discord</Label>
                {notifForm.discordEnabled && <Badge variant="default" className="text-xs">Enabled</Badge>}
              </div>
              <Switch checked={notifForm.discordEnabled} onCheckedChange={(v) => updateNotifField('discordEnabled', v)} />
            </div>
            {notifForm.discordEnabled && (
              <div className="space-y-3 pl-6">
                <div className="space-y-1.5">
                  <Label htmlFor="discord-url" className="text-sm">Webhook URL</Label>
                  <Input id="discord-url" placeholder="https://discord.com/api/webhooks/..."
                    value={notifForm.discordWebhookUrl ?? ''}
                    onChange={(e) => updateNotifField('discordWebhookUrl', e.target.value || null)}
                    className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">Server Settings → Integrations → Webhooks → New Webhook</p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Slack */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Slack className="w-4 h-4 text-green-500" />
                <Label className="text-base font-semibold">Slack</Label>
                {notifForm.slackEnabled && <Badge variant="default" className="text-xs">Enabled</Badge>}
              </div>
              <Switch checked={notifForm.slackEnabled} onCheckedChange={(v) => updateNotifField('slackEnabled', v)} />
            </div>
            {notifForm.slackEnabled && (
              <div className="space-y-3 pl-6">
                <div className="space-y-1.5">
                  <Label htmlFor="slack-url" className="text-sm">Webhook URL</Label>
                  <Input id="slack-url" placeholder="https://hooks.slack.com/services/..."
                    value={notifForm.slackWebhookUrl ?? ''}
                    onChange={(e) => updateNotifField('slackWebhookUrl', e.target.value || null)}
                    className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">Your Workspace → Apps → Incoming Webhooks → Add New Webhook</p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Email (SMTP) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-orange-500" />
                <Label className="text-base font-semibold">Email (SMTP)</Label>
                {notifForm.emailEnabled && <Badge variant="default" className="text-xs">Enabled</Badge>}
              </div>
              <Switch checked={notifForm.emailEnabled} onCheckedChange={(v) => updateNotifField('emailEnabled', v)} />
            </div>
            {notifForm.emailEnabled && (
              <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-host" className="text-sm">SMTP Host</Label>
                  <Input id="smtp-host" placeholder="smtp.gmail.com"
                    value={notifForm.emailSmtpHost ?? ''}
                    onChange={(e) => updateNotifField('emailSmtpHost', e.target.value || null)}
                    className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-port" className="text-sm">Port</Label>
                  <Input id="smtp-port" type="number" placeholder="587"
                    value={notifForm.emailSmtpPort ?? 587}
                    onChange={(e) => updateNotifField('emailSmtpPort', parseInt(e.target.value) || 587)}
                    className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-user" className="text-sm">Username</Label>
                  <Input id="smtp-user" placeholder="you@gmail.com"
                    value={notifForm.emailSmtpUser ?? ''}
                    onChange={(e) => updateNotifField('emailSmtpUser', e.target.value || null)}
                    className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-pass" className="text-sm">Password / App Password</Label>
                  <Input id="smtp-pass" type="password"
                    placeholder={notifForm.emailSmtpPass === '***' ? 'Saved (enter new to change)' : 'App password'}
                    onChange={(e) => updateNotifField('emailSmtpPass', e.target.value || null)}
                    className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-from" className="text-sm">From</Label>
                  <Input id="email-from" placeholder="alerts@yourdomain.com"
                    value={notifForm.emailFrom ?? ''}
                    onChange={(e) => updateNotifField('emailFrom', e.target.value || null)}
                    className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-to" className="text-sm">To</Label>
                  <Input id="email-to" placeholder="you@yourdomain.com"
                    value={notifForm.emailTo ?? ''}
                    onChange={(e) => updateNotifField('emailTo', e.target.value || null)}
                    className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">Comma-separated for multiple recipients</p>
                </div>
              </div>
            )}
          </div>

          {/* Save + Test (Notifications section) */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => updateNotifications.mutate(notifForm)}
              disabled={updateNotifications.isPending || !notifHasChanges}
              className="min-w-[120px]"
            >
              {updateNotifications.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {notifHasChanges ? 'Save' : 'Saved'}
            </Button>
            <Button
              variant="outline"
              onClick={() => testNotification.mutate()}
              disabled={
                testNotification.isPending || notifHasChanges ||
                (!notifForm.telegramEnabled && !notifForm.discordEnabled && !notifForm.slackEnabled && !notifForm.emailEnabled)
              }
              title={notifHasChanges ? 'Save first' : (!notifForm.telegramEnabled && !notifForm.discordEnabled && !notifForm.slackEnabled && !notifForm.emailEnabled) ? 'Enable at least one channel' : ''}
            >
              {testNotification.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Test
            </Button>
          </div>
        </CardContent>
      </Card>}

      {/* ── Message Card ────────────────────────────────────────────────────── */}
      {activeSection === 'message' && <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Message Format</CardTitle>
              <CardDescription>Control which fields appear in alerts and customise the message template</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Message Fields */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Message Fields</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Control what appears in each alert. Redact shows the field label but hides the value with <code className="bg-muted px-1 rounded text-xs">[REDACTED]</code>.
              </p>
            </div>
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Field</th>
                    <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-16">
                      <span className="flex items-center justify-center gap-1"><Eye className="w-3 h-3" />Show</span>
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-xs text-muted-foreground w-20">
                      <span className="flex items-center justify-center gap-1"><EyeOff className="w-3 h-3" />Redact</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(FIELD_DEFAULTS) as (keyof NotifyFieldConfig)[]).map((key, i) => {
                    const parsed: NotifyFieldConfig = (() => {
                      try { return notifForm.notifyFieldConfig ? JSON.parse(notifForm.notifyFieldConfig) : {}; }
                      catch { return {}; }
                    })();
                    const cfg = { ...FIELD_DEFAULTS[key], ...parsed[key] };
                    const updateField = (patch: Partial<FieldConfig>) => {
                      const current: NotifyFieldConfig = (() => {
                        try { return notifForm.notifyFieldConfig ? JSON.parse(notifForm.notifyFieldConfig) : {}; }
                        catch { return {}; }
                      })();
                      const next = { ...current, [key]: { ...FIELD_DEFAULTS[key], ...current[key], ...patch } };
                      updateNotifField('notifyFieldConfig', JSON.stringify(next));
                    };
                    return (
                      <tr key={key} className={`border-b last:border-b-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <td className="px-3 py-2 font-medium text-sm">{FIELD_LABELS[key]}</td>
                        <td className="px-3 py-2 text-center">
                          <Switch
                            checked={cfg.show}
                            onCheckedChange={(v) => updateField({ show: v, redact: v ? cfg.redact : false })}
                            className="scale-75"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Switch
                            checked={cfg.redact}
                            disabled={!cfg.show}
                            onCheckedChange={(v) => updateField({ redact: v })}
                            className={`scale-75 ${!cfg.show ? 'opacity-30' : ''}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {/* Message Template */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Message Template</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Customise the exact text sent to your channels. Leave blank to use the built-in format.
                Use <code className="bg-muted px-1 rounded text-xs">{'{{VARIABLE}}'}</code> placeholders from the reference below.
              </p>
            </div>

            {/* Tab selector */}
            <div className="flex gap-1 border rounded-md p-1 w-fit bg-muted/30">
              {(['http', 'dns', 'grab', 'ez'] as const).map((t) => {
                const templateMap: Record<string, string> = (() => {
                  try { return notifForm.notifyTemplate ? JSON.parse(notifForm.notifyTemplate) : {}; }
                  catch { return {}; }
                })();
                const hasCustom = !!templateMap[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTemplateTab(t)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors relative ${
                      templateTab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t.toUpperCase()}
                    {hasCustom && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Textarea + variables panel */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3">
              {/* Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{templateTab.toUpperCase()} template</Label>
                  {(() => {
                    const templateMap: Record<string, string> = (() => {
                      try { return notifForm.notifyTemplate ? JSON.parse(notifForm.notifyTemplate) : {}; }
                      catch { return {}; }
                    })();
                    return templateMap[templateTab] ? (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => {
                          const current: Record<string, string> = (() => {
                            try { return notifForm.notifyTemplate ? JSON.parse(notifForm.notifyTemplate) : {}; }
                            catch { return {}; }
                          })();
                          const next = { ...current };
                          delete next[templateTab];
                          updateNotifField('notifyTemplate', Object.keys(next).length ? JSON.stringify(next) : null);
                        }}
                      >
                        Reset to default
                      </button>
                    ) : null;
                  })()}
                </div>
                <Textarea
                  rows={8}
                  className="font-mono text-xs resize-y"
                  placeholder={`Enter custom ${templateTab.toUpperCase()} template using {{VARIABLE}} placeholders…`}
                  value={(() => {
                    try {
                      const m = notifForm.notifyTemplate ? JSON.parse(notifForm.notifyTemplate) : {};
                      return m[templateTab] ?? DEFAULT_TEMPLATES[templateTab];
                    } catch { return DEFAULT_TEMPLATES[templateTab]; }
                  })()}
                  onChange={(e) => {
                    const val = e.target.value;
                    const current: Record<string, string> = (() => {
                      try { return notifForm.notifyTemplate ? JSON.parse(notifForm.notifyTemplate) : {}; }
                      catch { return {}; }
                    })();
                    const next = { ...current };
                    if (val.trim()) next[templateTab] = val;
                    else delete next[templateTab];
                    updateNotifField('notifyTemplate', Object.keys(next).length ? JSON.stringify(next) : null);
                  }}
                />
              </div>

              {/* Variable reference panel */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Available variables</Label>
                <div className="rounded-md border bg-muted/20 p-2 space-y-1 max-h-52 overflow-y-auto">
                  {TEMPLATE_VARS[templateTab].map(({ var: v, desc }) => (
                    <div key={v} className="flex items-start gap-2">
                      <code
                        className="text-[10px] font-mono bg-muted px-1 rounded cursor-pointer hover:bg-primary/20 transition-colors shrink-0"
                        title="Click to copy"
                        onClick={() => navigator.clipboard.writeText(v)}
                      >
                        {v}
                      </code>
                      <span className="text-[10px] text-muted-foreground leading-tight">{desc}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Click a variable to copy it.</p>
              </div>
            </div>
          </div>

          {/* Save (Message section) */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => updateNotifications.mutate(notifForm)}
              disabled={updateNotifications.isPending || !notifHasChanges}
              className="min-w-[120px]"
            >
              {updateNotifications.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {notifHasChanges ? 'Save' : 'Saved'}
            </Button>
          </div>
        </CardContent>
      </Card>}

      {/* ── EZ Capture Card ──────────────────────────────────────────────────── */}
      {activeSection === 'ez' && <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Code2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>EZ Capture</CardTitle>
              <CardDescription>Choose what data the EZ blind XSS payload collects when it fires</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              { field: 'ezCollectDom'            as const, label: 'DOM (full page HTML)',  desc: 'Captures the complete outerHTML of the page at time of trigger' },
              { field: 'ezCollectCookies'        as const, label: 'Cookies',              desc: 'Captures document.cookie' },
              { field: 'ezCollectLocalStorage'   as const, label: 'localStorage',         desc: 'All key/value pairs in localStorage' },
              { field: 'ezCollectSessionStorage' as const, label: 'sessionStorage',       desc: 'All key/value pairs in sessionStorage' },
              { field: 'ezCollectScreenshot'     as const, label: 'Screenshot',           desc: 'html2canvas screenshot — adds ~113 KB to the payload' },
            ] as { field: keyof EzSettings; label: string; desc: string }[]
          ).map(({ field, label, desc }) => (
            <div key={field} className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <Switch
                checked={ezForm[field]}
                onCheckedChange={(v) => updateEzField(field, v)}
              />
            </div>
          ))}

          <div className="pt-2">
            <Button
              onClick={() => updateEz.mutate(ezForm)}
              disabled={updateEz.isPending || !ezHasChanges}
              className="min-w-[120px]"
            >
              {updateEz.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {ezHasChanges ? 'Save' : 'Saved'}
            </Button>
          </div>
        </CardContent>
      </Card>}

        </div>{/* end right content */}
      </div>{/* end flex */}
    </div>
  );
}
