import React from 'react';

export interface ColorBendsProps {
  className?: string;
  style?: React.CSSProperties;
  color?: string;
  colors?: string[];
  rotation?: number;
  speed?: number;
  transparent?: boolean;
  autoRotate?: number;
  scale?: number;
  frequency?: number;
  warpStrength?: number;
  mouseInfluence?: number;
  parallax?: number;
  noise?: number;
  iterations?: number;
  intensity?: number;
  bandWidth?: number;
  fadeTop?: number;
}

export declare const ColorBends: React.FC<ColorBendsProps>;
export default ColorBends;
