# NextBit VPN - Docker Deployment Guide

## Overview
This guide will help you deploy NextBit VPN to your VPS (IP: 18.141.191.162) using Docker with:
- **Main domain**: nextbit.online
- **Admin subdomain**: admin.nextbit.online
- **SSL/TLS**: Auto-configured with Certbot
- **Reverse Proxy**: Nginx

---

## Prerequisites
- VPS with Ubuntu 20.04+ or Debian 11+
- Root/sudo access
- Domains pointing to your VPS IP (18.141.191.162)
- PEM key for SSH access

---

## Step 1: Connect to Your VPS

```bash
ssh -i your-key.pem root@18.141.191.162
```

---

## Step 2: Clone the Project

```bash
cd /opt
git clone https://github.com/yourusername/nextbit-vpn.git nextbit-vpn
cd nextbit-vpn
```

Or copy via SCP:
```bash
scp -i your-key.pem -r . root@18.141.191.162:/opt/nextbit-vpn
```

---

## Step 3: Install Docker

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh

# Add user to docker group (optional)
sudo usermod -aG docker $USER
newgrp docker
```

---

## Step 4: Install Docker Compose

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose

sudo chmod +x /usr/local/bin/docker-compose

docker-compose --version
```

---

## Step 5: Setup SSL Certificates

### Install Certbot
```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### Create Certificate Directory
```bash
mkdir -p certs/nextbit.online
```

### Get SSL Certificate
```bash
sudo certbot certonly --standalone \
  -d nextbit.online \
  -d www.nextbit.online \
  -d admin.nextbit.online \
  --email admin@nextbit.online \
  --agree-tos \
  --non-interactive
```

### Copy Certificates to Docker Volume
```bash
sudo cp /etc/letsencrypt/live/nextbit.online/fullchain.pem certs/nextbit.online/
sudo cp /etc/letsencrypt/live/nextbit.online/privkey.pem certs/nextbit.online/

sudo chown -R $(whoami):$(whoami) certs/
chmod -R 755 certs/
```

---

## Step 6: Create Production Environment File

```bash
cat > .env.production << 'EOF'
NODE_ENV=production
DATABASE_URL="postgresql://neondb_owner:npg_TF8Mo4ByHuXm@ep-sweet-tree-a1xja9lz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
JWT_SECRET="DUvW2gsRgRNRq2R44ch1GZrGIr7cWTA7xOH874kPpoE="
JWT_EXPIRES_IN="7d"
XUI_PANEL_URL="https://senan.cyberghostvpn.shop:5050/vuoTEBeNThNZ9KjY1w"
XUI_USERNAME="senan"
XUI_PASSWORD="senan"
APP_URL="https://nextbit.online"
SMTP_HOST="mail.privateemail.com"
SMTP_PORT=465
SMTP_USER="senan@nextbit.online"
SMTP_PASS="Bardog@5000"
EOF
```

---

## Step 7: Create docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: nextbit-vpn-app
    ports:
      - "3000:3000"
    env_file: .env.production
    restart: unless-stopped
    networks:
      - nextbit-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    container_name: nextbit-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - nextbit-network

networks:
  nextbit-network:
    driver: bridge
```

---

## Step 8: Update Hosts (Optional - for testing)

Add to `/etc/hosts` if needed for local testing:
```
18.141.191.162 nextbit.online www.nextbit.online admin.nextbit.online
```

---

## Step 9: Build and Start Containers

```bash
# Build the Docker image
docker-compose build

# Start the containers in background
docker-compose up -d

# Wait for services to start
sleep 10

# Check status
docker-compose ps
```

---

## Step 10: Verify Everything Works

```bash
# Check logs
docker-compose logs -f app

# Test the API
curl -i https://nextbit.online

# Check Nginx
docker-compose logs nginx
```

---

## Management Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f nginx
```

### Stop Services
```bash
docker-compose stop
```

### Restart Services
```bash
docker-compose restart
```

### Rebuild After Code Changes
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Remove Everything (Clean)
```bash
docker-compose down -v
```

### Shell Access to Container
```bash
docker-compose exec app sh
```

---

## Auto-Renew SSL Certificates

Create a cron job to auto-renew certificates:

```bash
sudo crontab -e
```

Add this line (renews daily, but only runs if needed):
```
0 3 * * * /usr/bin/certbot renew --quiet && sudo cp /etc/letsencrypt/live/nextbit.online/fullchain.pem /opt/nextbit-vpn/certs/nextbit.online/ && sudo cp /etc/letsencrypt/live/nextbit.online/privkey.pem /opt/nextbit-vpn/certs/nextbit.online/ && docker-compose -f /opt/nextbit-vpn/docker-compose.yml restart nginx
```

---

## Firewall Configuration

```bash
# Open ports
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Accessing Your Application

- **Main Dashboard**: https://nextbit.online/dashboard
- **Login**: https://nextbit.online/login
- **Signup**: https://nextbit.online/signup
- **Admin Panel**: https://admin.nextbit.online

---

## Troubleshooting

### Containers won't start
```bash
docker-compose logs -f
# Check for database connection issues
```

### SSL certificate errors
```bash
# Verify certificate
sudo certbot certificates

# Renew manually
sudo certbot renew --dry-run
```

### Nginx not proxying correctly
```bash
# Check nginx config
docker-compose exec nginx nginx -t

# Restart nginx
docker-compose restart nginx
```

### Database connection issues
Check DATABASE_URL in `.env.production`

---

## Backup & Recovery

### Backup Database
```bash
# Using Prisma
docker-compose exec app npx prisma db seed

# Manual DB backup (if applicable)
```

### Backup Application Data
```bash
tar -czf nextbit-vpn-backup.tar.gz /opt/nextbit-vpn/
```

---

## Support & Monitoring

Monitor container resource usage:
```bash
docker stats
```

---

**Deployment Complete!** 🎉

Your NextBit VPN is now running on:
- https://nextbit.online
- https://admin.nextbit.online
