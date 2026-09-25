import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type PanInfo,
  type MotionValue
} from 'motion/react';
import { Scale, Target } from 'lucide-react';
import { displayWeight } from '../lib/weight-units.js';

export const MIN_TECHNICAL_WEIGHT_KG = 1;
export const MAX_TECHNICAL_WEIGHT_KG = 500;

export function getBodyweightBounds(units: 'metric' | 'imperial'): { min: number; max: number } {
  if (units === 'imperial') {
    return {
      min: displayWeight(MIN_TECHNICAL_WEIGHT_KG, 'imperial'),
      max: displayWeight(MAX_TECHNICAL_WEIGHT_KG, 'imperial')
    };
  }
  return {
    min: MIN_TECHNICAL_WEIGHT_KG,
    max: MAX_TECHNICAL_WEIGHT_KG
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

/**
 * Direct drag calculation from pointer offset to snapped weight.
 * Separates data path from spring visual smoothing.
 */
export function calculateDragWeight(
  startX: number,
  offsetX: number,
  pixelsPerUnit: number,
  min: number,
  max: number,
  step = 0.1
): number {
  const newX = startX + offsetX;
  const minX = -max * pixelsPerUnit;
  const maxX = -min * pixelsPerUnit;
  const clampedX = Math.max(minX, Math.min(maxX, newX));
  const rawWeight = -clampedX / pixelsPerUnit;
  return snapWeightValue(clampWeightValue(rawWeight, min, max), step);
}

interface DialTickItemProps {
  val: number;
  isInteger: boolean;
  isHalf: boolean;
  pixelsPerUnit: number;
  scrollX: MotionValue<number>;
  shouldReduceMotion: boolean | null;
}

export const DialTickItem: React.FC<DialTickItemProps> = React.memo(({
  val,
  isInteger,
  isHalf,
  pixelsPerUnit,
  scrollX,
  shouldReduceMotion
}) => {
  const itemX = val * pixelsPerUnit;
  // Distance from center
  const distance = useTransform(scrollX, (s: number) => Math.abs(s + itemX));
  const signedOffset = useTransform(scrollX, (s: number) => s + itemX);

  // Curved vertical offset (arc trajectory: downward offset as distance increases)
  const yOffset = useTransform(
    distance,
    [0, pixelsPerUnit * 0.5, pixelsPerUnit, pixelsPerUnit * 1.5, pixelsPerUnit * 2, pixelsPerUnit * 2.5],
    [0, 5, 22, 50, 88, 136]
  );

  // Rotation: tilts outward/inward along arc
  const rotate = useTransform(signedOffset, (d: number) => {
    return (d / pixelsPerUnit) * 11.0; // degrees
  });

  // Opacity: center strongest, fading outward
  const opacity = useTransform(
    distance,
    [0, pixelsPerUnit * 1.1, pixelsPerUnit * 1.9, pixelsPerUnit * 2.5],
    [1, 0.9, 0.45, 0]
  );

  // Active number proximity-based continuous scaling:
  // Center (d=0): scale = 1.30 (~33.8px) - dominant, clear active selection
  // Near neighbor (d=80px): scale = 0.88 (~22.9px) - medium, clean contrast
  // Outer neighbor (d=160px): scale = 0.68 (~17.7px) - progressively smaller
  // Far boundary (d>=200px): scale = 0.56 (~14.6px) - tertiary
  const numberScale = useTransform(
    distance,
    [0, pixelsPerUnit * 0.5, pixelsPerUnit, pixelsPerUnit * 1.5, pixelsPerUnit * 2, pixelsPerUnit * 2.5],
    [1.30, 1.10, 0.88, 0.76, 0.68, 0.56]
  );

  // Number opacity: active number fully opaque, neighbors gracefully subdued
  const numberOpacity = useTransform(
    distance,
    [0, pixelsPerUnit, pixelsPerUnit * 1.8, pixelsPerUnit * 2.5],
    [1, 0.85, 0.45, 0]
  );

  return (
    <motion.div
      className="absolute top-[76px] sm:top-[80px] flex flex-col items-center pointer-events-none"
      style={{
        left: itemX,
        x: '-50%',
        y: shouldReduceMotion ? 0 : yOffset,
        rotate: shouldReduceMotion ? 0 : rotate,
        opacity,
        transformOrigin: '50% 160px'
      }}
    >
      {/* Number label for integer values with proximity scaling */}
      {isInteger ? (
        <motion.span
          className="font-sans text-[26px] font-extrabold text-text-primary tabular-nums select-none leading-none tracking-tight mb-2 origin-bottom inline-block"
          style={{
            scale: shouldReduceMotion ? 1 : numberScale,
            opacity: numberOpacity
          }}
        >
          {Math.round(val)}
        </motion.span>
      ) : (
        <div className="h-[26px] mb-2" />
      )}

      {/* Tick mark */}
      <div
        className={`rounded-full transition-colors ${
          isInteger
            ? 'h-10 w-[2px] bg-text-secondary'
            : isHalf
              ? 'h-6 w-[1.5px] bg-text-muted/60'
              : 'h-3.5 w-[1px] bg-text-muted/30'
        }`}
      />
    </motion.div>
  );
});

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

  const handlePanStart = () => {
    if (disabled || isEditing) return;
    isDraggingRef.current = true;
    const currentTargetX = -safeValue * pixelsPerUnit;
    x.set(currentTargetX);
    dragStartX.current = currentTargetX;
  };

  const handlePan = (_: unknown, info: PanInfo) => {
    if (disabled || isEditing || !isDraggingRef.current) return;
    const newX = dragStartX.current + info.offset.x;
    const minX = -max * pixelsPerUnit;
    const maxX = -min * pixelsPerUnit;
    const clampedX = Math.max(minX, Math.min(maxX, newX));

    // Smooth visual motion
    x.set(clampedX);

    // Immediate direct data path: pointer position -> raw weight -> snap 0.1 -> onChange
    const snappedWeight = calculateDragWeight(
      dragStartX.current,
      info.offset.x,
      pixelsPerUnit,
      min,
      max,
      step
    );

    if (Math.abs(snappedWeight - lastEmittedValue.current) >= 0.05) {
      lastEmittedValue.current = snappedWeight;
      onChange(snappedWeight);
    }
  };

  const handlePanEnd = (_: unknown, info: PanInfo) => {
    if (disabled || isEditing) return;
    isDraggingRef.current = false;

    // Apply momentum with damping, then snap to nearest step
    const currentVal = -x.get() / pixelsPerUnit;
    const velocityOffset = shouldReduceMotion ? 0 : (info.velocity.x * 0.0006);
    const projectedVal = currentVal - velocityOffset;
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
    } else if (e.key === 'Home') {
      e.preventDefault();
      const next = snapWeightValue(min, step);
      onChange(next);
      x.set(-next * pixelsPerUnit);
    } else if (e.key === 'End') {
      e.preventDefault();
      const next = snapWeightValue(max, step);
      onChange(next);
      x.set(-next * pixelsPerUnit);
    } else if (e.key === 'Enter') {
      setIsEditing(true);
    }
  };

  // Center of the virtual window based on rounded value
  const centerInt = Math.round(safeValue);

  // Virtual window around current value (± 3.5 units = 70 subdivisions)
  const ticks = useMemo(() => {
    const buffer = 3.5;
    const start = Math.max(min, Math.round((centerInt - buffer) * 10) / 10);
    const end = Math.min(max, Math.round((centerInt + buffer) * 10) / 10);
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
  }, [centerInt, min, max]);

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
      className={`relative flex w-full flex-col items-center rounded-[32px] sm:rounded-[36px] border border-border-subtle bg-surface-elevated/40 p-3 sm:p-4 shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        disabled ? 'pointer-events-none opacity-50' : ''
      } ${className}`}
    >
      {/* Scale Faceplate Header Label */}
      <div className="flex items-center gap-1.5 pb-1">
        {icon === 'target' ? (
          <Target className="size-3.5 text-accent stroke-[2.5]" />
        ) : (
          <Scale className="size-3.5 text-accent stroke-[2.5]" />
        )}
        <span className="font-sans text-xs font-bold uppercase tracking-wider text-text-muted">
          {label}
        </span>
      </div>

      {/* Central Value (Unified Precise Readout) */}
      <div className="my-0.5 sm:my-1 flex items-center justify-center">
        {isEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitDirectInput();
            }}
            className="flex min-h-[44px] items-baseline justify-center gap-1"
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
              className="w-28 sm:w-32 border-b-2 border-accent bg-transparent pb-0.5 text-center font-sans text-3xl sm:text-4xl font-extrabold text-text-primary tabular-nums tracking-tight outline-none"
            />
            <span className="font-sans text-base sm:text-lg font-bold text-text-muted">{unit}</span>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditText(formatWeightValue(safeValue, locale));
              setIsEditing(true);
            }}
            title="Toca para editar con teclado"
            className="group flex min-h-[44px] items-baseline justify-center gap-1 rounded-xl px-3 py-1 transition-transform active:scale-95 cursor-pointer"
          >
            <span className="font-sans text-3xl sm:text-4xl font-extrabold text-text-primary tabular-nums tracking-tight group-hover:text-accent transition-colors">
              {formatWeightValue(safeValue, locale)}
            </span>
            <span className="font-sans text-base sm:text-lg font-bold text-text-muted">{unit}</span>
          </button>
        )}
      </div>

      {/* Curved Scale Dial Aperture (Expanded Scale Body with Strongly Rounded Corners) */}
      <div className="relative mt-1 h-[235px] min-[360px]:h-[245px] sm:h-[255px] w-full max-w-[325px] sm:max-w-[340px] mx-auto overflow-hidden rounded-[28px] sm:rounded-[32px] border border-border-subtle/60 bg-surface-input/50 shadow-inner select-none touch-pan-y">
        {/* Edge Gradient Fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-9 sm:w-11 bg-gradient-to-r from-surface-input/90 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-9 sm:w-11 bg-gradient-to-l from-surface-input/90 to-transparent" />

        {/* Fixed Scale Indicator (Stationary Slender Needle with Circular Tip) */}
        <div className="pointer-events-none absolute bottom-0 sm:bottom-0.5 inset-x-0 z-20 flex flex-col items-center">
          <div className="size-2.5 sm:size-3 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent,var(--accent-glow))] -mb-1 z-10" />
          <svg
            className="h-16 sm:h-[70px] w-2 sm:w-2.5 text-accent"
            viewBox="0 0 10 64"
            fill="none"
            preserveAspectRatio="none"
          >
            <circle cx="5" cy="5" r="3" fill="currentColor" />
            <path
              d="M 5 2 L 8 64 L 2 64 Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
          </svg>
          <div className="h-1 w-4 rounded-t-full bg-accent/40 -mt-0.5" />
        </div>

        {/* Layer 1: Visual Moving Dial (pointer-events-none) */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 select-none"
          style={{ x: springX, left: '50%' }}
        >
          {ticks.map(({ val, isInteger, isHalf }) => (
            <DialTickItem
              key={val}
              val={val}
              isInteger={isInteger}
              isHalf={isHalf}
              pixelsPerUnit={pixelsPerUnit}
              scrollX={springX}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </motion.div>

        {/* Layer 2: Fixed Gesture Surface (captures all pointer/touch pan events) */}
        <motion.div
          data-testid="scale-gesture-surface"
          aria-hidden="true"
          onPanStart={handlePanStart}
          onPan={handlePan}
          onPanEnd={handlePanEnd}
          className={`absolute inset-0 z-30 select-none touch-pan-y ${
            disabled ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'
          }`}
          style={{ touchAction: 'pan-y' }}
        />
      </div>
    </div>
  );
};
