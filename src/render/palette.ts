import * as THREE from 'three';
import type { Era } from '../core/types';

/** Art-direction targets from the colour script, plus derived surface colours per era. */
export interface Palette {
  sky: string; shadow: string; masonry: string; secondary: string; practical: string; enamel: string; paper: string;
  road: string; plaster: string; brick: string; wood: string; brass: string; roof: string; glass: string;
  glassLit: string; trim: string; floor: string; fog: string; hemiSky: string; hemiGround: string; key: string;
  ink: string; cloth: string[];
}

export const PALETTES: Record<Era, Palette> = {
  present: {
    sky: '#354661', shadow: '#162331', masonry: '#536678', secondary: '#376467', practical: '#F1BB70', enamel: '#8D4544', paper: '#EEE6D5',
    road: '#253243', plaster: '#5d6c7b', brick: '#4f5868', wood: '#3a4a52', brass: '#8c7c58', roof: '#26303e', glass: '#1c2836',
    glassLit: '#F1BB70', trim: '#6c7a88', floor: '#55606c', fog: '#2f3d55', hemiSky: '#c6d2e8', hemiGround: '#33405a', key: '#8fa3c4',
    ink: '#162331', cloth: ['#4a5566', '#5a4a52'],
  },
  past: {
    sky: '#F2CC9C', shadow: '#574958', masonry: '#CFB58F', secondary: '#82977B', practical: '#FFE3A8', enamel: '#C84F3C', paper: '#EEE6D5',
    road: '#a8927a', plaster: '#d9c3a0', brick: '#b98b6d', wood: '#82977B', brass: '#c9a35a', roof: '#8e6f66', glass: '#6f6a78',
    glassLit: '#FFE3A8', trim: '#e6d6b8', floor: '#bda88a', fog: '#e9c9a2', hemiSky: '#f4e6da', hemiGround: '#7a6676', key: '#fff0d2',
    ink: '#574958', cloth: ['#f4efe2', '#d9c9b0', '#e9d7a8', '#bcc7b4'],
  },
};

export const col = (hex: string) => new THREE.Color(hex);
