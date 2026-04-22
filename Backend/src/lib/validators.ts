import validator from 'validator';

/**
 * Validation error response type
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * DNS Settings validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * DNS Settings input interface
 */
export interface DnsSettingsInput {
  dnsMode: 'local' | 'remote';
  dnsBaseDomain?: string;
  dnsResponseIp?: string;
  dnsTtl?: number;
  dnsVpsUrl?: string;
  dnsWebhookUrl?: string;
  dnsAuthToken?: string;
}

/**
 * Sanitize string input to prevent injection attacks
 * Removes dangerous characters and trims whitespace
 * Based on OWASP recommendations
 */
export function sanitizeString(input: string | undefined | null): string {
  if (!input) return '';

  // Trim whitespace
  let sanitized = input.trim();

  // Remove null bytes (can cause issues in C-based systems)
  sanitized = sanitized.replace(/\0/g, '');

  // Remove control characters (except newlines/tabs for certain fields)
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Remove HTML tags (basic XSS prevention)
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Limit length to prevent DoS
  if (sanitized.length > 1000) {
    sanitized = sanitized.substring(0, 1000);
  }

  return sanitized;
}

/**
 * Validate domain name according to RFC 1034/1123
 * Supports internationalized domains (IDN)
 */
export function validateDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') return false;

  const sanitized = sanitizeString(domain);

  // Basic length check (RFC 1035: 255 characters max for full domain)
  if (sanitized.length < 1 || sanitized.length > 253) return false;

  // Allow localhost for testing
  if (sanitized === 'localhost') return true;

  // Use validator.js FQDN validation (RFC 1123 compliant)
  return validator.isFQDN(sanitized, {
    require_tld: false, // Allow domains without TLD for internal use
    allow_underscores: false,
    allow_trailing_dot: false,
  });
}

/**
 * Validate IPv4 or IPv6 address
 */
export function validateIpAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;

  const sanitized = sanitizeString(ip);

  // Validate IPv4 or IPv6
  return validator.isIP(sanitized, 4) || validator.isIP(sanitized, 6);
}

/**
 * Validate URL with specific requirements
 * In development mode (NODE_ENV !== 'production'), allows localhost for testing
 */
