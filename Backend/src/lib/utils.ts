// Get MIME type from filename extension
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'htm': 'text/html',
    'js': 'application/javascript',
    'json': 'application/json',
    'css': 'text/css',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'xml': 'application/xml',
    'php': 'application/x-httpd-php',
    'py': 'text/x-python',
    'sh': 'application/x-sh',
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'pdf': 'application/pdf',
  }
  return mimeTypes[ext || ''] || 'application/octet-stream'
}
