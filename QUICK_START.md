# NextBit VPN - Quick Deployment Reference

## Files Provided

1. **Dockerfile** - Container image definition
2. **docker-compose.yml** - Multi-container orchestration 
3. **nginx.conf** - Reverse proxy & SSL termination
4. **DEPLOYMENT_GUIDE.md** - Full step-by-step guide
5. **.env.production** - Production environment variables

---

## Quick Start (5-10 minutes)

### On Your Local Machine:

```bash
# 1. Prepare your PEM key
chmod 600 your-key.pem

# 2. Copy all files to VPS
scp -i your-key.pem -r . root@18.141.191.162:/opt/nextbit-vpn

# 3. SSH into VPS
ssh -i your-key.pem root@18.141.191.162
```

### On Your VPS:

```bash
# 1. Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh

sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 2. Setup SSL (requires DNS already pointing to your VPS)
sudo apt-get install -y certbot
sudo certbot certonly --standalone \
  -d nextbit.online \
  -d www.nextbit.online \
  -d admin.nextbit.online \
  --email admin@nextbit.online \
  --agree-tos \
  --non-interactive

# 3. Copy certificates
mkdir -p /opt/nextbit-vpn/certs/nextbit.online
sudo cp /etc/letsencrypt/live/nextbit.online/fullchain.pem /opt/nextbit-vpn/certs/nextbit.online/
sudo cp /etc/letsencrypt/live/nextbit.online/privkey.pem /opt/nextbit-vpn/certs/nextbit.online/
sudo chown -R $USER:$USER /opt/nextbit-vpn/certs/

# 4. Start Docker containers
cd /opt/nextbit-vpn
docker-compose up -d

# 5. Verify
docker-compose ps
docker-compose logs -f
```

---

## DNS Setup

Make sure these DNS records point to your VPS IP (18.141.191.162):

```
A record:  nextbit.online        -> 18.141.191.162
A record:  www.nextbit.online    -> 18.141.191.162
A record:  admin.nextbit.online  -> 18.141.191.162
```

---

## Useful Docker Commands

```bash
# View running containers
docker ps

# View all containers
docker ps -a

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f app

# Stop all containers
docker-compose stop

# Start all containers
docker-compose start

# Restart all containers
docker-compose restart

# Rebuild image
docker-compose build --no-cache

# Full restart
docker-compose down
docker-compose up -d

# Shell access
docker-compose exec app sh

# Monitor resources
docker stats
```

---

## SSL Certificate Auto-Renewal

Add to crontab (`sudo crontab -e`):

```cron
0 3 * * * /usr/bin/certbot renew --quiet && \
  cp /etc/letsencrypt/live/nextbit.online/fullchain.pem /opt/nextbit-vpn/certs/nextbit.online/ && \
  cp /etc/letsencrypt/live/nextbit.online/privkey.pem /opt/nextbit-vpn/certs/nextbit.online/ && \
  docker-compose -f /opt/nextbit-vpn/docker-compose.yml restart nginx
```

---

## Access Your Application

- **Main Site**: https://nextbit.online
- **Admin Panel**: https://admin.nextbit.online
- **Dashboard**: https://nextbit.online/dashboard
- **API**: https://nextbit.online/api/notices/active

---

## Troubleshooting

### Check if ports are open:
```bash
sudo netstat -tulpn | grep LISTEN
```

### Test SSL certificate:
```bash
openssl s_client -connect nextbit.online:443
```

### View Nginx errors:
```bash
docker-compose logs nginx
```

### Restart specific service:
```bash
docker-compose restart app
docker-compose restart nginx
```

### Check database connection:
```bash
docker-compose exec app sh -c "echo $DATABASE_URL"
```

---

## Production Checklist

- ✅ DNS records configured
- ✅ SSL certificates obtained
- ✅ Docker & Docker Compose installed
- ✅ .env.production configured with correct values
- ✅ Firewall rules allowing ports 80, 443
- ✅ Database URL verified
- ✅ SMTP credentials tested
- ✅ XUI panel credentials verified
- ✅ Application tested in browser
- ✅ SSL certificate auto-renewal set up

---

## Need Help?

1. Check DEPLOYMENT_GUIDE.md for detailed steps
2. View logs: `docker-compose logs -f`
3. SSH into container: `docker-compose exec app sh`
4. Check Nginx config: `docker-compose exec nginx nginx -t`

---

**Deployment Status**: Ready for production! 🚀