export function validateUrl(url: string, requireHttps: boolean = false): boolean {
  if (!url || typeof url !== 'string') return false;

  const sanitized = sanitizeString(url);
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Basic URL validation
  if (!validator.isURL(sanitized, {
    protocols: requireHttps && !isDevelopment ? ['https'] : ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    allow_query_components: true,
    allow_fragments: false,
  })) {
    return false;
  }

  // Additional security: Prevent SSRF by blocking private IPs in URLs
  // Skip this check in development mode to allow localhost testing
  if (!isDevelopment) {
    try {
      const urlObj = new URL(sanitized);
      const hostname = urlObj.hostname;

      // Block localhost and private IP ranges (SSRF prevention - production only)
      if (hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '::1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Validate TTL (Time To Live) value
 */
export function validateTtl(ttl: number | undefined): boolean {
  if (ttl === undefined || ttl === null) return true; // Optional field

  // Must be a non-negative integer
  if (!Number.isInteger(ttl) || ttl < 0) return false;

  // Reasonable upper limit (24 hours = 86400 seconds)
  if (ttl > 86400) return false;

  return true;
}

/**
 * Validate authentication token strength
 * Minimum 32 characters with good entropy
 */
export function validateAuthToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;

  const sanitized = sanitizeString(token);

  // Minimum length requirement (OWASP recommendation: 32+ characters for tokens)
  if (sanitized.length < 32) return false;

  // Maximum length (prevent DoS)
  if (sanitized.length > 256) return false;

  // Check for sufficient character variety (basic entropy check)
  const hasLower = /[a-z]/.test(sanitized);
  const hasUpper = /[A-Z]/.test(sanitized);
  const hasNumber = /[0-9]/.test(sanitized);
  const hasSpecial = /[^a-zA-Z0-9]/.test(sanitized);

  // Require at least 2 of: lowercase, uppercase, numbers, special chars
  const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  if (varietyCount < 2) return false;

  return true;
}

/**
 * Comprehensive validation for DNS settings
 * Returns detailed error messages for each validation failure
 */
export function validateDnsSettings(input: DnsSettingsInput): ValidationResult {
  const errors: ValidationError[] = [];

  // Sanitize all string inputs first
  const sanitized: DnsSettingsInput = {
    dnsMode: input.dnsMode,
    dnsBaseDomain: sanitizeString(input.dnsBaseDomain),
    dnsResponseIp: sanitizeString(input.dnsResponseIp),
    dnsTtl: input.dnsTtl,
    dnsVpsUrl: sanitizeString(input.dnsVpsUrl),
    dnsWebhookUrl: sanitizeString(input.dnsWebhookUrl),
    dnsAuthToken: sanitizeString(input.dnsAuthToken),
  };

  // Validate DNS mode
  if (!sanitized.dnsMode || !['local', 'remote'].includes(sanitized.dnsMode)) {
    errors.push({
      field: 'dnsMode',
      message: 'DNS mode must be either "local" or "remote"',
    });
    // Early return if mode is invalid (affects other validations)
    return { isValid: false, errors };
  }

  // Common validations (required for both modes)

  // Base domain (required)
  if (!sanitized.dnsBaseDomain) {
    errors.push({
      field: 'dnsBaseDomain',
      message: 'Base domain is required',
    });
  } else if (!validateDomain(sanitized.dnsBaseDomain)) {
    errors.push({
      field: 'dnsBaseDomain',
      message: 'Invalid domain format. Must be a valid FQDN (e.g., collab.example.com)',
    });
  }

  // TTL (optional but must be valid if provided)
  if (!validateTtl(sanitized.dnsTtl)) {
    errors.push({
      field: 'dnsTtl',
      message: 'TTL must be a non-negative integer (max 86400 seconds / 24 hours)',
    });
  }

  // Mode-specific validations
  if (sanitized.dnsMode === 'local') {
    // Local mode requires response IP
    if (!sanitized.dnsResponseIp) {
      errors.push({
        field: 'dnsResponseIp',
        message: 'Response IP address is required for local mode',
      });
    } else if (!validateIpAddress(sanitized.dnsResponseIp)) {
      errors.push({
        field: 'dnsResponseIp',
        message: 'Invalid IP address format. Must be a valid IPv4 or IPv6 address',
      });
    }
  } else if (sanitized.dnsMode === 'remote') {
    // Remote mode requires VPS URL
    if (!sanitized.dnsVpsUrl) {
      errors.push({
        field: 'dnsVpsUrl',
        message: 'VPS URL/IP is required for remote mode',
      });
    } else if (!validateIpAddress(sanitized.dnsVpsUrl) && !validateUrl(sanitized.dnsVpsUrl, false)) {
      errors.push({
        field: 'dnsVpsUrl',
        message: 'Invalid VPS URL or IP address format',
      });
    }

    // Remote mode requires webhook URL (HTTPS only for security)
    if (!sanitized.dnsWebhookUrl) {
      errors.push({
        field: 'dnsWebhookUrl',
        message: 'Webhook callback URL is required for remote mode',
      });
    } else if (!validateUrl(sanitized.dnsWebhookUrl, true)) {
      errors.push({
        field: 'dnsWebhookUrl',
        message: 'Invalid webhook URL. Must be a valid HTTPS URL (not localhost or private IPs)',
      });
    }

    // Remote mode requires authentication token
    if (!sanitized.dnsAuthToken) {
      errors.push({
        field: 'dnsAuthToken',
        message: 'Authentication token is required for remote mode',
      });
    } else if (!validateAuthToken(sanitized.dnsAuthToken)) {
      errors.push({
        field: 'dnsAuthToken',
        message: 'Weak authentication token. Must be at least 32 characters with sufficient complexity (mix of letters, numbers, or special characters)',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
