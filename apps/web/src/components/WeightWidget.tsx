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

export const GESTURE_PIXELS_PER_UNIT = 80;
export const REFERENCE_DIAL_WIDTH = 322;
export const REFERENCE_DIAL_HEIGHT = 245;
export const DIAL_ASPECT_RATIO = REFERENCE_DIAL_WIDTH / REFERENCE_DIAL_HEIGHT; // ~1.3142857

/**
 * Derives visual spacing per 1.0 unit from the actual dial aperture width.
 * Reference: 322px dial -> 80px visual spacing per 1.0 unit (~8px per 0.1).
 */
export function getVisualPixelsPerUnit(dialWidth: number): number {
  if (!Number.isFinite(dialWidth) || dialWidth <= 0) return GESTURE_PIXELS_PER_UNIT;
  return dialWidth * (GESTURE_PIXELS_PER_UNIT / REFERENCE_DIAL_WIDTH);
}

/**
 * Derives restrained responsive numeral size from dial width.
 * Reference: 322px dial -> 26px base numeral.
 */
export function getBaseNumeralPx(dialWidth: number): number {
  if (!Number.isFinite(dialWidth) || dialWidth <= 0) return 26;
  return Math.min(28, Math.max(21, Math.round(dialWidth * (26 / REFERENCE_DIAL_WIDTH))));
}

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
  geometryScale: number;
  baseNumeralPx: number;
  scrollX: MotionValue<number>;
  shouldReduceMotion: boolean | null;
}

