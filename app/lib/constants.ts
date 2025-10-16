import { JointAngles, JointLimit, CartesianAxis } from './types';

// Joint names
export const JOINT_NAMES = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;

// Cartesian axis names
export const CARTESIAN_AXES: CartesianAxis[] = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'];

// Joint limits from PAROL6_ROBOT.py (degrees)
export const JOINT_LIMITS: Record<string, JointLimit> = {
  J1: { min: -123.046875, max: 123.046875 },
  J2: { min: -145.0088, max: -3.375 },
  J3: { min: 107.866, max: 287.8675 },
  J4: { min: -105.46975, max: 105.46975 },
  J5: { min: -90, max: 90 },
  J6: { min: 0, max: 360 }
};

// Standby position (degrees)
export const STANDBY_POSITION: JointAngles = {
  J1: 0,
  J2: -90,
  J3: 180,
  J4: 0,
  J5: 0,
  J6: 180
};

// Timeline colors (one per joint track)
export const JOINT_COLORS = [
  '#FF6B6B', // J1 - red
  '#4ECDC4', // J2 - teal
  '#45B7D1', // J3 - blue
  '#FFA07A', // J4 - orange
  '#98D8C8', // J5 - mint
  '#F7DC6F'  // J6 - yellow
];

// Cartesian limits (approximate workspace)
export const CARTESIAN_LIMITS = {
  X: { min: -300, max: 300 },    // mm
  Y: { min: -300, max: 300 },    // mm
  Z: { min: 0, max: 500 },       // mm (above base)
  RX: { min: -180, max: 180 },   // degrees
  RY: { min: -180, max: 180 },   // degrees
  RZ: { min: -180, max: 180 }    // degrees
};

// Playback settings
export const DEFAULT_FPS = 60;
export const DEFAULT_DURATION = 10; // seconds

// Orientation extraction configuration (found through iterative testing)
// These values produce correct orientation from URDF model for PAROL6
export const ORIENTATION_CONFIG = {
  offset: { RX: 0, RY: 90, RZ: -180 },  // Orientation offset in degrees
  eulerOrder: 'ZXY' as const,  // Three.js Euler angle extraction order
  applyQuaternionTransform: true,  // Apply parent rotation inverse transform
  negateRX: true,   // RX needs sign flip
  negateRY: true,   // RY needs sign flip
  negateRZ: false   // RZ is correct as-is
} as const;
