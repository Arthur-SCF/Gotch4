# VPS DNS Server - Remote Mode

Standalone DNS server for bug bounty DNS capture when your main app is behind Cloudflare Tunnel (no public IP).

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   DNS Client    │ ─DNS──> │   VPS DNS        │ ─HTTPS─>│   Main App      │
│   (Target App)  │         │   Server         │         │   (Cloudflare   │
│                 │         │   Port 53        │         │    Tunnel)      │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                 Public IP                   No Public IP
                                 *.collab.example.com        tunnel.example.com
```

## Features

- ✅ Runs DNS server on port 53 (UDP + TCP)
- ✅ Captures all DNS queries for your domain
- ✅ Forwards queries to main app via HTTPS webhook
- ✅ Secure authentication with token
- ✅ Auto-responds to A, AAAA, TXT queries
- ✅ Logging and error handling
- ✅ Graceful shutdown

## Requirements

- **VPS with public IPv4 address**
- **Bun runtime** (or Node.js 18+)
- **Domain** you control (for NS records)
- **Main app** running with Cloudflare Tunnel

## Quick Start

### 1. Install Bun on VPS

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### 2. Copy Files to VPS

```bash
# On your local machine
cd VPS-DNS-Server
scp -r * user@your-vps-ip:~/vps-dns-server/

# Or clone from your repo
ssh user@your-vps-ip
git clone https://github.com/yourusername/your-repo.git
cd your-repo/VPS-DNS-Server
```

### 3. Install Dependencies

```bash
bun install
```

### 4. Configure Settings

```bash
cp .env.example .env
nano .env
```

Edit the `.env` file with your values:

```env
DNS_DOMAIN=collab.example.com
WEBHOOK_URL=https://your-tunnel.trycloudflare.com/api/dns/callback
AUTH_TOKEN=your-32-character-or-longer-secure-token
DNS_RESPONSE_IP=203.0.113.42  # Your VPS public IP
DNS_TTL=0
DNS_PORT=53
```

**Important:**
- `DNS_DOMAIN` - Must match your main app's "Base Domain" setting
- `WEBHOOK_URL` - Your main app's public URL + `/api/dns/callback`
- `AUTH_TOKEN` - Must match your main app's "Authentication Token" setting (32+ chars)
- `DNS_RESPONSE_IP` - Your VPS public IP address

### 5. Grant Port 53 Permissions

DNS requires binding to port 53 (privileged port):

```bash
sudo setcap 'cap_net_bind_service=+ep' $(which bun)
```

**Or** run with sudo (less secure):
```bash
sudo bun run server.js
```

### 6. Stop Conflicting DNS Services

If port 53 is in use:

```bash
# Check what's using port 53
sudo lsof -i :53

# Stop systemd-resolved (Ubuntu/Debian)
sudo systemctl stop systemd-resolved
sudo systemctl disable systemd-resolved

# Update DNS resolver
sudo rm /etc/resolv.conf
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
```

### 7. Configure Firewall

Open port 53 (UDP + TCP):

```bash
# UFW (Ubuntu)
sudo ufw allow 53/udp
sudo ufw allow 53/tcp

# iptables
sudo iptables -A INPUT -p udp --dport 53 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 53 -j ACCEPT
```

### 8. Start DNS Server

```bash
bun run server.js
```

You should see:

```
═══════════════════════════════════════════════════════
  🌐 VPS DNS Server - Remote Mode
═══════════════════════════════════════════════════════

  Domain:      *.collab.example.com
  Response IP: 203.0.113.42
  TTL:         0 seconds
  Port:        53
  Webhook:     https://tunnel.example.com/api/dns/callback

═══════════════════════════════════════════════════════

✅ DNS server started on port 53
   Listening for queries...
```

## Domain Configuration

### Configure NS Records

At your domain registrar (e.g., Cloudflare, Namecheap), add NS records:

```
Type    Name                     Value
NS      collab.example.com       ns1.example.com
A       ns1.example.com          203.0.113.42  (your VPS IP)
```

**Wait 5-30 minutes** for DNS propagation.

### Test DNS Configuration

```bash
# From any machine
nslookup test.collab.example.com

