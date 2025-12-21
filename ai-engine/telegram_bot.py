"""
Telegram Bot for SOC Dashboard
Handles alerts and provides system monitoring via Telegram
"""
import os
import asyncio
import logging
import psutil
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

import httpx

logger = logging.getLogger("TELEGRAM_BOT")

# Configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
CONFIDENCE_THRESHOLD = int(os.getenv("TELEGRAM_CONFIDENCE_THRESHOLD", "80"))

# Store for recent events (in-memory, for demo - use Redis/DB in production)
recent_events: List[Dict[str, Any]] = []
action_logs: List[Dict[str, Any]] = []
MAX_EVENTS = 1000


class TelegramBot:
    """Telegram Bot handler for SOC alerts and monitoring"""
    
    def __init__(self, token: str = "", chat_id: str = ""):
        self.token = token or TELEGRAM_BOT_TOKEN
        self.chat_id = chat_id or TELEGRAM_CHAT_ID
        self.base_url = f"https://api.telegram.org/bot{self.token}"
        self.confidence_threshold = CONFIDENCE_THRESHOLD
        self.enabled = bool(self.token and self.chat_id)
        
    async def send_message(self, text: str, parse_mode: str = "Markdown", chat_id: str = None) -> bool:
        """Send a message via Telegram"""
        if not self.enabled:
            logger.warning("Telegram not configured, skipping message")
            return False
            
        target_chat = chat_id or self.chat_id
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/sendMessage",
                    json={
                        "chat_id": target_chat,
                        "text": text,
                        "parse_mode": parse_mode,
                    },
                    timeout=10.0,
                )
                if response.status_code == 200:
                    logger.info(f"Telegram message sent to {target_chat}")
                    return True
                else:
                    logger.error(f"Telegram API error: {response.text}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {e}")
            return False

    async def send_alert(
        self,
        event: Dict[str, Any],
        verdict: str,
        confidence: float,
        alert_types: List[str] = None,
    ) -> bool:
        """
        Send an alert for a security event
        Only sends if confidence >= threshold and verdict matches alert_types
        """
        if not self.enabled:
            return False
            
        # Check confidence threshold
        if confidence < self.confidence_threshold:
            logger.debug(f"Skipping alert - confidence {confidence}% < threshold {self.confidence_threshold}%")
            return False
            
        # Check alert type filter
        allowed_types = alert_types or ["ALERT", "SUSPICIOUS"]
        if verdict not in allowed_types:
            logger.debug(f"Skipping alert - verdict {verdict} not in {allowed_types}")
            return False

        # Build alert message
        src_ip = event.get("src_ip", "Unknown")
        dest_ip = event.get("dest_ip", "Unknown")
        signature = event.get("alert", {}).get("signature", event.get("signature", "Unknown"))
        severity = event.get("alert", {}).get("severity", 3)
        timestamp = event.get("timestamp", datetime.now().isoformat())
        
        severity_emoji = "🔴" if severity == 1 else "🟠" if severity == 2 else "🟡"
        verdict_emoji = "🚨" if verdict == "ALERT" else "⚠️"
        
        message = f"""
{verdict_emoji} *SOC Alert - {verdict}*

{severity_emoji} *Severity:* {severity}
📊 *Confidence:* {confidence:.1f}%

🔍 *Signature:*
`{signature}`

📌 *Details:*
• Source: `{src_ip}`
• Destination: `{dest_ip}`
• Time: {timestamp}

🤖 AI has analyzed this event and determined it requires attention.
"""
        
        # Store event for logs
        recent_events.append({
            "timestamp": timestamp,
            "verdict": verdict,
            "confidence": confidence,
            "src_ip": src_ip,
            "signature": signature[:50],
        })
        if len(recent_events) > MAX_EVENTS:
            recent_events.pop(0)
            
        return await self.send_message(message)

    async def send_action_notification(
        self,
        action_type: str,
        target: str,
        details: str = "",
        notify_actions: Dict[str, bool] = None,
    ) -> bool:
        """
        Send notification for important actions (Block IP, Whitelist, Blacklist)
        """
        if not self.enabled:
            return False
            
        # Check if this action type should be notified
        default_notify = {
            "block_ip": True,
            "whitelist": True,
            "blacklist": True,
        }
        notify = notify_actions or default_notify
        
        action_key_map = {
            "block_ip": "block_ip",
            "unblock_ip": "block_ip",
            "add_whitelist": "whitelist",
            "remove_whitelist": "whitelist",
            "add_blacklist": "blacklist",
            "remove_blacklist": "blacklist",
        }
        
        key = action_key_map.get(action_type, "")
        if key and not notify.get(key, True):
            logger.debug(f"Skipping notification for {action_type} - disabled")
            return False

        # Action emojis and labels
        action_info = {
            "block_ip": ("🔒", "IP Blocked"),
            "unblock_ip": ("🔓", "IP Unblocked"),
            "add_whitelist": ("✅", "Added to Whitelist"),
            "remove_whitelist": ("❌", "Removed from Whitelist"),
            "add_blacklist": ("⛔", "Added to Blacklist"),
            "remove_blacklist": ("🗑️", "Removed from Blacklist"),
        }
        
        emoji, label = action_info.get(action_type, ("ℹ️", action_type))
        
        message = f"""
{emoji} *{label}*

🎯 *Target:* `{target}`
📝 *Details:* {details or "No additional info"}
⏰ *Time:* {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
"""
        
        # Store action for logs
        action_logs.append({
            "timestamp": datetime.now().isoformat(),
            "action": action_type,
            "target": target,
            "details": details,
        })
        if len(action_logs) > MAX_EVENTS:
            action_logs.pop(0)
            
        return await self.send_message(message)


    def get_system_status(self) -> str:
        """Get system performance metrics"""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Network I/O
            net_io = psutil.net_io_counters()
            
            # Format bytes
            def format_bytes(b):
                for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                    if b < 1024:
                        return f"{b:.2f} {unit}"
                    b /= 1024
                return f"{b:.2f} PB"
            
            cpu_bar = self._make_bar(cpu_percent)
            mem_bar = self._make_bar(memory.percent)
            disk_bar = self._make_bar(disk.percent)
            
            message = f"""
📊 *System Status*

💻 *CPU:* {cpu_percent}%
{cpu_bar}

🧠 *RAM:* {memory.percent}% ({format_bytes(memory.used)}/{format_bytes(memory.total)})
{mem_bar}

💾 *Disk:* {disk.percent}% ({format_bytes(disk.used)}/{format_bytes(disk.total)})
{disk_bar}

🌐 *Network:*
• Sent: {format_bytes(net_io.bytes_sent)}
• Received: {format_bytes(net_io.bytes_recv)}

⏰ Updated: {datetime.now().strftime("%H:%M:%S")}
"""
            return message
        except Exception as e:
            logger.error(f"Failed to get system status: {e}")
            return f"❌ Error getting system status: {str(e)}"

    def _make_bar(self, percent: float, length: int = 10) -> str:
        """Create a progress bar"""
        filled = int(percent / 100 * length)
        empty = length - filled
        
        if percent >= 90:
            color = "🟥"
        elif percent >= 70:
            color = "🟧"
        elif percent >= 50:
            color = "🟨"
        else:
            color = "🟩"
            
        return color * filled + "⬜" * empty

    def get_event_logs(self, time_range: str = "1h") -> str:
        """Get event logs for specified time range"""
        # Parse time range
        time_map = {
            "5m": timedelta(minutes=5),
            "30m": timedelta(minutes=30),
            "1h": timedelta(hours=1),
            "12h": timedelta(hours=12),
            "1d": timedelta(days=1),
        }
        
        delta = time_map.get(time_range, timedelta(hours=1))
        cutoff = datetime.now() - delta
        
        # Filter events
        filtered_events = [
            e for e in recent_events
            if datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).replace(tzinfo=None) > cutoff
        ]
        
        if not filtered_events:
            return f"📭 No events in the last {time_range}"
        
        # Count by verdict
        alert_count = sum(1 for e in filtered_events if e["verdict"] == "ALERT")
        suspicious_count = sum(1 for e in filtered_events if e["verdict"] == "SUSPICIOUS")
        
        # Recent 10 events
        recent = filtered_events[-10:]
        event_lines = []
        for e in recent:
            verdict_emoji = "🔴" if e["verdict"] == "ALERT" else "🟡"
            event_lines.append(
                f"{verdict_emoji} `{e['src_ip']}` - {e['signature'][:30]}..."
            )
        
        message = f"""
📋 *Event Logs ({time_range})*

📊 *Summary:*
• 🔴 ALERT: {alert_count}
• 🟡 SUSPICIOUS: {suspicious_count}
• Total: {len(filtered_events)}

📝 *Recent Events:*
{chr(10).join(event_lines) if event_lines else "No recent events"}

⏰ Generated: {datetime.now().strftime("%H:%M:%S")}
"""
        return message

    def get_action_logs(self, time_range: str = "1h") -> str:
        """Get action logs for specified time range"""
        time_map = {
            "5m": timedelta(minutes=5),
            "30m": timedelta(minutes=30),
            "1h": timedelta(hours=1),
            "12h": timedelta(hours=12),
            "1d": timedelta(days=1),
        }
        
        delta = time_map.get(time_range, timedelta(hours=1))
        cutoff = datetime.now() - delta
        
        filtered_logs = [
            a for a in action_logs
            if datetime.fromisoformat(a["timestamp"]) > cutoff
        ]
        
        if not filtered_logs:
            return f"📭 No actions in the last {time_range}"
        
        action_lines = []
        for a in filtered_logs[-15:]:
            action_emoji = {
                "block_ip": "🔒",
                "unblock_ip": "🔓",
                "add_whitelist": "✅",
                "remove_whitelist": "❌",
                "add_blacklist": "⛔",
                "remove_blacklist": "🗑️",
            }.get(a["action"], "ℹ️")
            
            action_lines.append(
                f"{action_emoji} `{a['target']}` - {a['action']}"
            )
        
        message = f"""
📋 *Action Logs ({time_range})*

📝 *Recent Actions:*
{chr(10).join(action_lines)}

⏰ Generated: {datetime.now().strftime("%H:%M:%S")}
"""
        return message

    def get_blocked_ips_summary(self, blocked_ips: List[str]) -> str:
        """Get blocked IPs summary"""
        if not blocked_ips:
            return "✅ No IPs currently blocked"
        
        ip_lines = [f"• `{ip}`" for ip in blocked_ips[:20]]
        more = f"\n... and {len(blocked_ips) - 20} more" if len(blocked_ips) > 20 else ""
        
        message = f"""
🔒 *Blocked IPs ({len(blocked_ips)} total)*

{chr(10).join(ip_lines)}{more}

⏰ Updated: {datetime.now().strftime("%H:%M:%S")}
"""
        return message

    def get_stats(self) -> str:
        """Get today's statistics"""
        today = datetime.now().date()
        
        today_events = [
            e for e in recent_events
            if datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).date() == today
        ]
        
        today_actions = [
            a for a in action_logs
            if datetime.fromisoformat(a["timestamp"]).date() == today
        ]
        
        # Count events
        alert_count = sum(1 for e in today_events if e["verdict"] == "ALERT")
        suspicious_count = sum(1 for e in today_events if e["verdict"] == "SUSPICIOUS")
        
        # Count actions
        block_count = sum(1 for a in today_actions if a["action"] == "block_ip")
        
        # Top source IPs
        ip_counts: Dict[str, int] = {}
        for e in today_events:
            ip = e.get("src_ip", "unknown")
            ip_counts[ip] = ip_counts.get(ip, 0) + 1
        
        top_ips = sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        top_ips_lines = [f"• `{ip}`: {count} events" for ip, count in top_ips]
        
        message = f"""
📈 *Today's Statistics*

🔔 *Events:*
• 🔴 ALERT: {alert_count}
• 🟡 SUSPICIOUS: {suspicious_count}
• Total: {len(today_events)}

⚡ *Actions:*
• 🔒 IPs Blocked: {block_count}
• Total Actions: {len(today_actions)}

🎯 *Top Source IPs:*
{chr(10).join(top_ips_lines) if top_ips_lines else "No data"}

⏰ Generated: {datetime.now().strftime("%H:%M:%S")}
"""
        return message


