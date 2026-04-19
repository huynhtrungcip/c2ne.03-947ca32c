import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AIProviderConfig,
  ProviderKind,
  PROVIDER_PRESETS,
  loadProviders,
  saveProviders,
  getActiveProviderId,
  setActiveProviderId,
  testProvider,
} from '@/lib/aiProviders';
import { Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onChange?: () => void;
}

const KIND_OPTIONS: { kind: ProviderKind; label: string }[] = [
  { kind: 'megallm', label: 'MegaLLM' },
  { kind: 'grok', label: 'Grok (xAI)' },
  { kind: 'gemini', label: 'Gemini (OpenAI-compat)' },
  { kind: 'ollama', label: 'Ollama (Local/VPS)' },
  { kind: 'custom', label: 'Custom OpenAI-compatible' },
];

const newId = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const AISettingsModal = ({ open, onClose, onChange }: Props) => {
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<AIProviderConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (open) {
      const list = loadProviders();
      setProviders(list);
      setActive(getActiveProviderId());
      setEditing(null);
      setTestResult(null);
    }
  }, [open]);

  const persist = (next: AIProviderConfig[], nextActive?: string | null) => {
    saveProviders(next);
    setProviders(next);
    if (nextActive !== undefined) {
      if (nextActive) setActiveProviderId(nextActive);
      setActive(nextActive);
    }
    onChange?.();
  };

  const startNew = () => {
    const preset = PROVIDER_PRESETS.megallm;
    setEditing({
      id: newId(),
      kind: 'megallm',
      label: preset.label as string,
      baseUrl: preset.baseUrl as string,
      apiKey: '',
      model: preset.model as string,
      supportsTools: preset.supportsTools,
    });
    setTestResult(null);
  };

  const startEdit = (p: AIProviderConfig) => {
    setEditing({ ...p });
    setTestResult(null);
  };

  const onKindChange = (kind: ProviderKind) => {
    if (!editing) return;
    const preset = PROVIDER_PRESETS[kind];
    setEditing({
      ...editing,
      kind,
      label: preset.label as string,
      baseUrl: preset.baseUrl as string,
      model: preset.model as string,
      supportsTools: preset.supportsTools,
    });
  };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.baseUrl || !editing.model) {
      toast.error('Base URL và Model là bắt buộc');
      return;
    }
    const exists = providers.find((p) => p.id === editing.id);
    const next = exists ? providers.map((p) => (p.id === editing.id ? editing : p)) : [...providers, editing];
    const nextActive = activeId || editing.id;
    persist(next, nextActive);
    setEditing(null);
    toast.success(`Đã lưu provider "${editing.label}"`);
  };

  const handleDelete = (id: string) => {
    const next = providers.filter((p) => p.id !== id);
    let nextActive: string | null | undefined = undefined;
    if (activeId === id) nextActive = next[0]?.id || null;
    persist(next, nextActive);
    if (editing?.id === id) setEditing(null);
  };

  const handleTest = async () => {
    if (!editing) return;
    setTesting(true);
    setTestResult(null);
    const r = await testProvider(editing);
    setTesting(false);
    setTestResult({
      ok: r.ok,
      msg: r.ok ? `OK · ${r.latencyMs}ms` : r.error || 'Failed',
    });
  };

  const presetModels = editing ? PROVIDER_PRESETS[editing.kind].models : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Zap className="h-4 w-4 text-primary" />
            AI Provider Settings
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cấu hình AI providers (MegaLLM, Grok, Gemini, Ollama local/VPS, Custom). API key lưu trong trình duyệt — chỉ dùng cho môi trường SOC nội bộ.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {/* List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Providers</h3>
              <Button size="sm" variant="outline" onClick={startNew} className="h-7 text-[11px]">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {providers.length === 0 && (
              <div className="text-[11px] text-muted-foreground italic border border-dashed border-border rounded-md p-3 text-center">
                Chưa có provider. Bấm <strong>Add</strong> để thêm.
              </div>
            )}
            <div className="space-y-1.5">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
                    activeId === p.id ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                  onClick={() => startEdit(p)}
                >
                  <input
                    type="radio"
                    checked={activeId === p.id}
                    onChange={(e) => {
                      e.stopPropagation();
                      setActiveProviderId(p.id);
                      setActive(p.id);
                      onChange?.();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-foreground truncate">{p.label}</div>
                    <div className="text-[9px] text-muted-foreground font-mono truncate">{p.model}</div>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {p.kind}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-destructive/70 hover:text-destructive p-1"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {editing ? (providers.find((p) => p.id === editing.id) ? 'Edit Provider' : 'New Provider') : 'Configure'}
            </h3>
            {!editing ? (
              <div className="text-[11px] text-muted-foreground italic border border-dashed border-border rounded-md p-4 text-center">
                Chọn provider để sửa, hoặc <strong>Add</strong> để tạo mới.
              </div>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</Label>
                  <select
                    value={editing.kind}
                    onChange={(e) => onKindChange(e.target.value as ProviderKind)}
                    className="mt-1 w-full h-8 px-2 text-[11px] bg-background border border-border rounded-md text-foreground"
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.kind} value={o.kind}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Label</Label>
                  <Input
                    value={editing.label}
                    onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                    className="mt-1 h-8 text-[11px]"
                    placeholder="e.g. My Grok"
                  />
                </div>

                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Base URL</Label>
                  <Input
                    value={editing.baseUrl}
                    onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                    className="mt-1 h-8 text-[11px] font-mono"
                    placeholder="https://api.example.com/v1"
                  />
                  {editing.kind === 'ollama' && (
                    <p className="text-[9px] text-muted-foreground mt-1">
                      ⚠️ Ollama cần set <code className="bg-muted px-1 rounded">OLLAMA_ORIGINS=*</code> trên server để cho phép browser CORS.
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    API Key {editing.kind === 'ollama' && <span className="opacity-60">(optional)</span>}
                  </Label>
                  <Input
                    type="password"
                    value={editing.apiKey}
                    onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    className="mt-1 h-8 text-[11px] font-mono"
                    placeholder="sk-..."
                  />
                </div>

                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Model</Label>
                  <Input
                    value={editing.model}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    className="mt-1 h-8 text-[11px] font-mono"
                    list={`models-${editing.kind}`}
                  />
                  {presetModels.length > 0 && (
                    <datalist id={`models-${editing.kind}`}>
                      {presetModels.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  )}
                  {presetModels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {presetModels.map((m) => (
                        <button
                          key={m}
                          onClick={() => setEditing({ ...editing, model: m })}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/20 text-muted-foreground hover:text-foreground border border-border transition-colors"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={!!editing.supportsTools}
                    onChange={(e) => setEditing({ ...editing, supportsTools: e.target.checked })}
                    className="accent-primary"
                  />
                  Hỗ trợ tool calling (function calling)
                </label>

                {testResult && (
                  <div className={`flex items-start gap-1.5 text-[10px] px-2 py-1.5 rounded border ${testResult.ok ? 'border-success/40 bg-success/5 text-success' : 'border-destructive/40 bg-destructive/5 text-destructive'}`}>
                    {testResult.ok ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                    <span className="break-all">{testResult.msg}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="h-8 text-[11px]">
                    {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Test
                  </Button>
                  <Button size="sm" onClick={handleSave} className="h-8 text-[11px] flex-1">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-8 text-[11px]">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
