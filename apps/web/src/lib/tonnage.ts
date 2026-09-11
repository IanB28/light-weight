export interface RealWorldComparison {
  id: string;
  name: string;
  unitKg: number;
  icon: string;
  description: string;
}

export const REAL_WORLD_OBJECTS: RealWorldComparison[] = [
  {
    id: 'gorilla',
    name: 'Gorilas de lomo plateado',
    unitKg: 180,
    icon: '🦍',
    description: 'Un imponente macho alfa de la selva africana (~180 kg)'
  },
  {
    id: 'piano',
    name: 'Pianos de cola de concierto',
    unitKg: 450,
    icon: '🎹',
    description: 'Un piano de concierto Steinway clásico (~450 kg)'
  },
  {
    id: 'car',
    name: 'Coches sedán promedio',
    unitKg: 1400,
    icon: '🚗',
    description: 'Un automóvil sedán estándar moderno (~1,400 kg)'
  },
  {
    id: 'rhino',
    name: 'Rinocerontes blancos',
    unitKg: 2300,
    icon: '🦏',
    description: 'Uno de los mayores mamíferos terrestres (~2,300 kg)'
  },
  {
    id: 'elephant',
    name: 'Elefantes africanos adultos',
    unitKg: 5500,
    icon: '🐘',
    description: 'El mamífero terrestre más colosal del planeta (~5,500 kg)'
  },
  {
    id: 'trex',
    name: 'Tiranosaurios Rex',
    unitKg: 8000,
    icon: '🦖',
    description: 'El mayor depredador del Cretácico (~8,000 kg)'
  },
  {
    id: 'plane',
    name: 'Aviones Boeing 737 comerciales',
    unitKg: 41000,
    icon: '✈️',
    description: 'Un avión de pasajeros de línea comercial (~41,000 kg vacío)'
  },
  {
    id: 'whale',
    name: 'Ballenas azules adultas',
    unitKg: 140000,
    icon: '🐋',
    description: 'El animal más grande que ha existido en la Tierra (~140,000 kg)'
  },
  {
    id: 'statue',
    name: 'Estatuas de la Libertad',
    unitKg: 225000,
    icon: '🗽',
    description: 'La célebre escultura monumental de cobre y hierro (~225,000 kg)'
  }
];

export interface TonnageEquivalenceResult {
  totalKg: number;
  totalTonnes: number;
  primary: {
    name: string;
    count: number;
    countFormatted: string;
    icon: string;
    sentence: string;
  };
  breakdown: Array<{
    id: string;
    name: string;
    count: number;
    countFormatted: string;
    icon: string;
    unitKg: number;
    description: string;
  }>;
  nextMilestone: {
    name: string;
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
      name: obj.name,
      count: rawCount,
      countFormatted,
      icon: obj.icon,
      unitKg: obj.unitKg,
      description: obj.description
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
    name: bestObj.name,
    count: bestObj.count,
    countFormatted: bestObj.countFormatted,
    icon: bestObj.icon,
    sentence: `¡Has levantado el peso equivalente a ${bestObj.countFormatted} ${bestObj.name.toLowerCase()}!`
  };

  // Siguiente Hito
  const milestoneTarget = REAL_WORLD_OBJECTS.find((obj) => obj.unitKg > safeKg) || {
    name: '100 Coches Sedán',
    unitKg: 140000,
    icon: '🚗'
  };

  const remainingKg = Math.max(0, milestoneTarget.unitKg - safeKg);
  const progressPercent = Math.min(100, Math.round((safeKg / milestoneTarget.unitKg) * 100));

  const nextMilestone = {
    name: `1 ${milestoneTarget.name.replace(/es$|s$/, '')}`,
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
