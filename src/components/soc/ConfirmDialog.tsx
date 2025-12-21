import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle, Shield, ShieldAlert, ShieldCheck, Ban, Plus, Trash2 } from 'lucide-react';

export type ConfirmActionType = 
  | 'block_ip'
  | 'unblock_ip'
  | 'add_blacklist'
  | 'add_whitelist'
  | 'remove_blacklist'
  | 'remove_whitelist'
  | 'enable_auto_block'
  | 'disable_auto_block'
  | 'analyze_ip';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  actionType: ConfirmActionType;
  targetValue?: string; // IP, domain, etc.
  details?: string;
  isDarkMode?: boolean;
}

const ACTION_CONFIG: Record<ConfirmActionType, {
  title: string;
  description: string;
  icon: React.ReactNode;
  confirmText: string;
  confirmClass: string;
  severity: 'danger' | 'warning' | 'info';
}> = {
  block_ip: {
    title: 'Xác nhận Block IP',
    description: 'Bạn có chắc muốn block IP này trên pfSense Firewall? Hành động này sẽ ngăn chặn tất cả traffic từ/đến IP này.',
    icon: <ShieldAlert className="w-6 h-6 text-red-500" />,
    confirmText: 'Block IP',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
    severity: 'danger',
  },
  unblock_ip: {
    title: 'Xác nhận Unblock IP',
    description: 'Bạn có chắc muốn gỡ block IP này khỏi pfSense Firewall? Traffic từ/đến IP này sẽ được cho phép trở lại.',
    icon: <ShieldCheck className="w-6 h-6 text-green-500" />,
    confirmText: 'Unblock IP',
    confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
    severity: 'warning',
  },
  add_blacklist: {
    title: 'Thêm vào Blacklist',
    description: 'Bạn có chắc muốn thêm địa chỉ này vào danh sách đen? Địa chỉ này sẽ được đánh dấu là nguy hiểm trong hệ thống.',
    icon: <Ban className="w-6 h-6 text-orange-500" />,
    confirmText: 'Thêm vào Blacklist',
    confirmClass: 'bg-orange-600 hover:bg-orange-700 text-white',
    severity: 'warning',
  },
  add_whitelist: {
    title: 'Thêm vào Whitelist',
    description: 'Bạn có chắc muốn thêm địa chỉ này vào danh sách trắng? Địa chỉ này sẽ được coi là an toàn và bỏ qua các cảnh báo.',
    icon: <Plus className="w-6 h-6 text-blue-500" />,
    confirmText: 'Thêm vào Whitelist',
    confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    severity: 'info',
  },
  remove_blacklist: {
    title: 'Xóa khỏi Blacklist',
    description: 'Bạn có chắc muốn xóa địa chỉ này khỏi danh sách đen?',
    icon: <Trash2 className="w-6 h-6 text-red-500" />,
    confirmText: 'Xóa khỏi Blacklist',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
    severity: 'danger',
  },
  remove_whitelist: {
    title: 'Xóa khỏi Whitelist',
    description: 'Bạn có chắc muốn xóa địa chỉ này khỏi danh sách trắng? Địa chỉ này sẽ không còn được bỏ qua trong các cảnh báo.',
    icon: <Trash2 className="w-6 h-6 text-orange-500" />,
    confirmText: 'Xóa khỏi Whitelist',
    confirmClass: 'bg-orange-600 hover:bg-orange-700 text-white',
    severity: 'warning',
  },
  enable_auto_block: {
    title: 'Bật Auto-Block',
    description: 'Bạn có chắc muốn bật tính năng tự động block IP? Hệ thống sẽ tự động block các IP được AI đánh giá là nguy hiểm.',
    icon: <Shield className="w-6 h-6 text-yellow-500" />,
    confirmText: 'Bật Auto-Block',
    confirmClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    severity: 'warning',
  },
  disable_auto_block: {
    title: 'Tắt Auto-Block',
    description: 'Bạn có chắc muốn tắt tính năng tự động block IP? Hệ thống sẽ không tự động block các IP nguy hiểm nữa.',
    icon: <Shield className="w-6 h-6 text-gray-500" />,
    confirmText: 'Tắt Auto-Block',
    confirmClass: 'bg-gray-600 hover:bg-gray-700 text-white',
    severity: 'info',
  },
  analyze_ip: {
    title: 'Phân tích IP',
    description: 'Bạn có chắc muốn gửi tất cả dữ liệu traffic từ IP này đến AI Engine để phân tích chi tiết?',
    icon: <AlertTriangle className="w-6 h-6 text-blue-500" />,
    confirmText: 'Phân tích',
    confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    severity: 'info',
  },
};

export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  actionType,
  targetValue,
  details,
  isDarkMode = true,
}: ConfirmDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const config = ACTION_CONFIG[actionType];

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

  const severityBorderColor = {
    danger: 'border-red-500/50',
    warning: 'border-orange-500/50',
    info: 'border-blue-500/50',
  }[config.severity];

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className={`max-w-md ${isDarkMode ? 'bg-[#0f0f0f] border-[#27272a]' : 'bg-white border-gray-200'} ${severityBorderColor} border-l-4`}>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-[#18181b]' : 'bg-gray-100'}`}>
              {config.icon}
            </div>
            <AlertDialogTitle className={`text-lg font-semibold ${isDarkMode ? 'text-[#e4e4e7]' : 'text-gray-900'}`}>
              {config.title}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className={`mt-3 text-sm ${isDarkMode ? 'text-[#a1a1aa]' : 'text-gray-600'}`}>
            {config.description}
          </AlertDialogDescription>
          
          {/* Target Value Display */}
          {targetValue && (
            <div className={`mt-4 p-3 rounded-lg ${isDarkMode ? 'bg-[#18181b] border border-[#27272a]' : 'bg-gray-50 border border-gray-200'}`}>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${isDarkMode ? 'text-[#52525b]' : 'text-gray-500'}`}>
                Đối tượng
              </div>
              <div className={`font-mono text-sm font-semibold ${isDarkMode ? 'text-[#3b82f6]' : 'text-blue-600'}`}>
                {targetValue}
              </div>
              {details && (
                <div className={`mt-2 text-xs ${isDarkMode ? 'text-[#71717a]' : 'text-gray-500'}`}>
                  {details}
                </div>
              )}
            </div>
          )}

          {/* Warning for dangerous actions */}
          {config.severity === 'danger' && (
            <div className={`mt-4 p-3 rounded-lg border ${isDarkMode ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div className={`text-xs ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                  <strong>Cảnh báo:</strong> Hành động này có thể ảnh hưởng đến hoạt động của hệ thống mạng. 
                  Vui lòng xác nhận bạn hiểu rõ tác động trước khi tiếp tục.
                </div>
              </div>
            </div>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-6 gap-2">
          <AlertDialogCancel 
            disabled={isLoading}
            className={`${isDarkMode ? 'bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#e4e4e7]' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'}`}
          >
            Hủy bỏ
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={`${config.confirmClass} min-w-[120px]`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang xử lý...
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