# Global bot instance
telegram_bot = TelegramBot()


async def handle_telegram_update(update: Dict[str, Any], blocked_ips_callback=None) -> Optional[str]:
    """
    Handle incoming Telegram update (webhook or polling)
    Returns response message if applicable
    """
    message = update.get("message", {})
    text = message.get("text", "")
    chat_id = message.get("chat", {}).get("id")
    
    if not text or not chat_id:
        return None
    
    # Parse command
    if text.startswith("/status"):
        return telegram_bot.get_system_status()
    
    elif text.startswith("/logs"):
        parts = text.split()
        time_range = parts[1] if len(parts) > 1 else "1h"
        return telegram_bot.get_event_logs(time_range)
    
    elif text.startswith("/actions"):
        parts = text.split()
        time_range = parts[1] if len(parts) > 1 else "1h"
        return telegram_bot.get_action_logs(time_range)
    
    elif text.startswith("/blocked"):
        if blocked_ips_callback:
            blocked_ips = await blocked_ips_callback()
            return telegram_bot.get_blocked_ips_summary(blocked_ips)
        return "❌ Blocked IPs info not available"
    
    elif text.startswith("/stats"):
        return telegram_bot.get_stats()
    
    elif text.startswith("/help"):
        return """
🤖 *SOC Dashboard Bot Commands*

📊 `/status` - System performance (CPU, RAM, Disk, Network)
📋 `/logs [5m|30m|1h|12h|1d]` - View event logs
⚡ `/actions [5m|30m|1h|12h|1d]` - View action logs  
🔒 `/blocked` - List blocked IPs
📈 `/stats` - Today's statistics
❓ `/help` - Show this help

_Bot powered by AI-SOC Engine_
"""
    
    return None


def configure_bot(token: str, chat_id: str, threshold: int = 80):
    """Configure the global telegram bot"""
    global telegram_bot
    telegram_bot = TelegramBot(token, chat_id)
    telegram_bot.confidence_threshold = threshold
    logger.info(f"Telegram bot configured with threshold {threshold}%")
