#!/usr/bin/env bash
# Turns a new Ubuntu 24.04 server into a running Fotobogen with HTTPS, with no
# one at the keyboard. Made for the "User data" box shown when creating a
# DigitalOcean droplet (or any provider's equivalent, "cloud-init"), where it
# runs once, as root, at first boot. Paste this into that box, with your
# domain on the second line, or leave the domain empty to get a working
# address without one:
#
#   #!/bin/bash
#   export FOTOBOGEN_DOMAIN=photos.example.com
#   curl -fsSL https://raw.githubusercontent.com/cschweda/fotobogen/main/deploy/droplet-setup.sh | bash
#
# What it does, in order (about ten minutes on the smallest servers):
#   - shows a "being installed" page on the address straight away;
#   - opens only SSH and the web in the firewall, and adds swap on a small server;
#   - makes a user, "fotobogen", with no password and no sudo, to run the site;
#   - installs Node.js 24, pnpm and pm2 for that user, and Fotobogen's newest
#     release with the one-line installer;
#   - starts it under pm2, which brings it back after a reboot;
#   - puts Caddy in front of it, which gets the HTTPS certificate by itself and
#     keeps trying until the domain points here.
#
# The setup token, which the site asks for on the first visit, is shown when
# you log in to the server: in DigitalOcean, the droplet's "Console" button
# does that in the browser.
#
# Without a domain, the address is the server's own IP as a name at sslip.io
# (203-0-113-10.sslip.io), which has HTTPS too. To move to a domain of your
# own later, point it at the server and run this again with the domain:
#
#   curl -fsSL https://raw.githubusercontent.com/cschweda/fotobogen/main/deploy/droplet-setup.sh | sudo bash -s photos.example.com
#
# Running it again changes only the address. What is already installed stays.
#
# Run as root, it never runs or writes anything the site's own user can change:
# not the copy of this script in that user's folder, not the pm2 and Node.js
# installed there, and not .env, which it edits as that user. So a site that
# was somehow taken over cannot use this script to take over the server.
# Everything it does is written to /var/log/fotobogen-setup.log.
set -Eeuo pipefail

APP_USER=fotobogen
APP_HOME=/home/$APP_USER
APP_DIR=$APP_HOME/fotobogen
PORT=5150
NVM_VERSION=v0.40.3
LOG=/var/log/fotobogen-setup.log
STATUS=/etc/fotobogen-setup-status
TOKEN_COPY=/etc/fotobogen-setup-token

[[ $EUID -eq 0 ]] || { echo "Run this as root (sudo bash $0)." >&2; exit 1; }

exec > >(tee -a "$LOG") 2>&1
say() { echo "[fotobogen $(date -u +%H:%M:%S)] $*"; }
status() { echo "$1" > "$STATUS"; }

# ─── The address ────────────────────────────────────────────────────

DOMAIN=${1:-${FOTOBOGEN_DOMAIN:-}}
DOMAIN=$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -e 's#^https\?://##' -e 's#/.*$##')

public_ip() {
  # DigitalOcean says it directly; elsewhere, the address this server sends from.
  curl -fsS --max-time 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null ||
    ip -4 route get 1.1.1.1 | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }'
}

