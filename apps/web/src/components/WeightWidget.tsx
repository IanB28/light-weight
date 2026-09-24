import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion, type PanInfo } from 'motion/react';
import { Scale, Target } from 'lucide-react';
import { displayWeight } from '../lib/weight-units.js';

export const CANONICAL_MIN_BODYWEIGHT_KG = 20;
export const CANONICAL_MAX_BODYWEIGHT_KG = 300;

export function getBodyweightBounds(units: 'metric' | 'imperial'): { min: number; max: number } {
  if (units === 'imperial') {
    return {
      min: displayWeight(CANONICAL_MIN_BODYWEIGHT_KG, 'imperial'),
      max: displayWeight(CANONICAL_MAX_BODYWEIGHT_KG, 'imperial')
    };
  }
  return {
    min: CANONICAL_MIN_BODYWEIGHT_KG,
    max: CANONICAL_MAX_BODYWEIGHT_KG
  };
}

export interface WeightWidgetProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit: 'kg' | 'lb';
  label: string;
  locale?: string;
  icon?: 'scale' | 'target';
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
 * Formats a weight value according to locale:
 * Whole numbers render without trailing .0 (e.g. 72 -> "72").
 * Decimal numbers render with 1 decimal digit respecting locale (e.g. 72.5 -> "72,5" in es, "72.5" in en).
 */
export function formatWeightValue(value: number, locale = 'es'): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(rounded);
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
  min: propMin,
  max: propMax,
  step = 0.1,
  unit,
  label,
  locale = 'es',
  icon = 'scale',
  onChange,
  disabled = false,
  className = ''
}) => {
  const inputId = useId();
  const shouldReduceMotion = useReducedMotion();
  const pixelsPerUnit = 80; // ~8px per 0.1 unit

  const defaultBounds = useMemo(() => {
    return getBodyweightBounds(unit === 'lb' ? 'imperial' : 'metric');
  }, [unit]);

  const min = propMin ?? defaultBounds.min;
  const max = propMax ?? defaultBounds.max;

  // Safe normalized initial value
  const safeValue = clampWeightValue(snapWeightValue(value, step), min, max);

  const x = useMotionValue(-safeValue * pixelsPerUnit);
  const springConfig = shouldReduceMotion
    ? { stiffness: 1000, damping: 100, mass: 0.1 }
    : { stiffness: 450, damping: 45, mass: 0.8 };
  const springX = useSpring(x, springConfig);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(formatWeightValue(safeValue, locale));
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
    setEditText(formatWeightValue(safeValue, locale));
  }, [safeValue, pixelsPerUnit, x, isEditing, locale]);

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
      setEditText(formatWeightValue(safeValue, locale));
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
      aria-valuetext={`${formatWeightValue(safeValue, locale)} ${unit}`}
      onKeyDown={handleKeyDown}
      className={`relative flex flex-col items-center rounded-ui-2xl border border-border-subtle bg-surface-elevated/50 p-4 sm:p-5 shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        disabled ? 'pointer-events-none opacity-50' : ''
      } ${className}`}
    >
      {/* Scale Faceplate Top Header */}
      <div className="flex w-full items-center justify-between pb-1 px-1">
        <div className="flex items-center gap-1.5">
          {icon === 'target' ? (
            <Target className="size-3.5 text-accent stroke-[2.5]" />
          ) : (
            <Scale className="size-3.5 text-accent stroke-[2.5]" />
          )}
          <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-text-muted">
            {label}
          </span>
        </div>
        <span className="rounded-full border border-border-subtle bg-surface-input px-2 py-0.5 font-sans text-[10px] font-semibold text-text-muted tabular-nums">
          ±{step} {unit}
        </span>
      </div>

      {/* Central Value (Digital Measurement Readout) */}
      <div className="my-2 flex min-h-16 items-center justify-center">
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
                  setEditText(formatWeightValue(safeValue, locale));
                  setIsEditing(false);
                }
              }}
              className="w-36 border-b-2 border-accent bg-transparent pb-0.5 text-center font-sans text-5xl sm:text-6xl font-extrabold text-text-primary tabular-nums tracking-tight outline-none"
            />
            <span className="font-sans text-lg sm:text-xl font-bold text-text-muted">{unit}</span>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditText(formatWeightValue(safeValue, locale));
              setIsEditing(true);
            }}
            title="Toca para editar con teclado"
            className="group flex items-baseline justify-center gap-1.5 rounded-lg px-2 py-0.5 transition-transform active:scale-95 cursor-pointer"
          >
            <span className="font-sans text-5xl sm:text-6xl font-extrabold text-text-primary tabular-nums tracking-tight group-hover:text-accent transition-colors">
              {formatWeightValue(safeValue, locale)}
            </span>
            <span className="font-sans text-lg sm:text-xl font-bold text-text-muted">{unit}</span>
          </button>
        )}
      </div>

      {/* Measurement Track / Dial Aperture */}
      <div className="relative h-20 w-full overflow-hidden rounded-ui-xl border border-border-subtle/70 bg-surface-input/70 shadow-inner select-none touch-pan-y">
        {/* Edge Gradient Fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-surface-elevated via-surface-elevated/70 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-surface-elevated via-surface-elevated/70 to-transparent" />

        {/* Precision Measurement Reticle / Needle Indicator */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center">
          {/* Top alignment notch */}
          <div className="w-0 h-0 border-x-[4px] border-x-transparent border-t-[5px] border-t-accent shadow-[0_2px_8px_var(--accent-glow)]" />
          {/* Center bead */}
          <div className="size-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)] -mt-0.5" />
          {/* Vertical hairline */}
          <div className="h-6 w-[2px] rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" />
        </div>

        {/* Sliding Ticks Measurement Base */}
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
                  <span className="mb-1 font-sans text-[11px] font-bold text-text-secondary tabular-nums select-none">
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
