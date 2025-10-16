// Joint name type
export type JointName = 'J1' | 'J2' | 'J3' | 'J4' | 'J5' | 'J6';

// Cartesian axis type
export type CartesianAxis = 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ';

// Motion mode type
export type MotionMode = 'joint' | 'cartesian';

// Joint angles for 6-DOF robot
export interface JointAngles {
  J1: number;
  J2: number;
  J3: number;
  J4: number;
  J5: number;
  J6: number;
}

// Cartesian pose for end effector
export interface CartesianPose {
  X: number;  // mm
  Y: number;  // mm
  Z: number;  // mm
  RX: number; // degrees
  RY: number; // degrees
  RZ: number; // degrees
}

// IK axis mask - selectively enable/disable axes during IK solving
export interface IkAxisMask {
  X: boolean;   // Solve for X position
  Y: boolean;   // Solve for Y position
  Z: boolean;   // Solve for Z position
  RX: boolean;  // Solve for RX rotation
  RY: boolean;  // Solve for RY rotation
  RZ: boolean;  // Solve for RZ rotation
}

// Joint keyframe = one joint value at one time (independent per joint)
export interface Keyframe {
  id: string;
  time: number; // seconds
  joint: JointName; // Which joint this keyframe controls
  value: number; // degrees
  label?: string;
}

// Cartesian keyframe = one cartesian axis value at one time
export interface CartesianKeyframe {
  id: string;
  time: number; // seconds
  axis: CartesianAxis; // Which axis this keyframe controls
  value: number; // mm for X,Y,Z; degrees for RX,RY,RZ
  label?: string;
}

// Timeline = collection of keyframes (joint or cartesian depending on mode)
export interface Timeline {
  name: string;
  mode: MotionMode; // joint or cartesian
  keyframes: Keyframe[]; // For joint mode
  cartesianKeyframes: CartesianKeyframe[]; // For cartesian mode
  duration: number; // total duration in seconds
  fps?: number; // playback frame rate (default 60)
}

// Playback state
export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  startTime: number | null;
  loop: boolean;
}

// Joint limits (from PAROL6_ROBOT.py)
export interface JointLimit {
  min: number;
  max: number;
}

// Store state
export interface TimelineStore {
  // Data
  timeline: Timeline;
  currentJointAngles: JointAngles;
  currentCartesianPose: CartesianPose;
  playbackState: PlaybackState;
  ikAxisMask: IkAxisMask;

  // Actual TCP pose from URDF (ground truth, updated by ActualTCPVisualizer)
  actualTcpPosition: { X: number; Y: number; Z: number; RX: number; RY: number; RZ: number } | null;

  // Motion mode actions
  setMotionMode: (mode: MotionMode) => void;

  // Joint keyframe actions
  addKeyframe: (time: number, joint: JointName, value: number) => void;
  removeKeyframe: (id: string) => void;
  updateKeyframe: (id: string, updates: Partial<Keyframe>) => void;
  recordKeyframes: () => void; // Records 6 separate keyframes (one per joint)
  setJointAngle: (joint: keyof JointAngles, angle: number) => void;

  // Cartesian keyframe actions
  addCartesianKeyframe: (time: number, axis: CartesianAxis, value: number) => void;
  removeCartesianKeyframe: (id: string) => void;
  updateCartesianKeyframe: (id: string, updates: Partial<CartesianKeyframe>) => void;
  recordCartesianKeyframes: () => void; // Records 6 separate cartesian keyframes
  setCartesianValue: (axis: CartesianAxis, value: number) => void;

  // Playback actions
  setCurrentTime: (time: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;

  // Timeline management
  loadTimeline: (timeline: Timeline) => void;
  exportTimeline: () => string; // JSON

  // IK axis mask
  setIkAxisMask: (updates: Partial<IkAxisMask>) => void;
}