GIVEN=""
if [[ -z "$DOMAIN" ]]; then
  IP=$(public_ip)
  [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { say "The server's address could not be found. Run this again with a domain."; exit 1; }
  DOMAIN="${IP//./-}.sslip.io"
  say "No domain given: using $DOMAIN, which always points at this server."
fi
# Only the letters a domain may hold, so nothing else reaches Caddy's file or .env.
if ! [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$ ]] || (( ${#DOMAIN} > 253 )); then
  say "'$DOMAIN' is not a domain name. Use only the name, such as photos.example.com."
  exit 1
fi
[[ "$DOMAIN" == *.sslip.io ]] || GIVEN=" $DOMAIN"
ADDRESS="https://$DOMAIN"

FAILED_AT=""
on_error() {
  status "failed"
  say "Stopped: $FAILED_AT did not finish. What went wrong is above, in $LOG."
  say "When it is put right, run this again: curl -fsSL https://raw.githubusercontent.com/cschweda/fotobogen/main/deploy/droplet-setup.sh | sudo bash -s$GIVEN"
}
trap on_error ERR
step() { FAILED_AT="$1"; say "$1"; }

# Waits for apt while the system's own first-boot updates hold it.
apt_get() { DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=900 -y -q "$@"; }

as_app() { sudo -u "$APP_USER" -H bash -c "export NVM_DIR=$APP_HOME/.nvm; [[ -s \$NVM_DIR/nvm.sh ]] && source \$NVM_DIR/nvm.sh; cd $APP_HOME; $1"; }

# ─── 1. A page straight away ────────────────────────────────────────

step "Installing Caddy"
# Whether the site has ever been open to visitors. Until the end of the first
# full run, Caddy shows only the "being installed" page.
OPENED=false
[[ "$(cat "$STATUS" 2>/dev/null)" == "done" ]] && OPENED=true
status "installing"
apt_get update
apt_get install caddy curl git ufw

write_caddy() {
  # $1 is what the site answers with: the app, or a note while it is installed.
  cat > /etc/caddy/Caddyfile <<EOF
# Written by Fotobogen's droplet-setup.sh. Caddy gets and renews the
# certificate for this name by itself.
$DOMAIN {
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000"
	header X-Content-Type-Options nosniff
	header -Server
$1
}
EOF
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
}

if ! as_app 'pm2 pid fotobogen' 2>/dev/null | grep -q '^[1-9]'; then
  write_caddy '	respond "Fotobogen is being installed on this server. It takes about ten minutes: reload this page then." 503'
fi

# ─── 2. The firewall, and swap ──────────────────────────────────────

step "Opening only SSH and the web"
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null
ufw --force enable >/dev/null

# Building needs about 2 GB; a 1 GB server gets 2 GB of swap.
MEMORY_MB=$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)
if (( MEMORY_MB < 1900 )) && ! swapon --show | grep -q .; then
  step "Adding 2 GB of swap (this server has ${MEMORY_MB} MB of memory)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ─── 3. A user to run it ────────────────────────────────────────────

if ! id "$APP_USER" >/dev/null 2>&1; then
  step "Making the user $APP_USER"
  # No password and no sudo: it can run the site, and nothing else.
  adduser --disabled-password --gecos "Fotobogen" "$APP_USER" >/dev/null
fi

# ─── 4. Node.js, pnpm, pm2 ──────────────────────────────────────────

if ! as_app 'node --version' 2>/dev/null | grep -q '^v24\.'; then
  step "Installing Node.js 24, pnpm and pm2"
  as_app "curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh | PROFILE=$APP_HOME/.bashrc bash >/dev/null"
  as_app 'nvm install 24 >/dev/null && nvm alias default 24 >/dev/null && npm install -g --silent pnpm@10 pm2'
fi

# ─── 5. Fotobogen ───────────────────────────────────────────────────

if [[ ! -f "$APP_DIR/package.json" ]]; then
  step "Installing Fotobogen's newest release (the longest step: several minutes)"
  as_app 'npx --yes fotobogen@latest fotobogen --yes'
fi

step "Setting the site's address to $ADDRESS"
# As the site's user: root writing into that user's folder could be led by a
# link to write somewhere else. The values were checked above (a domain, a port).
set_env() {
  as_app "cd $APP_DIR && touch .env && chmod 600 .env && if grep -q '^$1=' .env; then sed -i 's#^$1=.*#$1=$2#' .env; else echo '$1=$2' >> .env; fi"
}
set_env PORT "$PORT"
set_env SITE_URL "$ADDRESS"

# ─── 6. Under pm2, started at boot ──────────────────────────────────

# Started at boot by systemd, as the site's user. This is the one step that runs
# a program from that user's folder as root, so it runs once, on the first
# install, before the site has ever answered a visitor.
if [[ ! -f /etc/systemd/system/pm2-$APP_USER.service ]]; then
  step "Making pm2 start it at boot"
  NODE_BIN=$(as_app 'dirname "$(command -v node)"')
  env PATH="$PATH:$NODE_BIN" "$NODE_BIN/pm2" startup systemd -u "$APP_USER" --hp "$APP_HOME" >/dev/null
fi

step "Starting it under pm2"
if as_app 'pm2 describe fotobogen' >/dev/null 2>&1; then
  as_app "cd $APP_DIR && pm2 reload ecosystem.config.cjs --update-env"
else
  as_app "cd $APP_DIR && pm2 start ecosystem.config.cjs"
fi
as_app 'pm2 save --force >/dev/null'

step "Waiting for it to answer"
for _ in $(seq 1 90); do
  curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" >/dev/null || { FAILED_AT="Starting Fotobogen"; false; }

# ─── 7. Caddy in front ──────────────────────────────────────────────

# The setup token, copied where only root can change it, for the message at
# login. Taken once, before the site has answered anyone: after that, the site's
# folder is not trusted, and the login message never reads from it.
if [[ $OPENED == false && ! -s $TOKEN_COPY ]]; then
  head -c 64 "$APP_DIR/data/setup-token" | tr -cd '0-9a-f' | cut -c1-32 > "$TOKEN_COPY.new"
  chmod 600 "$TOKEN_COPY.new"
  mv -f "$TOKEN_COPY.new" "$TOKEN_COPY"
fi

step "Pointing Caddy at it"
write_caddy "	request_body {
		max_size 50MB
	}
	reverse_proxy 127.0.0.1:$PORT"

# ─── 8. The token, at every login ───────────────────────────────────

cat > /etc/update-motd.d/99-fotobogen <<EOF
#!/bin/sh
# Written by Fotobogen's droplet-setup.sh.
state=\$(cat $STATUS 2>/dev/null)
echo
if [ "\$state" = "failed" ]; then
  echo "  Fotobogen: the setup stopped. What went wrong is in $LOG"
elif [ "\$state" != "done" ]; then
  echo "  Fotobogen is still being installed. Progress: tail -f $LOG"
elif [ -e $APP_DIR/data/setup-token ] || [ -L $APP_DIR/data/setup-token ]; then
  # Setup is not finished while the site keeps its token. Only whether the file
  # is there is asked, never what it holds: the token shown is root's own copy.
  echo "  Fotobogen is running at $ADDRESS"
  echo "  Open it, and enter this setup token: \$(tr -cd '0-9a-f' < $TOKEN_COPY 2>/dev/null)"
  echo "  (If the site says it is wrong, the token was made again since: sudo cat $APP_DIR/data/setup-token)"
else
  echo "  Fotobogen is running at $ADDRESS"
fi
echo
EOF
chmod 755 /etc/update-motd.d/99-fotobogen

status "done"
trap - ERR
say "Done. Fotobogen is at $ADDRESS"
say "The setup token is shown when you log in to this server, and is in $APP_DIR/data/setup-token"
say "If the address does not open yet, the domain may not point here yet: Caddy keeps trying, and HTTPS starts by itself once it does."
