"use client";

import { useEffect, useState, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface SuccessCardProps {
  title: string;
  description?: string;
  /** Auto-close delay in ms. Default: 5000 */
  duration?: number;
  onClose: () => void;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  color?: 'green' | 'navy' | 'amber';
}

const COLORS = {
  green: { bg: 'rgba(5,150,105,0.1)',   icon: '#059669',          bar: '#059669'          },
  navy:  { bg: 'rgba(10,26,77,0.08)',   icon: 'hsl(221,72%,22%)', bar: 'hsl(221,72%,22%)' },
  amber: { bg: 'rgba(251,191,36,0.12)', icon: 'hsl(43,85%,42%)',  bar: 'hsl(43,85%,50%)'  },
};

export function SuccessCard({
  title, description, duration = 5000, onClose, children, icon, color = 'green',
}: SuccessCardProps) {
  const [progress,  setProgress]  = useState(100);
  const [remaining, setRemaining] = useState(Math.ceil(duration / 1000));
  const c = COLORS[color];

  // Store onClose in a ref so the timer effect never needs it as a dependency.
  // Without this, every new inline arrow function passed as onClose would restart
  // the timer — and calling onClose inside setProgress (a state updater) triggers
  // React's "cannot update component while rendering" error.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const interval = 50;
    const step     = (interval / duration) * 100;
    let   elapsed  = 0;

    const timer = setInterval(() => {
      elapsed += interval;
      setRemaining(Math.max(0, Math.ceil((duration - elapsed) / 1000)));
      setProgress(prev => {
        const next = prev - step;
        if (next <= 0) {
          clearInterval(timer);
          // Defer via setTimeout so onClose always fires outside any React
          // render or state-update cycle — fixes "setState during render" errors.
          setTimeout(() => onCloseRef.current(), 0);
          return 0;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  // Only duration matters — onClose is accessed via ref, so it's safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.2s ease-out' }}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300"
        style={{ fontFamily: "'DM Sans',sans-serif" }}>

        {/* Shrinking progress bar */}
        <div className="h-1 w-full bg-slate-100">
          <div className="h-1 transition-none"
            style={{ width: `${progress}%`, background: c.bar }} />
        </div>

        <div className="px-8 py-7 text-center space-y-4">

          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: c.bg }}>
            {icon ?? <CheckCircle2 size={32} style={{ color: c.icon }} />}
          </div>

          {/* Text */}
          <div className="space-y-1.5">
            <h3 className="text-xl font-bold text-slate-900"
              style={{ fontFamily: "'Playfair Display',serif" }}>
              {title}
            </h3>
            {description && (
              <p className="text-slate-500 text-sm font-medium leading-relaxed">{description}</p>
            )}
          </div>

          {children}

          {/* Manual dismiss */}
          <button
            onClick={() => onCloseRef.current()}
            className="w-full h-11 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg,hsl(221,72%,22%),hsl(221,60%,32%))' }}>
            OK
          </button>

          <p className="text-slate-300 text-xs">Closes in {remaining}s</p>
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}