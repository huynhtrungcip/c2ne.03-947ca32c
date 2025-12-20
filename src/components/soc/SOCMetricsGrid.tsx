import { SOCMetrics } from '@/types/soc';

interface SOCMetricsGridProps {
  metrics: SOCMetrics;
}

export const SOCMetricsGrid = ({ metrics }: SOCMetricsGridProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
      <div className="soc-metric">
        <div className="soc-metric-label">Events Buffered</div>
        <div className="soc-metric-value">{metrics.totalEvents.toLocaleString()}</div>
      </div>
      
      <div className="soc-metric" style={{ borderLeftColor: '#ef4444' }}>
        <div className="soc-metric-label">Critical Alerts</div>
        <div className="soc-metric-value">{metrics.criticalAlerts}</div>
        <div className="soc-metric-delta text-red-500">{metrics.alertRate.toFixed(1)}%</div>
      </div>
      
      <div className="soc-metric" style={{ borderLeftColor: '#eab308' }}>
        <div className="soc-metric-label">Suspicious Flows</div>
        <div className="soc-metric-value">{metrics.suspicious}</div>
      </div>
      
      <div className="soc-metric" style={{ borderLeftColor: '#22c55e' }}>
        <div className="soc-metric-label">False Positives</div>
        <div className="soc-metric-value">{metrics.falsePositives}</div>
      </div>
      
      <div className="soc-metric">
        <div className="soc-metric-label">Unique Sources</div>
        <div className="soc-metric-value">{metrics.uniqueSources.toLocaleString()}</div>
      </div>
    </div>
  );
};
