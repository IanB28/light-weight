import React, { useState, useRef } from 'react';

export interface ChartPoint {
  t: number;        // timestamp in ms
  y: number;        // value (e.g. weight, 1RM, RIR)
  dateStr?: string; // readable date
  label?: string;   // optional custom label or note
}

interface LineChartProps {
  points: ChartPoint[];
  height?: number;
  unit?: string;
  color?: string;
  goal?: number | null;
  invertY?: boolean; // for RIR where lower is harder
}

export const LineChart: React.FC<LineChartProps> = ({
  points,
  height = 160,
  unit = 'kg',
  color = '#10B981', // Emerald 500
  goal = null,
  invertY = false
}) => {
  const [activePoint, setActivePoint] = useState<ChartPoint | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!points || points.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-zinc-500 font-mono bg-black/30 rounded-2xl border border-white/[0.04]"
      >
        Sin registros suficientes para graficar
      </div>
    );
  }

  const W = 360;
  const H = height;
  const padding = { top: 16, bottom: 26, left: 36, right: 16 };

  // Calculate min and max
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const ys = sorted.map((p) => p.y);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  if (goal !== null && Number.isFinite(goal)) {
    minY = Math.min(minY, goal);
    maxY = Math.max(maxY, goal);
  }

  if (minY === maxY) {
    minY -= 2;
    maxY += 2;
  }

  const yRange = maxY - minY;
  minY -= yRange * 0.1;
  maxY += yRange * 0.1;

  const t0 = sorted[0].t;
  const t1 = sorted[sorted.length - 1].t === t0 ? t0 + 86400000 : sorted[sorted.length - 1].t;

  const getX = (t: number) => {
    if (t1 === t0) return (padding.left + W - padding.right) / 2;
    return padding.left + ((t - t0) / (t1 - t0)) * (W - padding.left - padding.right);
  };

  const getY = (y: number) => {
    const f = (y - minY) / (maxY - minY);
    return padding.top + (invertY ? f : 1 - f) * (H - padding.top - padding.bottom);
  };

  const pathPoints = sorted.map((p) => `${getX(p.t).toFixed(1)},${getY(p.y).toFixed(1)}`).join(' ');

  // Generate 3 horizontal guide lines
  const gridSteps = [minY, minY + (maxY - minY) * 0.5, maxY];

  return (
    <div className="relative w-full select-none" ref={containerRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {gridSteps.map((val, idx) => {
          const y = getY(val);
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={W - padding.right}
                y2={y}
                stroke="rgba(255, 255, 255, 0.06)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="#71717A"
                className="font-mono tabular-nums"
              >
                {Math.round(val * 10) / 10}
              </text>
            </g>
          );
        })}

        {/* Goal line (dotted gold/amber) */}
        {goal !== null && (
          <g>
            <line
              x1={padding.left}
              y1={getY(goal)}
              x2={W - padding.right}
              y2={getY(goal)}
              stroke="#F59E0B"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text
              x={W - padding.right}
              y={getY(goal) - 4}
              textAnchor="end"
              fontSize="9"
              fill="#F59E0B"
              className="font-mono font-bold"
            >
              Meta {goal} {unit}
            </text>
          </g>
        )}

        {/* Shaded Area under curve */}
        {sorted.length > 1 && (
          <polygon
            points={`
              ${getX(sorted[0].t).toFixed(1)},${H - padding.bottom}
              ${pathPoints}
              ${getX(sorted[sorted.length - 1].t).toFixed(1)},${H - padding.bottom}
            `}
            fill="url(#chartGrad)"
          />
        )}

        {/* Line Curve */}
        {sorted.length > 1 ? (
          <polyline
            points={pathPoints}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <line
            x1={padding.left}
            y1={getY(sorted[0].y)}
            x2={W - padding.right}
            y2={getY(sorted[0].y)}
            stroke={color}
            strokeWidth="2"
            strokeDasharray="3 3"
          />
        )}

        {/* Dots */}
        {sorted.map((p, idx) => {
          const cx = getX(p.t);
          const cy = getY(p.y);
          const isSelected = activePoint === p;
          return (
            <g
              key={idx}
              className="cursor-pointer"
              onClick={() => setActivePoint(isSelected ? null : p)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 6 : 4}
                fill={isSelected ? '#FFFFFF' : color}
                stroke="#000000"
                strokeWidth="2"
                className="transition-all"
              />
              {/* Invisible large touch target */}
              <circle
                cx={cx}
                cy={cy}
                r="16"
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip Card */}
      {activePoint && (
        <div className="mt-2 p-2 px-3 rounded-xl bg-zinc-900 border border-white/[0.1] text-xs flex items-center justify-between shadow-lg animate-in fade-in duration-150">
          <div>
            <span className="text-[10px] text-zinc-400 font-mono block">
              {activePoint.dateStr || new Date(activePoint.t).toLocaleDateString('es-ES')}
            </span>
            {activePoint.label && (
              <span className="text-zinc-300 font-medium text-[11px]">{activePoint.label}</span>
            )}
          </div>
          <div className="text-right">
            <span className="font-mono font-bold text-white text-sm">
              {activePoint.y} {unit}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
