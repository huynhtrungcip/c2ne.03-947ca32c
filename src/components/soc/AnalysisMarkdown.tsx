import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * AnalysisMarkdown — SIEM-styled renderer for AI analysis output.
 *
 * Auto-highlights important tokens inside plain text:
 *  - IPv4 addresses              → primary chip
 *  - Ports (port 80, :443)       → cyan chip
 *  - MITRE techniques (T1234)    → amber chip
 *  - CVE-IDs                     → red chip
 *  - ISO timestamps              → muted mono chip
 *  - Severity words              → colored pill (CRITICAL/HIGH/MEDIUM/LOW/INFO)
 *  - Priority tags (P0/P1/P2/P3) → colored pill
 *  - Verdict words (ALERT etc.)  → colored pill
 *
 * Highlighting is only applied inside <p>, <li>, <td>, <strong>, <em>.
 * Headings, code blocks and links are left untouched.
 */

type TokenKind =
  | 'ip' | 'port' | 'mitre' | 'cve' | 'ts'
  | 'sev-critical' | 'sev-high' | 'sev-medium' | 'sev-low' | 'sev-info'
  | 'prio-p0' | 'prio-p1' | 'prio-p2' | 'prio-p3'
  | 'verdict-alert' | 'verdict-suspicious' | 'verdict-benign' | 'verdict-fp';

interface MatchSpec {
  re: RegExp;
  kind: TokenKind | ((m: RegExpExecArray) => TokenKind);
}

// Order matters: more specific patterns first.
const PATTERNS: MatchSpec[] = [
  // CVE-2024-12345
  { re: /\bCVE-\d{4}-\d{4,7}\b/g, kind: 'cve' },
  // MITRE ATT&CK technique IDs (T1234, T1234.001)
  { re: /\bT\d{4}(?:\.\d{3})?\b/g, kind: 'mitre' },
  // ISO timestamp 2026-04-21T22:07:53.808Z (with optional ms)
  { re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?\b/g, kind: 'ts' },
  // IPv4 (avoid matching inside larger tokens)
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?\b/g, kind: 'ip' },
  // Severity words
  {
    re: /\b(CRITICAL|HIGH|MEDIUM|LOW|INFO)\b/g,
    kind: (m) => `sev-${m[1].toLowerCase()}` as TokenKind,
  },
  // Priority tags P0..P3
  {
    re: /\bP([0-3])\b/g,
    kind: (m) => `prio-p${m[1]}` as TokenKind,
  },
  // Verdict words
  {
    re: /\b(ALERT|SUSPICIOUS|BENIGN|FALSE[_ ]POSITIVE)\b/g,
    kind: (m) => {
      const v = m[1].toUpperCase();
      if (v === 'ALERT') return 'verdict-alert';
      if (v === 'SUSPICIOUS') return 'verdict-suspicious';
      if (v === 'BENIGN') return 'verdict-benign';
      return 'verdict-fp';
    },
  },
  // "port 80", "port:443"
  { re: /\bport[\s:]?\d{1,5}\b/gi, kind: 'port' },
];

