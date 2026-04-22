export interface Template {
  id: string;
  name: string;
  filename: string;
  description: string;
  category: string;
  filePath: string;
}

export interface TemplateCategory {
  name: string;
  description: string;
  templates: Template[];
}

export const TEMPLATE_METADATA: TemplateCategory[] = [
  {
    name: "XSS",
    description: "Cross-Site Scripting test payloads",
    templates: [
      {
        id: "xss-alert",
        name: "XSS Test - Alert",
        filename: "xss-test.html",
        description: "Basic XSS test with alert popup",
        category: "XSS",
        filePath: "xss/alert.html",
      },
      {
        id: "xss-cookie-stealer",
        name: "XSS - Cookie Stealer",
        filename: "cookie-stealer.html",
        description: "XSS payload that exfiltrates cookies to webhook",
        category: "XSS",
        filePath: "xss/cookie-stealer.html",
      },
      {
        id: "xss-dom-based",
        name: "XSS - DOM Based",
        filename: "dom-xss-test.html",
        description: "DOM-based XSS test page with URL parameter injection",
        category: "XSS",
        filePath: "xss/dom-based.html",
      },
    ],
  },
  {
    name: "SSRF",
    description: "Server-Side Request Forgery test payloads",
    templates: [
      {
        id: "ssrf-callback",
        name: "SSRF - Callback Test",
        filename: "ssrf-callback.html",
        description: "SSRF test that sends callback to webhook",
        category: "SSRF",
        filePath: "ssrf/callback.html",
      },
      {
        id: "ssrf-internal-scan",
        name: "SSRF - Internal Scanner",
        filename: "ssrf-scanner.html",
        description: "SSRF payload that scans internal network and cloud metadata endpoints",
        category: "SSRF",
        filePath: "ssrf/internal-scan.html",
      },
    ],
  },
  {
    name: "File Upload",
    description: "File upload testing payloads",
    templates: [
      {
        id: "upload-test",
        name: "File Upload - Test Page",
        filename: "file-upload-test.html",
        description: "Interactive file upload test page with drag & drop",
        category: "File Upload",
        filePath: "upload/file-upload-test.html",
      },
    ],
  },
  {
    name: "JavaScript",
    description: "JavaScript payload scripts",
    templates: [
      {
        id: "js-payload",
        name: "JavaScript - Basic Payload",
        filename: "payload.js",
        description: "Basic JavaScript payload for data exfiltration",
        category: "JavaScript",
        filePath: "javascript/payload.js",
      },
      {
        id: "js-exfil",
        name: "JavaScript - Advanced Exfiltration",
        filename: "exfiltration.js",
        description: "Advanced data exfiltration with chunking support",
        category: "JavaScript",
        filePath: "javascript/exfiltration.js",
      },
    ],
  },
  {
    name: "SVG",
    description: "SVG-based attack vectors",
    templates: [
      {
        id: "svg-xss",
        name: "SVG - XSS Vector",
        filename: "xss.svg",
        description: "XSS payload embedded in SVG file",
        category: "SVG",
        filePath: "svg/xss.svg",
      },
    ],
  },
  {
    name: "Exploit Patterns",
    description: "Multi-step exploit orchestration using the Grab endpoint",
    templates: [
      {
        id: "exploit-csrf-grab",
        name: "CSRF Token Theft via Grab",
        filename: "exploit-csrf-grab.html",
        description: "Opens target page, leaks CSRF token cross-origin via CSPT+redirect, polls /grab, then submits a CSRF form with the stolen token",
        category: "Exploit Patterns",
        filePath: "exploit/csrf-grab.html",
      },
      {
        id: "exploit-cookie-exfil",
        name: "Cookie Exfiltration via Grab",
        filename: "exploit-cookie-exfil.html",
        description: "Redirects to /grab/<key>?c=<cookies> to exfiltrate document.cookie — drop this as an XSS payload or onerror handler",
        category: "Exploit Patterns",
        filePath: "exploit/cookie-exfil.html",
      },
      {
        id: "exploit-oob-ping",
        name: "OOB Callback Ping",
        filename: "exploit-oob-ping.html",
        description: "Fires a POST to /grab/<key> with URL, cookies, UA, and referrer — confirms JS execution and collects context",
        category: "Exploit Patterns",
        filePath: "exploit/oob-ping.html",
      },
    ],
  },
];
