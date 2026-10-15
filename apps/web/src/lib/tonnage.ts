export interface RealWorldComparison {
  id: string;
  unitKg: number;
  icon: string;
}

export const REAL_WORLD_OBJECTS: RealWorldComparison[] = [
  {
    id: 'gorilla',
    unitKg: 180,
    icon: '🦍'
  },
  {
    id: 'piano',
    unitKg: 450,
    icon: '🎹'
  },
  {
    id: 'car',
    unitKg: 1400,
    icon: '🚗'
  },
  {
    id: 'rhino',
    unitKg: 2300,
    icon: '🦏'
  },
  {
    id: 'elephant',
    unitKg: 5500,
    icon: '🐘'
  },
  {
    id: 'trex',
    unitKg: 8000,
    icon: '🦖'
  },
  {
    id: 'plane',
    unitKg: 41000,
    icon: '✈️'
  },
  {
    id: 'whale',
    unitKg: 140000,
    icon: '🐋'
  },
  {
    id: 'statue',
    unitKg: 225000,
    icon: '🗽'
  }
];

export interface TonnageEquivalenceResult {
  totalKg: number;
  totalTonnes: number;
  primary: {
    id: string;
    count: number;
    countFormatted: string;
    icon: string;
  };
  breakdown: Array<{
    id: string;
    count: number;
    countFormatted: string;
    icon: string;
    unitKg: number;
  }>;
  nextMilestone: {
    id: string;
    icon: string;
    targetKg: number;
    remainingKg: number;
    progressPercent: number;
  };
}

export function getTonnageEquivalences(totalKg: number): TonnageEquivalenceResult {
  const safeKg = Math.max(0, Math.round(totalKg));
  const totalTonnes = Math.round((safeKg / 1000) * 10) / 10;

  // Calculamos el desglose de cada objeto
  const breakdown = REAL_WORLD_OBJECTS.map((obj) => {
    const rawCount = safeKg / obj.unitKg;
    let countFormatted: string;
    if (rawCount >= 10) {
      countFormatted = rawCount.toFixed(0);
    } else if (rawCount >= 1) {
      countFormatted = rawCount.toFixed(1);
    } else {
      countFormatted = rawCount.toFixed(2);
    }

    return {
      id: obj.id,
      count: rawCount,
      countFormatted,
      icon: obj.icon,
      unitKg: obj.unitKg,
    };
  });

  // Elegimos la comparación primaria más natural:
  // El objeto cuyo count esté más cerca de 1 a 10 (sin ser menor a 0.5 si hay opciones mejores)
  let bestObj = breakdown[0];
  for (const item of breakdown) {
    if (item.count >= 0.75 && item.count <= 25) {
      bestObj = item;
      break;
    }
  }
  // Si safeKg es muy alto y todo pasa de 25, tomamos el que tenga menor count positivo
  if (bestObj.count > 25) {
    const candidate = breakdown.slice().reverse().find((b) => b.count >= 0.2);
    if (candidate) bestObj = candidate;
  }

  const primary = {
    id: bestObj.id,
    count: bestObj.count,
    countFormatted: bestObj.countFormatted,
    icon: bestObj.icon
  };

  // Siguiente Hito
  const milestoneTarget = REAL_WORLD_OBJECTS.find((obj) => obj.unitKg > safeKg) || {
    id: 'car100',
    unitKg: 140000,
    icon: '🚗'
  };

  const remainingKg = Math.max(0, milestoneTarget.unitKg - safeKg);
  const progressPercent = Math.min(100, Math.round((safeKg / milestoneTarget.unitKg) * 100));

  const nextMilestone = {
    id: milestoneTarget.id,
    icon: milestoneTarget.icon,
    targetKg: milestoneTarget.unitKg,
    remainingKg,
    progressPercent
  };

  return {
    totalKg: safeKg,
    totalTonnes,
    primary,
    breakdown,
    nextMilestone
  };
}

/** Localizes the already-rounded display count without changing equivalence math. */
export function formatTonnageCount(countFormatted: string, locale: string): string {
  const decimals = countFormatted.split('.')[1]?.length ?? 0;
  return Number(countFormatted).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
