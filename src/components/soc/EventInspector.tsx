import { useState, useEffect } from 'react';
import { SOCEvent } from '@/types/soc';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, Brain, Shield, ShieldAlert, Ban, CheckCircle } from 'lucide-react';
import { ConfirmDialog, useConfirmDialog } from './ConfirmDialog';

interface EventInspectorProps {
  event: SOCEvent | null;
}

interface AIAnalysis {
  verdict: string;
  confidence: number;
  reasoning: string;
  zeek_matched: boolean;
  ml_used: boolean;
  should_block: boolean;
}

export const EventInspector = ({ event }: EventInspectorProps) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingIP, setAnalyzingIP] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [isIPBlocked, setIsIPBlocked] = useState(false);
  const { dialogState, showConfirm, closeConfirm } = useConfirmDialog();

  // Check if the IP is already blocked
  useEffect(() => {
    if (event?.src_ip) {
      const blockedIPs = JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]');
      setIsIPBlocked(blockedIPs.includes(event.src_ip));
    }
  }, [event?.src_ip]);

  if (!event) return null;

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:8000';

  const verdictColor = {
    ALERT: '#ef4444',
    SUSPICIOUS: '#eab308',
    BENIGN: '#22c55e',
    FALSE_POSITIVE: '#22c55e',
    PENDING: '#6b7280',
  }[event.verdict] || '#6b7280';

  const verdictClass = {
    ALERT: 'verdict-alert',
    SUSPICIOUS: 'verdict-suspicious',
    BENIGN: 'verdict-benign',
    FALSE_POSITIVE: 'verdict-false-positive',
    PENDING: 'text-muted-foreground',
  }[event.verdict] || '';

  const analyzeFlow = async () => {
    setAnalyzing(true);
    try {
      // Get full event data with Zeek correlation
      const fullRes = await fetch(`${API_URL}/api/events/${event.id}/full`);
      const fullData = await fullRes.json();

      // Send to AI engine
      const aiRes = await fetch(`${AI_URL}/analyze/flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          suricata_alert: fullData.event,
          zeek_flows: fullData.zeek_flows,
        }),
      });
      const result = await aiRes.json();
      
      if (result.success) {
        setAiResult(result.analysis);
        toast.success(`AI Analysis: ${result.analysis.verdict} (${(result.analysis.confidence * 100).toFixed(0)}%)`);
      } else {
        toast.error('Analysis failed');
      }
    } catch (error) {
      toast.error('Failed to connect to AI Engine');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeAllFromIP = async () => {
    setAnalyzingIP(true);
    try {
      const res = await fetch(`${API_URL}/api/events/by-ip/${event.src_ip}`);
      const data = await res.json();

      const aiRes = await fetch(`${AI_URL}/analyze/ip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: event.src_ip,
          events: data.events,
          zeek_flows: data.zeek_flows,
        }),
      });
      const result = await aiRes.json();

      if (result.success) {
        const analysis = result.analysis;
        toast.success(`IP Risk Score: ${analysis.risk_score}/100 - ${analysis.recommendation}`);
      }
    } catch (error) {
      toast.error('Failed to analyze IP');
    } finally {
      setAnalyzingIP(false);
    }
  };

  const executeBlockIP = async () => {
    setBlocking(true);
    try {
      const res = await fetch(`${AI_URL}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: event.src_ip }),
      });
      const result = await res.json();
      
      if (result.success) {
        toast.success(result.message);
        // Update local blocked IPs list
        const blockedIPs = JSON.parse(localStorage.getItem('soc-blocked-ips') || '[]');
        if (!blockedIPs.includes(event.src_ip)) {
          blockedIPs.push(event.src_ip);
          localStorage.setItem('soc-blocked-ips', JSON.stringify(blockedIPs));
        }
        setIsIPBlocked(true);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to block IP');
    } finally {
      setBlocking(false);
    }
  };

  const handleBlockIP = () => {
    showConfirm(
      'block_ip',
      executeBlockIP,
      event.src_ip,
      `Signature: ${event.attack_type} | Verdict: ${event.verdict} | Confidence: ${(event.confidence * 100).toFixed(0)}%`
    );
  };

  return (
    <div className="inspector-panel" style={{ borderColor: verdictColor }}>
      <ScrollArea className="h-[450px]">
        <div className="grid grid-cols-4 gap-x-5 gap-y-3">
          <div>
            <div className="inspector-label">Timestamp</div>
            <div className="inspector-value font-semibold">{event.timestamp.toLocaleString()}</div>
          </div>
          <div>
            <div className="inspector-label">Verdict</div>
            <div className={`inspector-value font-bold text-lg ${verdictClass}`}>{event.verdict}</div>
          </div>
          <div>
            <div className="inspector-label">Signature</div>
            <div className="inspector-value font-semibold">{event.attack_type}</div>
          </div>
          <div>
            <div className="inspector-label">Engine</div>
            <div className="inspector-value">{event.source_engine}</div>
          </div>
        <div>
            <div className="inspector-label">Source</div>
            <div className="flex items-center gap-2">
              <div className="inspector-value text-blue-400">{event.src_ip}</div>
              {isIPBlocked && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/20 text-destructive">
                  <Ban className="w-3 h-3" />
                  BLOCKED
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="inspector-label">Destination</div>
            <div className="inspector-value">{event.dst_ip}:{event.dst_port || '-'}</div>
          </div>
          <div>
            <div className="inspector-label">Protocol</div>
            <div className="inspector-value">{event.protocol}</div>
          </div>
          <div>
            <div className="inspector-label">Confidence</div>
            <div className="inspector-value">{(event.confidence).toFixed(2)}</div>
          </div>
        </div>

        {/* AI Analysis Result */}
        {aiResult && (
          <div className="mt-4 p-3 rounded bg-muted/50 border border-border">
            <div className="text-xs font-semibold text-primary mb-2">🧠 AI Analysis Result</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-muted-foreground">Verdict:</span> <span className="font-bold">{aiResult.verdict}</span></div>
              <div><span className="text-muted-foreground">Confidence:</span> {(aiResult.confidence * 100).toFixed(0)}%</div>
              <div><span className="text-muted-foreground">Zeek:</span> {aiResult.zeek_matched ? '✓' : '✗'}</div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{aiResult.reasoning}</div>
          </div>
        )}

        {/* Raw Payload */}
        <div className="mt-4">
          <div className="inspector-label">Raw Payload</div>
          <pre className="bg-black p-3 rounded text-[0.8rem] font-mono text-zinc-400 overflow-x-auto mt-1">
            {event.raw_log || '{}'}
          </pre>
        </div>

        {/* AI Actions */}
        <div className="mt-5 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">🧠 AI Analysis</div>
          <Button 
            onClick={analyzeFlow}
            disabled={analyzing}
            className="w-full bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-xs"
          >
            {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
            Analyze This Flow
          </Button>
          <Button 
            onClick={analyzeAllFromIP}
            disabled={analyzingIP}
            variant="outline"
            className="w-full text-xs"
          >
            {analyzingIP ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
            Analyze All Flows from {event.src_ip}
          </Button>

          <div className="text-xs font-semibold text-muted-foreground mt-4 mb-2">🚫 Active Defense</div>
          {isIPBlocked ? (
            <div className="w-full p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-center">
              <div className="flex items-center justify-center gap-2 text-destructive">
                <Ban className="w-4 h-4" />
                <span className="text-xs font-semibold">IP {event.src_ip} has been BLOCKED</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                This IP is blocked on pfSense Firewall
              </p>
            </div>
          ) : (
            <Button 
              onClick={handleBlockIP}
              disabled={blocking}
              variant="destructive"
              className="w-full text-xs"
            >
              {blocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
              Block {event.src_ip} on pfSense
            </Button>
          )}
        </div>
      </ScrollArea>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={closeConfirm}
        onConfirm={dialogState.onConfirm}
        actionType={dialogState.actionType}
        targetValue={dialogState.targetValue}
        details={dialogState.details}
        isDarkMode={true}
      />
    </div>
  );
};
