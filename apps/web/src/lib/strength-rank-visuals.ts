import type { StrengthRank, StrengthRankIndex } from '@light-weight/domain';

export interface StrengthRankVisual {
  rank: StrengthRank;
  index: StrengthRankIndex;
  name: string;
  icon: string;
  assetPath: string;
  fill: string;
  color: string;
  accent: string;
  stroke: string;
  glow?: string;
  glowOpacity?: number;
  secondaryFill?: string;
  secondaryGlow?: string;
  filterDropShadow?: string;
}

export const STRENGTH_RANK_VISUALS: Record<StrengthRank, StrengthRankVisual> = {
  novato: {
    rank: 'novato',
    index: 1,
    name: 'Novato',
    icon: '/ranks/novato.png',
    assetPath: '/ranks/novato.png',
    fill: '#4A4E57',
    color: '#4A4E57',
    accent: '#8A8F99',
    stroke: '#8A8F99',
    glow: undefined,
    glowOpacity: 0,
    filterDropShadow: undefined
  },
  principiante: {
    rank: 'principiante',
    index: 2,
    name: 'Principiante',
    icon: '/ranks/principiante.png',
    assetPath: '/ranks/principiante.png',
    fill: '#B5652D',
    color: '#B5652D',
    accent: '#E08A4F',
    stroke: '#E08A4F',
    glow: '#E08A4F',
    glowOpacity: 0.15,
    filterDropShadow: 'drop-shadow(0 0 8px rgba(224, 138, 79, 0.15))'
  },
  gladiador: {
    rank: 'gladiador',
    index: 3,
    name: 'Gladiador',
    icon: '/ranks/gladiador.png',
    assetPath: '/ranks/gladiador.png',
    fill: '#8A5A1F',
    color: '#8A5A1F',
    accent: '#D99A3D',
    stroke: '#D99A3D',
    glow: '#C4551F',
    glowOpacity: 0.25,
    filterDropShadow: 'drop-shadow(0 0 10px rgba(196, 85, 31, 0.25))'
  },
  elite: {
    rank: 'elite',
    index: 4,
    name: 'Élite',
    icon: '/ranks/elite.png',
    assetPath: '/ranks/elite.png',
    fill: '#D4A017',
    color: '#D4A017',
    accent: '#FFD966',
    stroke: '#FFD966',
    glow: '#FFD966',
    glowOpacity: 0.35,
    filterDropShadow: 'drop-shadow(0 0 12px rgba(255, 217, 102, 0.35))'
  },
  maestro: {
    rank: 'maestro',
    index: 5,
    name: 'Maestro',
    icon: '/ranks/maestro.png',
    assetPath: '/ranks/maestro.png',
    fill: '#3B5A7A',
    color: '#3B5A7A',
    accent: '#5FA8D3',
    stroke: '#5FA8D3',
    glow: '#5FA8D3',
    glowOpacity: 0.40,
    filterDropShadow: 'drop-shadow(0 0 12px rgba(95, 168, 211, 0.40))'
  },
  leyenda: {
    rank: 'leyenda',
    index: 6,
    name: 'Leyenda',
    icon: '/ranks/leyenda.png',
    assetPath: '/ranks/leyenda.png',
    fill: '#1E90A8',
    color: '#1E90A8',
    accent: '#7FF0E8',
    stroke: '#7FF0E8',
    glow: '#7FF0E8',
    glowOpacity: 0.50,
    filterDropShadow: 'drop-shadow(0 0 14px rgba(127, 240, 232, 0.50))'
  },
  inmortal: {
    rank: 'inmortal',
    index: 7,
    name: 'Inmortal',
    icon: '/ranks/inmortal.png',
    assetPath: '/ranks/inmortal.png',
    fill: '#6B1F5C',
    color: '#6B1F5C',
    accent: '#C93C7A',
    stroke: '#C93C7A',
    glow: '#C93C7A',
    glowOpacity: 0.60,
    filterDropShadow: 'drop-shadow(0 0 16px rgba(201, 60, 122, 0.60))'
  },
  semidios: {
    rank: 'semidios',
    index: 8,
    name: 'Semidiós',
    icon: '/ranks/semidios.png',
    assetPath: '/ranks/semidios.png',
    fill: '#0D0D10',
    color: '#0D0D10',
    secondaryFill: '#D4A017',
    accent: '#FFD700',
    stroke: '#FFD700',
    glow: '#B8860B',
    glowOpacity: 0.65,
    filterDropShadow: 'drop-shadow(0 0 16px rgba(184, 134, 11, 0.65))'
  },
  dios: {
    rank: 'dios',
    index: 9,
    name: 'Dios',
    icon: '/ranks/dios.png',
    assetPath: '/ranks/dios.png',
    fill: '#F5F5FA',
    color: '#F5F5FA',
    accent: '#FFD700',
    stroke: '#FFD700',
    glow: '#FFFFFF',
    glowOpacity: 0.70,
    secondaryGlow: '#FFD700',
    filterDropShadow: 'drop-shadow(0 0 18px rgba(255, 255, 255, 0.70)) drop-shadow(0 0 10px rgba(255, 215, 0, 0.50))'
  }
};

export function getStrengthRankVisual(rank: StrengthRank): StrengthRankVisual {
  return STRENGTH_RANK_VISUALS[rank];
}

export function getStrengthRankColor(rank: StrengthRank | null | undefined): string {
  if (!rank) return '#71717A';
  return STRENGTH_RANK_VISUALS[rank]?.fill ?? '#71717A';
}
