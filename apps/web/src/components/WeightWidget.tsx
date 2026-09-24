import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion, type PanInfo } from 'motion/react';

export interface WeightWidgetProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: 'kg' | 'lb';
  label: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Snaps a value to the nearest step increment with safe floating-point precision.
 */
export function snapWeightValue(value: number, step = 0.1): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.round(1 / step);
  return Math.round(value * factor) / factor;
}

/**
 * Clamps a value within min and max bounds.
 */
export function clampWeightValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Formats a weight value:
 * Whole numbers render without trailing .0 (e.g. 72 -> "72").
 * Decimal numbers render with decimal digits (e.g. 72.5 -> "72.5").
 */
export function formatWeightValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Parses user input into a number, normalizing commas to periods.
 */
export function parseWeightInput(input: string): number | null {
  if (!input || typeof input !== 'string') return null;
  const normalized = input.trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export const WeightWidget: React.FC<WeightWidgetProps> = ({
  value,
  min,
  max,
  step = 0.1,
  unit,
  label,
  onChange,
  disabled = false,
  className = ''
}) => {
  const inputId = useId();
  const shouldReduceMotion = useReducedMotion();
  const pixelsPerUnit = 80; // ~8px per 0.1 unit

  // Safe normalized initial value
  const safeValue = clampWeightValue(snapWeightValue(value, step), min, max);

  const x = useMotionValue(-safeValue * pixelsPerUnit);
  const springConfig = shouldReduceMotion
    ? { stiffness: 1000, damping: 100, mass: 0.1 }
    : { stiffness: 450, damping: 45, mass: 0.8 };
  const springX = useSpring(x, springConfig);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(formatWeightValue(safeValue));
  const isDraggingRef = useRef(false);
  const dragStartX = useRef(x.get());
  const lastEmittedValue = useRef(safeValue);

  // Synchronize when controlled `value` changes from parent (e.g. switching tabs log <-> goal or unit switch)
  useEffect(() => {
    if (isDraggingRef.current || isEditing) return;
    const targetX = -safeValue * pixelsPerUnit;
    if (Math.abs(x.get() - targetX) > 0.5) {
      x.set(targetX);
    }
    lastEmittedValue.current = safeValue;
    setEditText(formatWeightValue(safeValue));
  }, [safeValue, pixelsPerUnit, x, isEditing]);

  // Subscribe to spring motion to update value during gesture
  useEffect(() => {
    const unsubscribe = springX.on('change', (currentX) => {
      if (!isDraggingRef.current) return;
      const rawVal = clampWeightValue(-currentX / pixelsPerUnit, min, max);
      const snapped = snapWeightValue(rawVal, step);
      if (snapped !== lastEmittedValue.current) {
        lastEmittedValue.current = snapped;
        onChange(snapped);
      }
    });
    return () => unsubscribe();
  }, [springX, pixelsPerUnit, min, max, step, onChange]);

  const handlePanStart = () => {
    if (disabled || isEditing) return;
    isDraggingRef.current = true;
    dragStartX.current = x.get();
  };

  const handlePan = (_: unknown, info: PanInfo) => {
    if (disabled || isEditing) return;
    // Continuous drag: moving finger left (negative offset) increases weight (-x increases)
    const newX = dragStartX.current + info.offset.x;
    const minX = -max * pixelsPerUnit;
    const maxX = -min * pixelsPerUnit;
    x.set(Math.max(minX, Math.min(maxX, newX)));
  };

  const handlePanEnd = (_: unknown, info: PanInfo) => {
    if (disabled || isEditing) return;
    isDraggingRef.current = false;

    // Apply momentum with damping, then snap to nearest step
    const currentVal = -x.get() / pixelsPerUnit;
    const projectedVal = shouldReduceMotion ? currentVal : currentVal - (info.velocity.x * 0.0008);
    const clampedVal = clampWeightValue(projectedVal, min, max);
    const targetVal = snapWeightValue(clampedVal, step);

    lastEmittedValue.current = targetVal;
    onChange(targetVal);
    x.set(-targetVal * pixelsPerUnit);
  };

  const commitDirectInput = () => {
    const parsed = parseWeightInput(editText);
    if (parsed !== null && parsed > 0) {
      const clamped = clampWeightValue(snapWeightValue(parsed, step), min, max);
      onChange(clamped);
      x.set(-clamped * pixelsPerUnit);
      lastEmittedValue.current = clamped;
    } else {
      setEditText(formatWeightValue(safeValue));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || isEditing) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = clampWeightValue(snapWeightValue(safeValue - step, step), min, max);
      onChange(next);
      x.set(-next * pixelsPerUnit);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = clampWeightValue(snapWeightValue(safeValue + step, step), min, max);
      onChange(next);
      x.set(-next * pixelsPerUnit);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      const next = clampWeightValue(snapWeightValue(safeValue - 1.0, step), min, max);
      onChange(next);
      x.set(-next * pixelsPerUnit);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      const next = clampWeightValue(snapWeightValue(safeValue + 1.0, step), min, max);
      onChange(next);
      x.set(-next * pixelsPerUnit);
    } else if (e.key === 'Enter') {
      setIsEditing(true);
    }
  };

  // Virtual window around current value (± 3.5 units = 70 subdivisions)
  const ticks = useMemo(() => {
    const buffer = 3.5;
    const start = Math.max(min, Math.floor((safeValue - buffer) * 10) / 10);
    const end = Math.min(max, Math.ceil((safeValue + buffer) * 10) / 10);
    const items: Array<{ val: number; isInteger: boolean; isHalf: boolean }> = [];

    // Step by 0.1
    const totalSteps = Math.round((end - start) * 10);
    for (let s = 0; s <= totalSteps; s++) {
      const tickVal = Math.round((start + s * 0.1) * 10) / 10;
      const isInteger = Math.abs(tickVal - Math.round(tickVal)) < 0.001;
      const isHalf = !isInteger && Math.abs((tickVal * 2) - Math.round(tickVal * 2)) < 0.001;
      items.push({ val: tickVal, isInteger, isHalf });
    }
    return items;
  }, [safeValue, min, max]);

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={safeValue}
      aria-valuetext={`${formatWeightValue(safeValue)} ${unit}`}
      onKeyDown={handleKeyDown}
      className={`relative flex flex-col items-center rounded-2xl border border-border-subtle bg-surface-input/60 p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        disabled ? 'pointer-events-none opacity-50' : ''
      } ${className}`}
    >
      {/* Label */}
      <span className="text-xs font-mono font-bold uppercase tracking-wider text-text-muted">
        {label}
      </span>

      {/* Central Value (Interactive Precision Entry) */}
      <div className="my-2 flex min-h-14 items-center justify-center">
        {isEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitDirectInput();
            }}
            className="flex items-baseline justify-center gap-1.5"
          >
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value.replace(/[^0-9.,]/g, ''))}
              onBlur={commitDirectInput}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setEditText(formatWeightValue(safeValue));
                  setIsEditing(false);
                }
              }}
              className="w-32 border-b-2 border-accent bg-transparent pb-0.5 text-center font-mono text-4xl sm:text-5xl font-black text-text-primary tabular-nums tracking-tight outline-none"
            />
            <span className="font-mono text-lg font-bold text-text-muted">{unit}</span>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditText(formatWeightValue(safeValue));
              setIsEditing(true);
            }}
            title="Toca para editar con teclado"
            className="group flex items-baseline justify-center gap-1.5 rounded-lg px-2 py-0.5 transition-transform active:scale-95 cursor-pointer"
          >
            <span className="font-mono text-4xl sm:text-5xl font-black text-text-primary tabular-nums tracking-tight group-hover:text-accent transition-colors">
              {formatWeightValue(safeValue)}
            </span>
            <span className="font-mono text-lg font-bold text-text-muted">{unit}</span>
          </button>
        )}
      </div>

      {/* Dial / Ruler Surface */}
      <div className="relative h-20 w-full overflow-hidden rounded-xl bg-surface-elevated/40 select-none touch-pan-y">
        {/* Edge Gradient Fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-surface-elevated to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-surface-elevated to-transparent" />

        {/* Center Pointer Indicator */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center">
          <div className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" />
          <div className="h-6 w-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" />
        </div>

        {/* Sliding Ticks Container */}
        <motion.div
          onPanStart={handlePanStart}
          onPan={handlePan}
          onPanEnd={handlePanEnd}
          className="absolute inset-y-0 flex cursor-grab items-end active:cursor-grabbing"
          style={{ x: springX, left: '50%' }}
        >
          {ticks.map(({ val, isInteger, isHalf }) => {
            const itemX = val * pixelsPerUnit;
            return (
              <div
                key={val}
                className="absolute bottom-0 flex flex-col items-center"
                style={{
                  left: itemX,
                  transform: 'translateX(-50%)'
                }}
              >
                {/* Whole Number Numeric Label */}
                {isInteger && (
                  <span className="mb-1 font-mono text-[11px] font-bold text-text-secondary select-none">
                    {Math.round(val)}
                  </span>
                )}

                {/* Tick Mark */}
                <div
                  className={`rounded-full transition-colors ${
                    isInteger
                      ? 'h-6 w-[2px] bg-text-secondary'
                      : isHalf
                        ? 'h-4 w-[1.5px] bg-text-muted/70'
                        : 'h-2.5 w-[1px] bg-text-muted/35'
                  }`}
                />
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
};
