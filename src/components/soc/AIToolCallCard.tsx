import { useState } from 'react';
import { ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Props {
  name: string;
  args: string; // JSON string
  status: 'pending' | 'running' | 'success' | 'error' | 'denied';
  result?: unknown;
  error?: string;
}

export const AIToolCallCard = ({ name, args, status, result, error }: Props) => {
  const [open, setOpen] = useState(false);

  let parsedArgs: unknown = args;
  try {
    parsedArgs = JSON.parse(args);
  } catch {
    /* keep raw */
  }

  const statusColor =
    status === 'success'
      ? 'border-success/40 bg-success/5'
      : status === 'error' || status === 'denied'
        ? 'border-destructive/40 bg-destructive/5'
        : status === 'running'
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-muted/30';

  const Icon =
    status === 'success'
      ? CheckCircle2
      : status === 'error' || status === 'denied'
        ? XCircle
        : status === 'running'
          ? Loader2
          : Wrench;

  return (
    <div className={`rounded-md border ${statusColor} text-[10px] my-1.5`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-foreground/5 transition-colors"
      >
        <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin text-primary' : status === 'success' ? 'text-success' : status === 'error' || status === 'denied' ? 'text-destructive' : 'text-muted-foreground'}`} />
        <span className="font-mono font-semibold text-foreground">{name}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground uppercase tracking-wider text-[9px]">{status}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1.5 border-t border-border/40">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1.5 mb-0.5">Arguments</div>
            <pre className="bg-background/60 border border-border/50 rounded px-1.5 py-1 text-[9px] overflow-x-auto font-mono text-foreground/80">
              {JSON.stringify(parsedArgs, null, 2)}
            </pre>
          </div>
          {(result !== undefined || error) && (
            <div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
                {error ? 'Error' : 'Result'}
              </div>
              <pre className="bg-background/60 border border-border/50 rounded px-1.5 py-1 text-[9px] overflow-x-auto font-mono text-foreground/80 max-h-40">
                {error || JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
