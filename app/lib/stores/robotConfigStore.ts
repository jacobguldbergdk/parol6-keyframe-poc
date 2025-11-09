/**
 * Robot Configuration Store
 * Settings that don't change frequently during operation
 */

import { create } from 'zustand';
import type { IkAxisMask } from '../types';

export interface RobotConfigStore {
  // TCP (Tool Center Point) offset from J6 reference frame (in millimeters)
  // User-adjustable to match different tools
  tcpOffset: { x: number; y: number; z: number };

  // IK axis mask - selectively enable/disable axes during IK solving
  // Default: Full 6DoF (all axes enabled)
  ikAxisMask: IkAxisMask;

  // Actions
  setTcpOffset: (axis: 'x' | 'y' | 'z', value: number) => void;
  setIkAxisMask: (updates: Partial<IkAxisMask>) => void;
}

export const useRobotConfigStore = create<RobotConfigStore>((set) => ({
  // Initial state
  tcpOffset: { x: 47, y: 0, z: -62 },
  ikAxisMask: { X: true, Y: true, Z: true, RX: true, RY: true, RZ: true },

  // Actions
  setTcpOffset: (axis, value) => {
    set((state) => ({
      tcpOffset: {
        ...state.tcpOffset,
        [axis]: value
      }
    }));
  },

  setIkAxisMask: (updates) => {
    set((state) => ({
      ikAxisMask: {
        ...state.ikAxisMask,
        ...updates
      }
    }));
  }
}));
