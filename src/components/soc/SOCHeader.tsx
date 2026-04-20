import { useEffect, useRef, useState } from 'react';

interface SOCHeaderProps {
  isLive: boolean;
  timeRange: string;
}

export const SOCHeader = ({ isLive, timeRange }: SOCHeaderProps) => {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  const now = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  useEffect(() => {
    const SCROLL_DELTA = 6;
    const TOP_ZONE = 60;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const diff = currentY - lastScrollY.current;

      if (currentY < 10) {
        setVisible(true);
      } else if (Math.abs(diff) > SCROLL_DELTA) {
        setVisible(diff < 0); // scrolling up -> show
      }
      lastScrollY.current = currentY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < TOP_ZONE) setVisible(true);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      className={`sticky top-0 z-40 border-b border-border pb-3 mb-5 bg-background/85 backdrop-blur-md transition-transform duration-250 ease-out ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
      style={{ transitionDuration: '250ms' }}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pt-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-[0.08em] text-foreground">
            Security Operations Center
          </h1>
          <p className="text-[0.82rem] text-muted-foreground mt-1">
            C1NE.03 Hybrid NIDS Engine — Zeek / Suricata / AI Correlation Pipeline
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className={`live-badge ${isLive ? 'live-badge-on' : 'live-badge-off'}`}>
            {isLive ? 'SYSTEM ONLINE' : 'LIVE VIEW PAUSED'}
          </span>
          <span className="text-[0.75rem] text-muted-foreground">
            Local Time: {now} | Range: {timeRange}
          </span>
        </div>
      </div>
    </div>
  );
};
