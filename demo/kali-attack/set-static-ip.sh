#!/bin/bash
# =====================================================================
# AI-SOC DEMO — Kali static-IP rotation script
# Configures the Kali interface with one of 192.168.168.20–50 and
# routes through the lab gateway 192.168.168.254.
#
# Usage: sudo ./set-static-ip.sh <last-octet>   # e.g. 23
# =====================================================================
set -e
[ -z "$1" ] && { echo "Usage: $0 <last-octet 20-50>"; exit 1; }
LAST="$1"
IFACE="${IFACE:-eth0}"
IP="192.168.168.${LAST}/24"
GW="192.168.168.254"
DNS="192.168.168.10"

ip addr flush dev "$IFACE"
ip addr add "$IP" dev "$IFACE"
ip link set "$IFACE" up
ip route add default via "$GW" || true
echo "nameserver $DNS" > /etc/resolv.conf

echo "[OK] $IFACE is now $IP via $GW"
ip addr show "$IFACE" | grep inet