export const DialTickItem: React.FC<DialTickItemProps> = React.memo(({
  val,
  isInteger,
  isHalf,
  pixelsPerUnit,
  geometryScale,
  baseNumeralPx,
  scrollX,
  shouldReduceMotion
}) => {
  const itemX = val * pixelsPerUnit;
  // Distance from center
  const distance = useTransform(scrollX, (s: number) => Math.abs(s + itemX));
  const signedOffset = useTransform(scrollX, (s: number) => s + itemX);

  // Curved vertical offset (arc trajectory: downward offset as distance increases, scaled by geometryScale)
  const yOffset = useTransform(
    distance,
    [0, pixelsPerUnit * 0.5, pixelsPerUnit, pixelsPerUnit * 1.5, pixelsPerUnit * 2, pixelsPerUnit * 2.5],
    [0, 5 * geometryScale, 22 * geometryScale, 50 * geometryScale, 88 * geometryScale, 136 * geometryScale]
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

  const topOffset = Math.round(76 * geometryScale);
  const transformOriginY = Math.round(160 * geometryScale);
  const integerTickH = Math.round(40 * geometryScale);
  const halfTickH = Math.round(24 * geometryScale);
  const subTickH = Math.round(14 * geometryScale);
  const numeralMarginB = Math.round(8 * geometryScale);

  return (
    <motion.div
      className="absolute flex flex-col items-center pointer-events-none"
      style={{
        top: `${topOffset}px`,
        left: itemX,
        x: '-50%',
        y: shouldReduceMotion ? 0 : yOffset,
        rotate: shouldReduceMotion ? 0 : rotate,
        opacity,
        transformOrigin: `50% ${transformOriginY}px`
      }}
    >
      {/* Number label for integer values with proximity scaling */}
      {isInteger ? (
        <motion.span
          className="font-sans font-extrabold text-text-primary tabular-nums select-none leading-none tracking-tight origin-bottom inline-block"
          style={{
            fontSize: `${baseNumeralPx}px`,
            marginBottom: `${numeralMarginB}px`,
            scale: shouldReduceMotion ? 1 : numberScale,
            opacity: numberOpacity
          }}
        >
          {Math.round(val)}
        </motion.span>
      ) : (
        <div style={{ height: `${baseNumeralPx}px`, marginBottom: `${numeralMarginB}px` }} />
      )}

      {/* Tick mark */}
      <div
        style={{
          height: `${isInteger ? integerTickH : isHalf ? halfTickH : subTickH}px`,
          width: `${isInteger ? 2 : isHalf ? 1.5 : 1}px`
        }}
        className={`rounded-full transition-colors ${
          isInteger
            ? 'bg-text-secondary'
            : isHalf
              ? 'bg-text-muted/60'
              : 'bg-text-muted/30'
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

  const defaultBounds = useMemo(() => {
    return getBodyweightBounds(unit === 'lb' ? 'imperial' : 'metric');
  }, [unit]);

  const min = propMin ?? defaultBounds.min;
  const max = propMax ?? defaultBounds.max;

  // Safe normalized initial value
  const safeValue = clampWeightValue(snapWeightValue(value, step), min, max);

  const apertureRef = useRef<HTMLDivElement>(null);
  const [apertureWidth, setApertureWidth] = useState<number>(REFERENCE_DIAL_WIDTH);

  useEffect(() => {
    const el = apertureRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setApertureWidth((prev) => (Math.abs(prev - rect.width) < 1 ? prev : rect.width));
      }
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          setApertureWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visualPixelsPerUnit = getVisualPixelsPerUnit(apertureWidth);
  const geometryScale = (apertureWidth > 0 ? apertureWidth : REFERENCE_DIAL_WIDTH) / REFERENCE_DIAL_WIDTH;
  const baseNumeralPx = getBaseNumeralPx(apertureWidth);

  // Gesture domain: fixed 80px per unit for consistent drag sensitivity across all viewports
  const x = useMotionValue(-safeValue * GESTURE_PIXELS_PER_UNIT);
  const springConfig = shouldReduceMotion
    ? { stiffness: 1000, damping: 100, mass: 0.1 }
    : { stiffness: 450, damping: 45, mass: 0.8 };
  const springX = useSpring(x, springConfig);

  // Visual domain: derived from actual dial width so visual spacing scales smoothly
  const visualX = useTransform(
    springX,
    (val) => val * (visualPixelsPerUnit / GESTURE_PIXELS_PER_UNIT)
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(formatWeightValue(safeValue, locale));
  const isDraggingRef = useRef(false);
  const dragStartX = useRef(x.get());
  const lastEmittedValue = useRef(safeValue);

  // Synchronize when controlled `value` changes from parent (e.g. switching tabs log <-> goal or unit switch)
  useEffect(() => {
    if (isDraggingRef.current || isEditing) return;
    const targetX = -safeValue * GESTURE_PIXELS_PER_UNIT;
    if (Math.abs(x.get() - targetX) > 0.5) {
      x.set(targetX);
    }
    lastEmittedValue.current = safeValue;
    setEditText(formatWeightValue(safeValue, locale));
  }, [safeValue, x, isEditing, locale]);

  const handlePanStart = () => {
    if (disabled || isEditing) return;
    isDraggingRef.current = true;
    const currentTargetX = -safeValue * GESTURE_PIXELS_PER_UNIT;
    x.set(currentTargetX);
    dragStartX.current = currentTargetX;
  };

  const handlePan = (_: unknown, info: PanInfo) => {
    if (disabled || isEditing || !isDraggingRef.current) return;
    const newX = dragStartX.current + info.offset.x;
    const minX = -max * GESTURE_PIXELS_PER_UNIT;
    const maxX = -min * GESTURE_PIXELS_PER_UNIT;
    const clampedX = Math.max(minX, Math.min(maxX, newX));

    // Smooth visual motion
    x.set(clampedX);

    // Immediate direct data path: pointer position -> raw weight -> snap 0.1 -> onChange
    const snappedWeight = calculateDragWeight(
      dragStartX.current,
      info.offset.x,
      GESTURE_PIXELS_PER_UNIT,
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
    const currentVal = -x.get() / GESTURE_PIXELS_PER_UNIT;
    const velocityOffset = shouldReduceMotion ? 0 : (info.velocity.x * 0.0006);
    const projectedVal = currentVal - velocityOffset;
    const clampedVal = clampWeightValue(projectedVal, min, max);
    const targetVal = snapWeightValue(clampedVal, step);

    lastEmittedValue.current = targetVal;
    onChange(targetVal);
    x.set(-targetVal * GESTURE_PIXELS_PER_UNIT);
  };

  const commitDirectInput = () => {
    const parsed = parseWeightInput(editText);
    if (parsed !== null && parsed > 0) {
      const clamped = clampWeightValue(snapWeightValue(parsed, step), min, max);
      onChange(clamped);
      x.set(-clamped * GESTURE_PIXELS_PER_UNIT);
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
      x.set(-next * GESTURE_PIXELS_PER_UNIT);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = clampWeightValue(snapWeightValue(safeValue + step, step), min, max);
      onChange(next);
      x.set(-next * GESTURE_PIXELS_PER_UNIT);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      const next = clampWeightValue(snapWeightValue(safeValue - 1.0, step), min, max);
      onChange(next);
      x.set(-next * GESTURE_PIXELS_PER_UNIT);
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      const next = clampWeightValue(snapWeightValue(safeValue + 1.0, step), min, max);
      onChange(next);
      x.set(-next * GESTURE_PIXELS_PER_UNIT);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const next = snapWeightValue(min, step);
      onChange(next);
      x.set(-next * GESTURE_PIXELS_PER_UNIT);
    } else if (e.key === 'End') {
      e.preventDefault();
      const next = snapWeightValue(max, step);
      onChange(next);
      x.set(-next * GESTURE_PIXELS_PER_UNIT);
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

  const needleDotSize = Math.min(13, Math.max(9, Math.round(11 * geometryScale)));
  const needleH = Math.min(80, Math.max(52, Math.round(64 * geometryScale)));
  const needleW = Math.min(12, Math.max(8, Math.round(9 * geometryScale)));
  const needleBaseW = Math.min(20, Math.max(14, Math.round(16 * geometryScale)));
  const needleBaseH = Math.min(6, Math.max(4, Math.round(4 * geometryScale)));
  const fadeWidth = Math.round(apertureWidth * 0.115);

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
      className={`relative flex w-full flex-col items-center rounded-[32px] sm:rounded-[36px] border border-border-subtle bg-surface-elevated/40 px-2.5 py-3 sm:p-4 shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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

      {/* Curved Scale Dial Aperture (Expanded Scale Body with Strongly Rounded Corners & Reference Aspect Ratio) */}
      <div
        ref={apertureRef}
        style={{ aspectRatio: `${REFERENCE_DIAL_WIDTH} / ${REFERENCE_DIAL_HEIGHT}` }}
        className="relative mt-1 w-full overflow-hidden rounded-[28px] sm:rounded-[32px] border border-border-subtle/60 bg-surface-input/50 shadow-inner select-none touch-pan-y"
      >
        {/* Edge Gradient Fades (Proportionally scaled to dial width ~11.5%) */}
        <div
          style={{ width: `${fadeWidth}px` }}
          className="pointer-events-none absolute inset-y-0 left-0 z-10 bg-gradient-to-r from-surface-input/90 to-transparent"
        />
        <div
          style={{ width: `${fadeWidth}px` }}
          className="pointer-events-none absolute inset-y-0 right-0 z-10 bg-gradient-to-l from-surface-input/90 to-transparent"
        />

        {/* Fixed Scale Indicator (Stationary Slender Needle with Circular Tip, scaled mildly with geometryScale) */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 z-20 flex flex-col items-center">
          <div
            style={{ width: `${needleDotSize}px`, height: `${needleDotSize}px` }}
            className="rounded-full bg-accent shadow-[0_0_12px_var(--color-accent,var(--accent-glow))] -mb-1 z-10"
          />
          <svg
            style={{ height: `${needleH}px`, width: `${needleW}px` }}
            className="text-accent"
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
          <div
            style={{ width: `${needleBaseW}px`, height: `${needleBaseH}px` }}
            className="rounded-t-full bg-accent/40 -mt-0.5"
          />
        </div>

        {/* Layer 1: Visual Moving Dial (pointer-events-none) */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 select-none"
          style={{ x: visualX, left: '50%' }}
        >
          {ticks.map(({ val, isInteger, isHalf }) => (
            <DialTickItem
              key={val}
              val={val}
              isInteger={isInteger}
              isHalf={isHalf}
              pixelsPerUnit={visualPixelsPerUnit}
              geometryScale={geometryScale}
              baseNumeralPx={baseNumeralPx}
              scrollX={visualX}
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
