import React, { useState, useRef, useMemo } from 'react';

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
  height = 140,
  unit = 'kg',
  color = '#007aff',
  goal = null,
  invertY = false
}) => {
  const [activePoint, setActivePoint] = useState<ChartPoint | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    if (!points || points.length === 0) return [];
    return [...points].sort((a, b) => a.t - b.t);
  }, [points]);

  if (!sorted || sorted.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-zinc-600 font-normal bg-black/20 rounded-2xl border border-white/[0.03]"
      >
        Sin registros suficientes para graficar
      </div>
    );
  }

  const W = 360;
  const H = height;
  const padding = { top: 12, bottom: 24, left: 34, right: 28 };

  // Calculate min and max
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
  minY -= yRange * 0.12;
  maxY += yRange * 0.12;

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

  // 3 horizontal guide lines: min, mid, max
  const midYVal = minY + (maxY - minY) * 0.5;
  const gridSteps = [maxY - yRange * 0.15, midYVal, minY + yRange * 0.15];

  // Month labels at the bottom: 3 evenly spaced month marks
  const monthLabels = useMemo(() => {
    const d0 = new Date(t0);
    const d1 = new Date(t1);
    const m0 = d0.toLocaleDateString('es-ES', { month: 'short' });
    const mMid = new Date((t0 + t1) / 2).toLocaleDateString('es-ES', { month: 'short' });
    const m1 = d1.toLocaleDateString('es-ES', { month: 'short' });

    // Capitalize first letter
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
    return [
      { text: cap(m0), x: padding.left + 30 },
      { text: cap(mMid), x: W / 2 },
      { text: cap(m1), x: W - padding.right - 20 }
    ];
  }, [t0, t1, W, padding]);

  const latestPoint = sorted[sorted.length - 1];

  return (
    <div className="relative w-full select-none" ref={containerRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="openGymChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="60%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Dotted Gridlines with left labels */}
        {gridSteps.map((val, idx) => {
          const y = getY(val);
          const formatted = (Math.round(val * 2) / 2).toString().replace('.', ',');
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={W - padding.right}
                y2={y}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="1"
                strokeDasharray="1 4"
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="#71717A"
                className="font-normal"
              >
                {formatted}
              </text>
            </g>
          );
        })}

        {/* Dashed Yellow Goal Line with label on right */}
        {goal !== null && (
          <g>
            <line
              x1={padding.left}
              y1={getY(goal)}
              x2={W - padding.right}
              y2={getY(goal)}
              stroke="#FACC15"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text
              x={W - padding.right + 4}
              y={getY(goal) + 3}
              textAnchor="start"
              fontSize="10"
              fill="#FACC15"
              fontWeight="bold"
            >
              {goal.toString().replace('.', ',')}
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
            fill="url(#openGymChartGrad)"
          />
        )}

        {/* Continuous Line Curve */}
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
            strokeWidth="2.5"
            strokeDasharray="3 3"
          />
        )}

        {/* Latest Point: Distinctive Blue Dot with White ring (openGym style) */}
        {latestPoint && (
          <g>
            <circle
              cx={getX(latestPoint.t)}
              cy={getY(latestPoint.y)}
              r="4.5"
              fill={color}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Interactive hover/touch dots */}
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
              {isSelected && (
                <circle
                  cx={cx}
                  cy={cy}
                  r="6"
                  fill="#FFFFFF"
                  stroke={color}
                  strokeWidth="2"
                />
              )}
              {/* Invisible touch target */}
              <circle
                cx={cx}
                cy={cy}
                r="18"
                fill="transparent"
              />
            </g>
          );
        })}

        {/* X-axis month labels */}
        {monthLabels.map((m, i) => (
          <text
            key={i}
            x={m.x}
            y={H - 4}
            textAnchor="middle"
            fontSize="10"
            fill="#71717A"
            className="font-normal"
          >
            {m.text}
          </text>
        ))}
      </svg>

      {/* Tooltip Card when tapped */}
      {activePoint && (
        <div className="mt-1 p-2 px-3 rounded-xl bg-zinc-900/90 border border-white/[0.08] text-xs flex items-center justify-between shadow-lg backdrop-blur-md">
          <span className="text-[10px] text-zinc-400">
            {activePoint.dateStr || new Date(activePoint.t).toLocaleDateString('es-ES')}
          </span>
          <span className="font-bold text-white text-xs">
            {activePoint.y.toString().replace('.', ',')} {unit}
          </span>
        </div>
      )}
    </div>
  );
};