const STYLES: Record<TokenKind, string> = {
  ip:                 'font-mono text-[11.5px] font-semibold px-1.5 py-px rounded-sm bg-primary/12 text-primary border border-primary/30',
  port:               'font-mono text-[11.5px] font-semibold px-1.5 py-px rounded-sm bg-[hsl(var(--soc-info)/0.12)] text-[hsl(var(--soc-info))] border border-[hsl(var(--soc-info)/0.30)]',
  mitre:              'font-mono text-[11.5px] font-semibold px-1.5 py-px rounded-sm bg-[hsl(var(--soc-warning)/0.14)] text-[hsl(var(--soc-warning))] border border-[hsl(var(--soc-warning)/0.35)]',
  cve:                'font-mono text-[11.5px] font-semibold px-1.5 py-px rounded-sm bg-destructive/15 text-destructive border border-destructive/35',
  ts:                 'font-mono text-[11px] px-1.5 py-px rounded-sm bg-muted/60 text-muted-foreground border border-border/60 whitespace-nowrap',
  'sev-critical':     'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-destructive/20 text-destructive border border-destructive/40',
  'sev-high':         'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-destructive/15 text-destructive border border-destructive/35',
  'sev-medium':       'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-[hsl(var(--soc-warning)/0.18)] text-[hsl(var(--soc-warning))] border border-[hsl(var(--soc-warning)/0.40)]',
  'sev-low':          'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-[hsl(var(--soc-info)/0.15)] text-[hsl(var(--soc-info))] border border-[hsl(var(--soc-info)/0.35)]',
  'sev-info':         'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-muted text-muted-foreground border border-border',
  'prio-p0':          'font-mono font-semibold text-[10.5px] px-1.5 py-px rounded-sm bg-destructive/20 text-destructive border border-destructive/40',
  'prio-p1':          'font-mono font-semibold text-[10.5px] px-1.5 py-px rounded-sm bg-[hsl(var(--soc-warning)/0.18)] text-[hsl(var(--soc-warning))] border border-[hsl(var(--soc-warning)/0.40)]',
  'prio-p2':          'font-mono font-semibold text-[10.5px] px-1.5 py-px rounded-sm bg-[hsl(var(--soc-info)/0.15)] text-[hsl(var(--soc-info))] border border-[hsl(var(--soc-info)/0.35)]',
  'prio-p3':          'font-mono font-semibold text-[10.5px] px-1.5 py-px rounded-sm bg-muted text-muted-foreground border border-border',
  'verdict-alert':    'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-destructive/20 text-destructive border border-destructive/40',
  'verdict-suspicious':'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-[hsl(var(--soc-warning)/0.18)] text-[hsl(var(--soc-warning))] border border-[hsl(var(--soc-warning)/0.40)]',
  'verdict-benign':   'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-[hsl(var(--soc-success)/0.16)] text-[hsl(var(--soc-success))] border border-[hsl(var(--soc-success)/0.38)]',
  'verdict-fp':       'font-semibold uppercase tracking-wider text-[10.5px] px-1.5 py-px rounded-sm bg-muted text-muted-foreground border border-border',
};

interface Hit {
  start: number;
  end: number;
  text: string;
  kind: TokenKind;
}

function findHits(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const spec of PATTERNS) {
    const re = new RegExp(spec.re.source, spec.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Skip overlap with already-claimed range
      if (hits.some(h => start < h.end && end > h.start)) continue;
      const kind = typeof spec.kind === 'function' ? spec.kind(m) : spec.kind;
      hits.push({ start, end, text: m[0], kind });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function highlightString(text: string, keyPrefix: string): React.ReactNode {
  if (!text) return text;
  const hits = findHits(text);
  if (hits.length === 0) return text;

  const out: React.ReactNode[] = [];
  let cursor = 0;
  hits.forEach((h, i) => {
    if (h.start > cursor) out.push(text.slice(cursor, h.start));
    out.push(
      <span key={`${keyPrefix}-${i}`} className={STYLES[h.kind]}>
        {h.text}
      </span>
    );
    cursor = h.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

/** Recursively walk children and highlight string leaves. */
function highlightChildren(children: React.ReactNode, keyPrefix = 'h'): React.ReactNode {
  return React.Children.map(children, (child, idx) => {
    if (typeof child === 'string') {
      return highlightString(child, `${keyPrefix}-${idx}`);
    }
    if (React.isValidElement(child)) {
      // Don't recurse into code / pre / a — those should remain literal
      const type = (child as React.ReactElement).type as any;
      const tag = typeof type === 'string' ? type : '';
      if (tag === 'code' || tag === 'pre' || tag === 'a') return child;
      const el = child as React.ReactElement<{ children?: React.ReactNode }>;
      return React.cloneElement(el, {
        children: highlightChildren(el.props.children, `${keyPrefix}-${idx}`),
      });
    }
    return child;
  });
}

const wrapWithHighlight = (Tag: keyof JSX.IntrinsicElements) =>
  ({ children, ...rest }: any) => (
    <Tag {...rest}>{highlightChildren(children)}</Tag>
  );

interface AnalysisMarkdownProps {
  source: string;
}

export const AnalysisMarkdown: React.FC<AnalysisMarkdownProps> = ({ source }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p:  wrapWithHighlight('p'),
        li: wrapWithHighlight('li'),
        td: wrapWithHighlight('td'),
        strong: ({ children, ...rest }: any) => (
          <strong {...rest} className="text-foreground font-bold">
            {highlightChildren(children)}
          </strong>
        ),
        em: ({ children, ...rest }: any) => (
          <em {...rest}>{highlightChildren(children)}</em>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
};

export default AnalysisMarkdown;