# Expected output:
# Server:    8.8.8.8
# Address:   8.8.8.8#53
#
# Name:      test.collab.example.com
# Address:   203.0.113.42  (your VPS IP)
```

## Testing

### 1. Test DNS Server Locally

```bash
nslookup test.collab.example.com 203.0.113.42
```

Should return your VPS IP and log the query on the server.

### 2. Test Webhook Connection

```bash
curl https://your-tunnel.example.com/api/dns/callback/health
```

Should return:
```json
{
  "status": "ok",
  "configured": true,
  "mode": "remote"
}
```

### 3. Test End-to-End

```bash
nslookup random123.collab.example.com
```

- Check VPS logs for query
- Check main app Events page - DNS query should appear!

## Running in Production

### Using systemd (Recommended)

Create `/etc/systemd/system/vps-dns.service`:

```ini
[Unit]
Description=VPS DNS Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/vps-dns-server
ExecStart=/home/youruser/.bun/bin/bun run server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vps-dns
sudo systemctl start vps-dns
sudo systemctl status vps-dns
```

View logs:

```bash
sudo journalctl -u vps-dns -f
```

### Using PM2

```bash
# Install PM2
bun add -g pm2

# Start server
pm2 start server.js --name vps-dns

# Save configuration
pm2 save

# Auto-start on boot
pm2 startup
```

## Monitoring

### Check Server Status

```bash
# systemd
sudo systemctl status vps-dns

# PM2
pm2 status
pm2 logs vps-dns

# Manual
ps aux | grep server.js
```

### View Logs

```bash
# systemd
sudo journalctl -u vps-dns -f --lines=100

# PM2
pm2 logs vps-dns --lines 100

# Manual
tail -f /path/to/your/log/file
```

## Troubleshooting

### Port 53 Permission Denied

```bash
# Grant capability
sudo setcap 'cap_net_bind_service=+ep' $(which bun)

# Verify
getcap $(which bun)
# Should show: cap_net_bind_service=ep
```

### Port 53 Already in Use

```bash
# Find what's using it
sudo lsof -i :53

# Stop systemd-resolved
sudo systemctl stop systemd-resolved
```

### Webhook Failures

Check logs for errors like:
- `401 Unauthorized` - Auth token mismatch
- `403 Forbidden` - Invalid token
- `400 Bad Request` - Invalid payload
- `500 Internal Server Error` - Main app error

Verify:
1. `AUTH_TOKEN` matches main app settings exactly
2. `WEBHOOK_URL` is correct and accessible
3. Main app is running and reachable
4. Cloudflare Tunnel is active

### DNS Queries Not Appearing

1. **Check VPS logs** - Are queries being received?
2. **Check webhook logs** - Is webhook being called?
3. **Check main app logs** - Is webhook endpoint working?
4. **Verify NS records** - Use `dig NS collab.example.com`
5. **Test directly** - `nslookup test.collab.example.com YOUR_VPS_IP`

### Firewall Blocking

```bash
# Check firewall status
sudo ufw status

# Allow port 53
sudo ufw allow 53/udp
sudo ufw allow 53/tcp
```

## Security Considerations

✅ **Always use HTTPS** for webhook URL (never HTTP)
✅ **Use strong tokens** (32+ characters, random)
✅ **Keep tokens secret** (don't commit .env to git)
✅ **Monitor logs** for suspicious activity
✅ **Update regularly** (keep Bun and dependencies up to date)
✅ **Rate limiting** (consider adding if under attack)

## Performance

- **Handles 1000+ queries/second** on modest VPS
- **Low latency** (<50ms DNS response)
- **Async webhooks** (doesn't block DNS responses)
- **Memory efficient** (< 50MB RAM)

## Uninstall

```bash
# Stop service
sudo systemctl stop vps-dns
sudo systemctl disable vps-dns
sudo rm /etc/systemd/system/vps-dns.service

# Or PM2
pm2 delete vps-dns

# Remove files
rm -rf ~/vps-dns-server

# Remove NS records from domain registrar
```

## Support

For issues or questions, check:
- Main app logs
- VPS server logs
- Network connectivity
- Domain DNS propagation

## License

MIT
