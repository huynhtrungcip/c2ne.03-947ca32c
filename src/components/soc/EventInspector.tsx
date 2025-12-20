import { SOCEvent } from '@/types/soc';
import { Button } from '@/components/ui/button';
import { X, Shield, Ban, Brain, Clock, Fingerprint, Server, Network, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EventInspectorProps {
  event: SOCEvent | null;
  onClose: () => void;
}

const VerdictBadge = ({ verdict }: { verdict: SOCEvent['verdict'] }) => {
  const variants = {
    ALERT: { bg: 'bg-severity-critical', text: 'text-severity-critical', label: 'ALERT' },
    SUSPICIOUS: { bg: 'bg-severity-medium', text: 'text-severity-medium', label: 'SUSPICIOUS' },
    BENIGN: { bg: 'bg-severity-low', text: 'text-severity-low', label: 'BENIGN' },
    FALSE_POSITIVE: { bg: 'bg-severity-info', text: 'text-severity-info', label: 'FALSE POSITIVE' }
  };

  const variant = variants[verdict];

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded ${variant.bg} border border-current/30`}>
      <AlertTriangle className="w-4 h-4" />
      <span className={`text-sm font-bold uppercase tracking-wide ${variant.text}`}>
        {variant.label}
      </span>
    </span>
  );
};

const InfoRow = ({ icon: Icon, label, value, highlight = false }: { 
  icon: React.ElementType;
  label: string; 
  value: string; 
  highlight?: boolean 
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
    <span className={`font-mono text-sm ${highlight ? 'text-primary font-semibold' : 'text-foreground'}`}>
      {value}
    </span>
  </div>
);

export const EventInspector = ({ event, onClose }: EventInspectorProps) => {
  if (!event) return null;

  const borderColor = {
    ALERT: 'border-severity-critical',
    SUSPICIOUS: 'border-severity-medium',
    BENIGN: 'border-severity-low',
    FALSE_POSITIVE: 'border-severity-info'
  }[event.verdict];

  return (
    <div className={`soc-panel border-l-4 ${borderColor}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="soc-panel-header mb-0">
          Event Inspector
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-6">
          {/* Verdict & Timestamp */}
          <div className="flex items-center justify-between">
            <VerdictBadge verdict={event.verdict} />
            <span className="text-sm text-muted-foreground font-mono">
              {event.timestamp.toLocaleString()}
            </span>
          </div>

          {/* Main Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            <InfoRow icon={Shield} label="Signature" value={event.attack_type} />
            <InfoRow icon={Server} label="Engine" value={event.source_engine} />
            <InfoRow icon={Network} label="Source IP" value={event.src_ip} highlight />
            <InfoRow icon={Network} label="Destination" value={`${event.dst_ip}:${event.dst_port}`} />
            <InfoRow icon={Fingerprint} label="Protocol" value={event.protocol} />
            <InfoRow icon={Fingerprint} label="Community ID" value={event.community_id} />
          </div>

          {/* Confidence */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Confidence
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${event.confidence * 100}%` }}
                />
              </div>
              <span className="font-mono text-sm font-semibold">
                {(event.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Raw Payload */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Raw Payload
              </span>
            </div>
            <pre className="bg-background p-4 rounded-lg text-xs font-mono text-muted-foreground overflow-x-auto border border-border">
              {event.raw_log || '{}'}
            </pre>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                AI Playbook
              </span>
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              <Brain className="w-4 h-4 mr-2" />
              Generate AI Playbook
            </Button>

            <div className="flex items-center gap-2 mt-4 mb-3">
              <Ban className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Defense
              </span>
            </div>
            <Button variant="destructive" className="w-full">
              <Ban className="w-4 h-4 mr-2" />
              Block IP on Firewall
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
