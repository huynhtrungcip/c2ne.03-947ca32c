import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

export type ConfirmActionType =
  | 'block_ip'
  | 'unblock_ip'
  | 'add_blacklist'
  | 'add_whitelist'
  | 'remove_blacklist'
  | 'remove_whitelist'
  | 'enable_auto_block'
  | 'disable_auto_block'
  | 'analyze_ip'
  | 'delete_data';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  actionType: ConfirmActionType;
  targetValue?: string;
  details?: string;
  isDarkMode?: boolean;
}

type Severity = 'critical' | 'warning' | 'info';

const ACTION_CONFIG: Record<ConfirmActionType, {
  action: string;       // command-style identifier, e.g. firewall.block
  title: string;        // short imperative title
  description: string;  // single sentence
  confirmText: string;
  severity: Severity;
}> = {
  block_ip: {
    action: 'firewall.block',
    title: 'Block source IP on pfSense',
    description: 'Tất cả traffic từ/đến địa chỉ này sẽ bị chặn ngay lập tức.',
    confirmText: 'Confirm block',
    severity: 'critical',
  },
  unblock_ip: {
    action: 'firewall.unblock',
    title: 'Unblock source IP',
    description: 'Traffic từ/đến địa chỉ này sẽ được khôi phục.',
    confirmText: 'Confirm unblock',
    severity: 'warning',
  },
  add_blacklist: {
    action: 'list.blacklist.add',
    title: 'Add to blacklist',
    description: 'Đánh dấu địa chỉ này là độc hại trong hệ thống.',
    confirmText: 'Add entry',
    severity: 'warning',
  },
  add_whitelist: {
    action: 'list.whitelist.add',
    title: 'Add to whitelist',
    description: 'Bỏ qua mọi cảnh báo liên quan đến địa chỉ này.',
    confirmText: 'Add entry',
    severity: 'info',
  },
  remove_blacklist: {
    action: 'list.blacklist.remove',
    title: 'Remove from blacklist',
    description: 'Gỡ địa chỉ này khỏi danh sách đen.',
    confirmText: 'Remove entry',
    severity: 'warning',
  },
  remove_whitelist: {
    action: 'list.whitelist.remove',
    title: 'Remove from whitelist',
    description: 'Địa chỉ này sẽ không còn được bỏ qua trong cảnh báo.',
    confirmText: 'Remove entry',
    severity: 'warning',
  },
  enable_auto_block: {
    action: 'policy.auto_block.enable',
    title: 'Enable auto-block policy',
    description: 'Hệ thống sẽ tự động block IP có confidence ≥ 0.8.',
    confirmText: 'Enable policy',
    severity: 'warning',
  },
  disable_auto_block: {
    action: 'policy.auto_block.disable',
    title: 'Disable auto-block policy',
    description: 'Auto-block sẽ ngừng. IP nguy hiểm phải block thủ công.',
    confirmText: 'Disable policy',
    severity: 'info',
  },
  analyze_ip: {
    action: 'analyze.source',
    title: 'Run AI analysis on source',
    description: 'Gửi toàn bộ flow của IP này tới AI Engine.',
    confirmText: 'Run analysis',
    severity: 'info',
  },
  delete_data: {
    action: 'data.purge',
    title: 'Delete event data',
    description: 'Có thể khôi phục trong vòng 2 phút sau khi xoá.',
    confirmText: 'Delete data',
    severity: 'critical',
  },
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'CRITICAL',
  warning: 'WARNING',
  info: 'INFO',
};

const SEVERITY_TONE: Record<Severity, { text: string; border: string; accent: string }> = {
  critical: {
    text: 'text-[hsl(var(--soc-alert))]',
    border: 'border-[hsl(var(--soc-alert)/0.4)]',
    accent: 'bg-[hsl(var(--soc-alert))]',
  },
  warning: {
    text: 'text-[hsl(var(--soc-warning))]',
    border: 'border-[hsl(var(--soc-warning)/0.4)]',
    accent: 'bg-[hsl(var(--soc-warning))]',
  },
  info: {
    text: 'text-muted-foreground',
    border: 'border-border',
    accent: 'bg-muted-foreground',
  },
};

export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  actionType,
  targetValue,
  details,
}: ConfirmDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const config = ACTION_CONFIG[actionType];
  const tone = SEVERITY_TONE[config.severity];

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isDestructive = config.severity === 'critical';

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-md p-0 gap-0 bg-card border border-border rounded-md shadow-lg overflow-hidden">
        {/* Header bar — Splunk/Elastic-style command title */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${tone.accent}`} />
            <span className={`text-[10px] font-mono font-semibold uppercase tracking-[0.14em] ${tone.text}`}>
              {SEVERITY_LABEL[config.severity]}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/60">/</span>
            <span className="text-[11px] font-mono text-muted-foreground truncate">
              {config.action}
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
            confirm
          </span>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <div className="text-sm font-semibold text-foreground leading-snug">
              {config.title}
            </div>
            <div className="text-[12px] text-muted-foreground leading-relaxed">
              {config.description}
            </div>
          </div>

          {/* Target — log-line style key/value */}
          {targetValue && (
            <div className="border border-border rounded-sm bg-muted/20 divide-y divide-border">
              <div className="flex items-baseline gap-3 px-3 py-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground w-16 shrink-0">
                  target
                </span>
                <span className="text-[12px] font-mono font-semibold text-foreground break-all">
                  {targetValue}
                </span>
              </div>
              {details && (
                <div className="flex items-baseline gap-3 px-3 py-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground w-16 shrink-0">
                    context
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground break-all">
                    {details}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Critical notice — flat, text-only */}
          {isDestructive && (
            <div className={`border-l-2 ${tone.border} pl-3 py-1`}>
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-0.5">
                impact
              </div>
              <div className="text-[12px] text-foreground/90 leading-relaxed">
                Hành động không thể hoàn tác tự động. Vui lòng xác nhận trước khi tiếp tục.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <AlertDialogFooter className="px-4 py-3 border-t border-border bg-muted/20 gap-2 sm:gap-2">
          <AlertDialogCancel
            disabled={isLoading}
            className="h-8 mt-0 px-3 text-[11px] font-mono uppercase tracking-wider rounded-sm bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={`h-8 px-3 min-w-[120px] text-[11px] font-mono uppercase tracking-wider rounded-sm border ${
              isDestructive
                ? 'bg-[hsl(var(--soc-alert))] hover:bg-[hsl(var(--soc-alert)/0.85)] text-white border-[hsl(var(--soc-alert))]'
                : config.severity === 'warning'
                  ? 'bg-[hsl(var(--soc-warning))] hover:bg-[hsl(var(--soc-warning)/0.85)] text-black border-[hsl(var(--soc-warning))]'
                  : 'bg-foreground hover:bg-foreground/85 text-background border-foreground'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                executing…
              </>
            ) : (
              config.confirmText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Hook to manage confirm dialog state
export const useConfirmDialog = () => {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    actionType: ConfirmActionType;
    targetValue?: string;
    details?: string;
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    actionType: 'block_ip',
    onConfirm: () => {},
  });

  const showConfirm = (
    actionType: ConfirmActionType,
    onConfirm: () => Promise<void> | void,
    targetValue?: string,
    details?: string
  ) => {
    setDialogState({
      isOpen: true,
      actionType,
      targetValue,
      details,
      onConfirm,
    });
  };

  const closeConfirm = () => {
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  };

  return {
    dialogState,
    showConfirm,
    closeConfirm,
  };
};
