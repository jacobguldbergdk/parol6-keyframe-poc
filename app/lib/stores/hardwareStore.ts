/**
 * Hardware Store
 * Hardware feedback state from physical robot
 * All data from WebSocket or actual robot sensors
 */

import { create } from 'zustand';
import type { JointAngles, CartesianPose, IOStatus, GripperStatus, RobotStatus, ConnectionStatus } from '../types';

export interface HardwareStore {
  // Real joint angles from physical robot encoders
  hardwareJointAngles: JointAngles | null;

  // Real TCP pose from physical robot (calculated by backend FK)
  hardwareCartesianPose: CartesianPose | null;

  // Hardware TCP pose calculated from URDF (frontend FK from hardwareJointAngles)
  // This is what the ghost robot's TCP actually shows
  hardwareTcpPose: CartesianPose | null;

  // URDF reference for hardware robot visual (ghost robot)
  hardwareRobotRef: any;

  // Hardware status from WebSocket
  ioStatus: IOStatus | null;
  gripperStatus: GripperStatus | null;
  robotStatus: RobotStatus | null;
  connectionStatus: ConnectionStatus;

  // Actions
  setHardwareJointAngles: (angles: JointAngles | null) => void;
  setHardwareCartesianPose: (pose: CartesianPose | null) => void;
  setHardwareTcpPose: (pose: CartesianPose | null) => void;
  setHardwareRobotRef: (ref: any) => void;
  setIOStatus: (status: IOStatus | null) => void;
  setGripperStatus: (status: GripperStatus | null) => void;
  setRobotStatus: (status: RobotStatus | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useHardwareStore = create<HardwareStore>((set) => ({
  // Initial state
  hardwareJointAngles: null,
  hardwareCartesianPose: null,
  hardwareTcpPose: null,
  hardwareRobotRef: null,

  ioStatus: null,
  gripperStatus: null,
  robotStatus: null,
  connectionStatus: 'disconnected',

  // Actions
  setHardwareJointAngles: (angles) => set({ hardwareJointAngles: angles }),
  setHardwareCartesianPose: (pose) => set({ hardwareCartesianPose: pose }),
  setHardwareTcpPose: (pose) => set({ hardwareTcpPose: pose }),
  setHardwareRobotRef: (ref) => set({ hardwareRobotRef: ref }),
  setIOStatus: (status) => set({ ioStatus: status }),
  setGripperStatus: (status) => set({ gripperStatus: status }),
  setRobotStatus: (status) => set({ robotStatus: status }),
  setConnectionStatus: (status) => set({ connectionStatus: status })
}));
