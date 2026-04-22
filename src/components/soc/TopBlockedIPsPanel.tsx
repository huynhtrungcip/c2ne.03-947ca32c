import { useEffect, useState, useCallback } from 'react';
import { Shield, ShieldOff, RefreshCw, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog, useConfirmDialog } from './ConfirmDialog';

interface Props {
  apiUrl: string;
  /** Increment this prop externally (e.g. after block from Inspector) to force refetch */
  refreshKey?: number;
}

interface BlockedEntry {
  ip: string;
  source: 'pfsense' | 'local';
}

/**
 * Top Blocked IPs panel — synced with pfSense alias `AI_Blocked_IP`.
 * Shows currently blocked IPs with an Unblock button using the same API as SettingsModal.
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
      toast.success(`Unblocked ${ip}`);
    } catch (e) {
      toast.error(`Unblock failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setUnblockingIP(null);
    }
  };

  const handleUnblock = (ip: string) => {
    showConfirm(
      'unblock_ip',
      () => executeUnblock(ip),
      ip,
      `IP ${ip} will be removed from AI_Blocked_IP alias on pfSense`
    );
  };

  // Merge: pfSense is source of truth, local-only as fallback labeled
  const merged: BlockedEntry[] = [
    ...pfsenseIPs.map<BlockedEntry>((ip) => ({ ip, source: 'pfsense' })),
    ...localIPs
      .filter((ip) => !pfsenseIPs.includes(ip))
      .map<BlockedEntry>((ip) => ({ ip, source: 'local' })),
  ];

  const localOnlyCount = localIPs.filter((ip) => !pfsenseIPs.includes(ip)).length;

  const clearLocalOnly = () => {
    const synced = localIPs.filter((ip) => pfsenseIPs.includes(ip));
    localStorage.setItem('soc-blocked-ips', JSON.stringify(synced));
    window.dispatchEvent(new Event('soc-blocked-ips-changed'));
    setLocalIPs(synced);
    toast.success(`Cleared ${localOnlyCount} local-only entr${localOnlyCount === 1 ? 'y' : 'ies'}`);
  };

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
          <div className="flex items-center gap-1">
            {localOnlyCount > 0 && (
              <button
                onClick={clearLocalOnly}
                className="text-warning/70 hover:text-warning transition-colors p-0.5"
                title={`Clear ${localOnlyCount} local-only entr${localOnlyCount === 1 ? 'y' : 'ies'} (not on pfSense)`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={fetchBlocked}
              disabled={loading || !aiEngineUrl}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors p-0.5"
              title="Refresh from pfSense"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {!apiUrl && (
          <div className="text-[10px] text-muted-foreground/50 italic flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Configure API URL in Settings
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
              {loading ? 'Loading...' : 'No blocked IPs yet'}
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
