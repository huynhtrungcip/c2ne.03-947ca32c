import { useEffect, useState, useCallback } from 'react';
import { Shield, ShieldOff, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmDialog } from './ConfirmDialog';

interface Props {
  apiUrl: string;
  /** Tăng prop này từ ngoài (vd: sau khi block từ Inspector) để force refetch */
  refreshKey?: number;
}

interface BlockedEntry {
  ip: string;
  source: 'pfsense' | 'local';
}

/**
 * Top Blocked IPs panel — đồng bộ với pfSense alias `AI_Blocked_IP`.
 * Hiển thị danh sách IP đang bị block + nút Unblock gọi đúng API như SettingsModal cũ.
 */
export const TopBlockedIPsPanel = ({ apiUrl, refreshKey = 0 }: Props) => {
  const [pfsenseIPs, setPfsenseIPs] = useState<string[]>([]);
  const [localIPs, setLocalIPs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]');
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [unblockingIP, setUnblockingIP] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const { dialogState, showConfirm, closeConfirm } = useConfirmDialog();

  const aiEngineUrl = apiUrl
    ? apiUrl.replace(':3001', ':8000').replace(':3002', ':8000')
    : '';

  // Fetch pfSense blocked IPs
  const fetchBlocked = useCallback(async () => {
    if (!aiEngineUrl) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${aiEngineUrl}/blocked-ips`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setPfsenseIPs(Array.isArray(data.ips) ? data.ips : []);
      setLastSync(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [aiEngineUrl]);

  useEffect(() => {
    fetchBlocked();
    const id = setInterval(fetchBlocked, 30_000); // auto-refresh 30s
    return () => clearInterval(id);
  }, [fetchBlocked, refreshKey]);

  // Listen to localStorage changes from other panels
  useEffect(() => {
    const reload = () => {
      try {
        setLocalIPs(JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]'));
      } catch { /* noop */ }
    };
    window.addEventListener('storage', reload);
    window.addEventListener('soc-blocked-ips-changed', reload);
    return () => {
      window.removeEventListener('storage', reload);
      window.removeEventListener('soc-blocked-ips-changed', reload);
    };
  }, []);

  const executeUnblock = async (ip: string) => {
    setUnblockingIP(ip);
    try {
      if (aiEngineUrl) {
        const resp = await fetch(`${aiEngineUrl}/unblock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) throw new Error(`pfSense API HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.success) throw new Error(data.message || 'pfSense returned failure');
      }
      // Remove from local cache
      const updated = localIPs.filter((i) => i !== ip);
      localStorage.setItem('soc-blocked-ips', JSON.stringify(updated));
      window.dispatchEvent(new Event('soc-blocked-ips-changed'));
      setLocalIPs(updated);
      // Refresh from pfSense
      await fetchBlocked();
      toast.success(`Đã unblock ${ip}`);
    } catch (e) {
      toast.error(`Unblock thất bại: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setUnblockingIP(null);
    }
  };

  const handleUnblock = (ip: string) => {
    showConfirm(
      'unblock_ip',
      () => executeUnblock(ip),
      ip,
      `IP ${ip} sẽ được gỡ khỏi alias AI_Blocked_IP trên pfSense`
    );
  };

  // Merge: pfSense is source of truth, local-only as fallback labeled
  const merged: BlockedEntry[] = [
    ...pfsenseIPs.map<BlockedEntry>((ip) => ({ ip, source: 'pfsense' })),
    ...localIPs
      .filter((ip) => !pfsenseIPs.includes(ip))
      .map<BlockedEntry>((ip) => ({ ip, source: 'local' })),
  ];

  return (
    <>
      <div className="border rounded-md p-3 bg-card border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-destructive" />
            <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              Top Blocked IPs
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/60">
              ({merged.length})
            </span>
          </div>
          <button
            onClick={fetchBlocked}
            disabled={loading || !aiEngineUrl}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors p-0.5"
            title="Refresh from pfSense"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </button>
        </div>

        {!apiUrl && (
          <div className="text-[10px] text-muted-foreground/50 italic flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Cấu hình API URL trong Settings
          </div>
        )}

        {error && (
          <div className="text-[10px] text-destructive/80 mb-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {error}
          </div>
        )}

        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {merged.length === 0 ? (
            <div className="text-[10px] text-muted-foreground/50 italic py-3 text-center">
              {loading ? 'Đang tải...' : 'Chưa có IP nào bị block'}
            </div>
          ) : (
            merged.slice(0, 8).map(({ ip, source }) => (
              <div
                key={ip}
                className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/30 hover:bg-muted/60 border border-transparent hover:border-border transition-all"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      source === 'pfsense' ? 'bg-destructive' : 'bg-warning/70'
                    }`}
                    title={source === 'pfsense' ? 'Synced with pfSense' : 'Local only (not on pfSense)'}
                  />
                  <span className="text-[11px] font-mono text-foreground truncate">{ip}</span>
                  {source === 'local' && (
                    <span className="text-[8px] uppercase tracking-wider text-warning/80 font-semibold shrink-0">
                      local
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleUnblock(ip)}
                  disabled={unblockingIP === ip || !aiEngineUrl}
                  className="opacity-0 group-hover:opacity-100 px-1.5 h-5 text-[9px] font-semibold uppercase tracking-wider bg-success/10 text-success border border-success/40 rounded hover:bg-success/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                  title="Unblock IP"
                >
                  {unblockingIP === ip ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <>
                      <ShieldOff className="h-2.5 w-2.5" />
                      Unblock
                    </>
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {lastSync && (
          <div className="mt-2 pt-2 border-t border-border/40 text-[9px] font-mono text-muted-foreground/50 flex items-center justify-between">
            <span>pfSense alias: AI_Blocked_IP</span>
            <span>Synced {lastSync.toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        actionType={dialogState.actionType}
        targetValue={dialogState.targetValue}
        details={dialogState.details}
        onConfirm={dialogState.onConfirm}
        onClose={closeConfirm}
      />
    </>
  );
};
