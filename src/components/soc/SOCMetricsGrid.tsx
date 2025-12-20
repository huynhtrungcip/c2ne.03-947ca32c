import { Shield, Activity, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import { SOCMetrics } from '@/types/soc';

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'critical' | 'warning' | 'success' | 'info';
}

const MetricCard = ({ label, value, delta, icon, variant = 'default' }: MetricCardProps) => {
  const borderColors = {
    default: 'border-l-primary',
    critical: 'border-l-severity-critical',
    warning: 'border-l-severity-medium',
    success: 'border-l-severity-low',
    info: 'border-l-severity-info'
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-4 relative overflow-hidden border-l-4 ${borderColors[variant]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            {label}
          </p>
          <p className="text-3xl font-bold font-mono text-foreground">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {delta && (
            <p className={`text-sm font-medium mt-1 ${variant === 'critical' ? 'text-severity-critical' : 'text-muted-foreground'}`}>
              {delta}
            </p>
          )}
        </div>
        <div className={`p-2 rounded-lg bg-secondary/50 ${variant === 'critical' ? 'text-severity-critical' : 'text-primary'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

interface SOCMetricsGridProps {
  metrics: SOCMetrics;
}

export const SOCMetricsGrid = ({ metrics }: SOCMetricsGridProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <MetricCard
        label="Events Buffered"
        value={metrics.totalEvents}
        icon={<Activity className="w-5 h-5" />}
        variant="info"
      />
      <MetricCard
        label="Critical Alerts"
        value={metrics.criticalAlerts}
        delta={`${metrics.alertRate.toFixed(1)}%`}
        icon={<AlertTriangle className="w-5 h-5" />}
        variant="critical"
      />
      <MetricCard
        label="Suspicious"
        value={metrics.suspicious}
        icon={<Shield className="w-5 h-5" />}
        variant="warning"
      />
      <MetricCard
        label="False Positives"
        value={metrics.falsePositives}
        icon={<CheckCircle className="w-5 h-5" />}
        variant="success"
      />
      <MetricCard
        label="Unique Sources"
        value={metrics.uniqueSources}
        icon={<Users className="w-5 h-5" />}
        variant="default"
      />
    </div>
  );
};
