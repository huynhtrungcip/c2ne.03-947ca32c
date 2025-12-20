import { SOCEvent } from '@/types/soc';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EventInspectorProps {
  event: SOCEvent | null;
}

export const EventInspector = ({ event }: EventInspectorProps) => {
  if (!event) return null;

  const verdictColor = {
    ALERT: '#ef4444',
    SUSPICIOUS: '#eab308',
    BENIGN: '#22c55e',
    FALSE_POSITIVE: '#22c55e'
  }[event.verdict];

  const verdictClass = {
    ALERT: 'verdict-alert',
    SUSPICIOUS: 'verdict-suspicious',
    BENIGN: 'verdict-benign',
    FALSE_POSITIVE: 'verdict-false-positive'
  }[event.verdict];

  return (
    <div className="inspector-panel" style={{ borderColor: verdictColor }}>
      <ScrollArea className="h-[450px]">
        <div className="grid grid-cols-4 gap-x-5 gap-y-3">
          {/* Row 1 */}
          <div>
            <div className="inspector-label">Timestamp</div>
            <div className="inspector-value font-semibold">
              {event.timestamp.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="inspector-label">Verdict</div>
            <div className={`inspector-value font-bold text-lg ${verdictClass}`}>
              {event.verdict}
            </div>
          </div>
          <div>
            <div className="inspector-label">Signature</div>
            <div className="inspector-value font-semibold">{event.attack_type}</div>
          </div>
          <div>
            <div className="inspector-label">Engine</div>
            <div className="inspector-value">{event.source_engine}</div>
          </div>

          {/* Row 2 */}
          <div>
            <div className="inspector-label">Source</div>
            <div className="inspector-value text-blue-400">{event.src_ip}</div>
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
            <div className="inspector-label">Community ID</div>
            <div className="inspector-value text-xs">{event.community_id}</div>
          </div>

          {/* Row 3 */}
          <div>
            <div className="inspector-label">Confidence</div>
            <div className="inspector-value">{(event.confidence).toFixed(2)}</div>
          </div>
          <div>
            <div className="inspector-label">Auto-Block State</div>
            <div className="inspector-value">{event.action_taken || '-'}</div>
          </div>
        </div>

        {/* Raw Payload */}
        <div className="mt-4">
          <div className="inspector-label">Raw Payload</div>
          <pre className="bg-black p-3 rounded text-[0.8rem] font-mono text-zinc-400 overflow-x-auto mt-1">
            {event.raw_log || '{}'}
          </pre>
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-3">
          <div className="text-xs font-semibold text-zinc-400 mb-2">🧠 AI Playbook for this flow</div>
          <Button 
            className="w-full bg-zinc-950 border border-border text-zinc-200 hover:border-blue-500 text-xs uppercase tracking-wider"
          >
            Ask MegaLLM about this flow only
          </Button>

          <div className="text-xs font-semibold text-zinc-400 mt-4 mb-2">🚫 Active Defense: Block Source IP on pfSense (Manual)</div>
          <Button 
            variant="destructive"
            className="w-full text-xs uppercase tracking-wider"
          >
            Block IP {event.src_ip} on pfSense
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
};
