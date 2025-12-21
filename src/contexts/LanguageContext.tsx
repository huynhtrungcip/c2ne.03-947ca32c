import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'vi';

interface Translations {
  [key: string]: {
    en: string;
    vi: string;
  };
}

const translations: Translations = {
  // Header & Navigation
  'nav.overview': { en: 'Overview', vi: 'Tổng quan' },
  'nav.events': { en: 'Events', vi: 'Sự kiện' },
  'nav.threats': { en: 'Threats', vi: 'Mối đe dọa' },
  'nav.reports': { en: 'Reports', vi: 'Báo cáo' },
  'nav.soc': { en: 'Security Operations Center', vi: 'Trung tâm Điều hành An ninh' },
  
  // Controls
  'ctrl.live': { en: 'Live', vi: 'Trực tiếp' },
  'ctrl.autoBlock': { en: 'Auto Block', vi: 'Tự động chặn' },
  'ctrl.allEvents': { en: 'All Events', vi: 'Tất cả sự kiện' },
  'ctrl.alertsOnly': { en: 'Alerts Only', vi: 'Chỉ cảnh báo' },
  'ctrl.paused': { en: 'PAUSED', vi: 'TẠM DỪNG' },
  'ctrl.range': { en: 'Range', vi: 'Khoảng thời gian' },
  
  // Metrics
  'metrics.events': { en: 'EVENTS', vi: 'SỰ KIỆN' },
  'metrics.critical': { en: 'CRITICAL', vi: 'NGHIÊM TRỌNG' },
  'metrics.suspicious': { en: 'SUSPICIOUS', vi: 'ĐÁNG NGỜ' },
  'metrics.falsePos': { en: 'FALSE POS', vi: 'DƯƠNG TÍNH GIẢ' },
  'metrics.sources': { en: 'SOURCES', vi: 'NGUỒN' },
  
  // Charts
  'chart.trafficAlerts': { en: 'Traffic & Alerts', vi: 'Lưu lượng & Cảnh báo' },
  'chart.traffic': { en: 'Traffic', vi: 'Lưu lượng' },
  'chart.alerts': { en: 'Alerts', vi: 'Cảnh báo' },
  'chart.attackDist': { en: 'Attack Distribution', vi: 'Phân bố tấn công' },
  'chart.noData': { en: 'No data available', vi: 'Không có dữ liệu' },
  'chart.systemSafe': { en: 'System Safe', vi: 'Hệ thống an toàn' },
  'chart.noThreats': { en: 'No active threats', vi: 'Không có mối đe dọa' },
  
  // Event Table
  'table.eventStream': { en: 'Event Stream', vi: 'Luồng sự kiện' },
  'table.events': { en: 'events', vi: 'sự kiện' },
  'table.pauseHint': { en: 'Pause LIVE mode to inspect events', vi: 'Tạm dừng chế độ LIVE để xem chi tiết' },
  'table.clickHint': { en: 'Click any row to inspect', vi: 'Nhấn vào hàng bất kỳ để xem chi tiết' },
  'table.time': { en: 'Time', vi: 'Thời gian' },
  'table.verdict': { en: 'Verdict', vi: 'Phán định' },
  'table.source': { en: 'Source', vi: 'Nguồn' },
  'table.destination': { en: 'Destination', vi: 'Đích' },
  'table.port': { en: 'Port', vi: 'Cổng' },
  'table.signature': { en: 'Signature', vi: 'Chữ ký' },
  'table.conf': { en: 'Conf', vi: 'Độ tin cậy' },
  'table.noEvents': { en: 'No events', vi: 'Không có sự kiện' },
  'table.topSources': { en: 'Top Sources', vi: 'Nguồn hàng đầu' },
  
  // Filters
  'filter.filters': { en: 'Filters', vi: 'Bộ lọc' },
  'filter.allVerdicts': { en: 'All Verdicts', vi: 'Tất cả phán định' },
  'filter.byIP': { en: 'Filter by IP...', vi: 'Lọc theo IP...' },
  'filter.bySig': { en: 'Filter by Signature...', vi: 'Lọc theo chữ ký...' },
  'filter.minConf': { en: 'Min Confidence', vi: 'Độ tin cậy tối thiểu' },
  'filter.clear': { en: 'Clear filters', vi: 'Xóa bộ lọc' },
  
  // Inspector
  'inspector.title': { en: 'Event Inspector', vi: 'Chi tiết sự kiện' },
  'inspector.timestamp': { en: 'Timestamp', vi: 'Thời điểm' },
  'inspector.signature': { en: 'Signature', vi: 'Chữ ký' },
  'inspector.engine': { en: 'Engine', vi: 'Engine' },
  'inspector.confidence': { en: 'Confidence', vi: 'Độ tin cậy' },
  'inspector.sourceIP': { en: 'Source IP', vi: 'IP nguồn' },
  'inspector.destination': { en: 'Destination', vi: 'Đích' },
  'inspector.protocol': { en: 'Protocol', vi: 'Giao thức' },
  'inspector.communityId': { en: 'Community ID', vi: 'Community ID' },
  'inspector.rawPayload': { en: 'Raw Payload', vi: 'Dữ liệu thô' },
  'inspector.askAssistant': { en: 'Ask ASSISTANT About This Flow', vi: 'Hỏi ASSISTANT về luồng này' },
  'inspector.blockIP': { en: 'Block IP', vi: 'Chặn IP' },
  'inspector.onPfSense': { en: 'on pfSense', vi: 'trên pfSense' },
  
  // AI Chat
  'ai.title': { en: 'AI Assistant', vi: 'Trợ lý AI' },
  'ai.welcome': { en: 'SOC AI Assistant ready. Ask me about alerts, source IPs, attack patterns or recommended actions.', vi: 'Trợ lý AI SOC sẵn sàng. Hãy đặt câu hỏi về cảnh báo, IP nguồn, pattern tấn công hoặc đề xuất hành động.' },
  'ai.placeholder': { en: 'Ask about logs, alerts, correlation...', vi: 'Hỏi về logs, alerts, correlation...' },
  'ai.send': { en: 'Send', vi: 'Gửi' },
  'ai.analyzing': { en: 'Analyzing SOC data... AI feature will connect to backend.', vi: 'Đang phân tích dữ liệu SOC... Tính năng AI sẽ kết nối với backend.' },
  
  // Events Tab
  'events.statistics': { en: 'Event Statistics', vi: 'Thống kê sự kiện' },
  'events.total': { en: 'Total', vi: 'Tổng' },
  'events.alerts': { en: 'Alerts', vi: 'Cảnh báo' },
  'events.suspicious': { en: 'Suspicious', vi: 'Đáng ngờ' },
  'events.benign': { en: 'Benign', vi: 'Bình thường' },
  'events.detectionEngines': { en: 'Detection Engines', vi: 'Engine phát hiện' },
  'events.recentAlerts': { en: 'Recent Alerts', vi: 'Cảnh báo gần đây' },
  'events.noAlerts': { en: 'No recent alerts', vi: 'Không có cảnh báo gần đây' },
  'events.eventTimeline': { en: 'Event Timeline', vi: 'Dòng thời gian sự kiện' },
  
  // Threats Tab
  'threats.overview': { en: 'Threat Overview', vi: 'Tổng quan mối đe dọa' },
  'threats.highRisk': { en: 'High Risk', vi: 'Rủi ro cao' },
  'threats.mediumRisk': { en: 'Medium Risk', vi: 'Rủi ro trung bình' },
  'threats.lowRisk': { en: 'Low Risk', vi: 'Rủi ro thấp' },
  'threats.attackSignatures': { en: 'Attack Signatures', vi: 'Chữ ký tấn công' },
  'threats.count': { en: 'Count', vi: 'Số lượng' },
  'threats.topThreatSources': { en: 'Top Threat Sources', vi: 'Nguồn đe dọa hàng đầu' },
  'threats.events': { en: 'events', vi: 'sự kiện' },
  
  // Reports Tab
  'reports.summary': { en: 'Security Summary Report', vi: 'Báo cáo tổng hợp bảo mật' },
  'reports.period': { en: 'Report Period', vi: 'Kỳ báo cáo' },
  'reports.keyMetrics': { en: 'Key Metrics', vi: 'Chỉ số chính' },
  'reports.totalEvents': { en: 'Total Events', vi: 'Tổng sự kiện' },
  'reports.criticalAlerts': { en: 'Critical Alerts', vi: 'Cảnh báo nghiêm trọng' },
  'reports.uniqueSources': { en: 'Unique Sources', vi: 'Nguồn duy nhất' },
  'reports.avgConfidence': { en: 'Avg Confidence', vi: 'Độ tin cậy TB' },
  'reports.verdictBreakdown': { en: 'Verdict Breakdown', vi: 'Phân tích phán định' },
  'reports.topAttacks': { en: 'Top Attack Types', vi: 'Loại tấn công hàng đầu' },
  'reports.protocolDist': { en: 'Protocol Distribution', vi: 'Phân bố giao thức' },
  
  // Settings
  'settings.title': { en: 'Settings', vi: 'Cài đặt' },
  'settings.general': { en: 'General', vi: 'Chung' },
  'settings.blacklist': { en: 'Blacklist', vi: 'Danh sách đen' },
  'settings.whitelist': { en: 'Whitelist', vi: 'Danh sách trắng' },
  'settings.help': { en: 'Help', vi: 'Hướng dẫn' },
  'settings.theme': { en: 'Theme', vi: 'Giao diện' },
  'settings.light': { en: 'Light', vi: 'Sáng' },
  'settings.dark': { en: 'Dark', vi: 'Tối' },
  'settings.lightDesc': { en: 'Light interface', vi: 'Giao diện màu trắng' },
  'settings.darkDesc': { en: 'Dark interface', vi: 'Giao diện màu đen' },
  'settings.timezone': { en: 'Timezone', vi: 'Múi giờ' },
  'settings.timezoneHint': { en: 'Dashboard time will follow this timezone', vi: 'Thời gian hiển thị trên dashboard sẽ theo múi giờ này' },
  'settings.language': { en: 'Language', vi: 'Ngôn ngữ' },
  'settings.english': { en: 'English', vi: 'Tiếng Anh' },
  'settings.vietnamese': { en: 'Vietnamese', vi: 'Tiếng Việt' },
  'settings.sysInfo': { en: 'System Information', vi: 'Thông tin hệ thống' },
  'settings.version': { en: 'Version', vi: 'Phiên bản' },
  'settings.engine': { en: 'Engine', vi: 'Engine' },
  
  // Blacklist/Whitelist
  'list.blacklistTitle': { en: 'Blacklist', vi: 'Danh sách đen' },
  'list.whitelistTitle': { en: 'Whitelist', vi: 'Danh sách trắng' },
  'list.blacklistDesc': { en: 'IPs/Domains in this list will be blocked automatically', vi: 'Các IP/Domain trong danh sách sẽ bị chặn tự động' },
  'list.whitelistDesc': { en: 'IPs/Domains in this list will be trusted and alerts ignored', vi: 'Các IP/Domain trong danh sách sẽ được tin tưởng và bỏ qua cảnh báo' },
  'list.ipOrDomain': { en: 'IP or Domain...', vi: 'IP hoặc Domain...' },
  'list.note': { en: 'Note...', vi: 'Ghi chú...' },
  'list.add': { en: 'Add', vi: 'Thêm' },
  'list.value': { en: 'Value', vi: 'Giá trị' },
  'list.type': { en: 'Type', vi: 'Loại' },
  'list.actions': { en: 'Actions', vi: 'Hành động' },
  'list.empty': { en: 'List is empty', vi: 'Danh sách trống' },
  'list.total': { en: 'Total', vi: 'Tổng cộng' },
  'list.items': { en: 'items', vi: 'mục' },
  
  // Help Section
  'help.title': { en: 'SOC Dashboard User Guide', vi: 'Hướng dẫn sử dụng SOC Dashboard' },
  'help.tabOverview': { en: 'Tab Overview', vi: 'Tổng quan các tab' },
  'help.overviewDesc': { en: 'Overview of security events, traffic charts and attack distribution.', vi: 'Tổng quan các sự kiện bảo mật, biểu đồ traffic và phân bố tấn công.' },
  'help.eventsDesc': { en: 'Detailed list of all events with advanced filters.', vi: 'Danh sách chi tiết tất cả các sự kiện với bộ lọc nâng cao.' },
  'help.threatsDesc': { en: 'Threat analysis, attack sources and malicious signatures.', vi: 'Phân tích mối đe dọa, nguồn tấn công và chữ ký độc hại.' },
  'help.reportsDesc': { en: 'Summary reports and trend analysis.', vi: 'Báo cáo tổng hợp và phân tích xu hướng.' },
  'help.features': { en: 'Key Features', vi: 'Các tính năng chính' },
  'help.verdictMeaning': { en: 'Verdict Meanings', vi: 'Ý nghĩa các mức Verdict' },
  'help.alertDesc': { en: 'Critical alert, needs immediate action', vi: 'Cảnh báo nghiêm trọng, cần xử lý ngay' },
  'help.suspiciousDesc': { en: 'Suspicious, needs monitoring', vi: 'Đáng ngờ, cần theo dõi' },
  'help.falsePositiveDesc': { en: 'False alert, not dangerous', vi: 'Cảnh báo sai, không nguy hiểm' },
  'help.benignDesc': { en: 'Normal activity', vi: 'Hoạt động bình thường' },
  'help.devTeam': { en: 'Development Team', vi: 'Đội ngũ phát triển' },
  
  // Footer
  'footer.version': { en: 'SOC Dashboard v2.0 — C1NE.03 Team — Cybersecurity K28 — Duy Tan University', vi: 'SOC Dashboard v2.0 — Nhóm C1NE.03 — An ninh mạng K28 — Đại học Duy Tân' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem('soc-language') as Language;
    return stored || 'en';
  });

  useEffect(() => {
    localStorage.setItem('soc-language', language);
  }, [language]);

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) return key;
    return translation[language] || translation.en || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
