import { create } from 'zustand';
import { TimelineStore, Keyframe, CartesianKeyframe, Timeline, PlaybackState, JointAngles, CartesianPose, JointName, CartesianAxis, MotionMode, IkAxisMask, OrientationDebugConfig } from './types';
import { STANDBY_POSITION, DEFAULT_DURATION, JOINT_NAMES } from './constants';
import { v4 as uuidv4 } from 'uuid';

// Cartesian axis names
const CARTESIAN_AXES: CartesianAxis[] = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'];

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  // Initial state
  timeline: {
    name: 'Untitled',
    mode: 'joint' as MotionMode,
    keyframes: [],
    cartesianKeyframes: [],
    duration: DEFAULT_DURATION
  },
  currentJointAngles: STANDBY_POSITION,
  currentCartesianPose: {
    X: 0,
    Y: 0,
    Z: 300, // Default height above base
    RX: 0,
    RY: 0,
    RZ: 0
  },
  playbackState: {
    isPlaying: false,
    currentTime: 0,
    startTime: null,
    loop: false
  },

  // URDF robot reference (set by URDFRobot component)
  urdfRobotRef: null as any,

  // TCP (Tool Center Point) offset from J6 reference frame (in millimeters)
  // User-adjustable to match different tools
  tcpOffset: { x: 47, y: 0, z: -62 } as { x: number; y: number; z: number },

  // IK axis mask - selectively enable/disable axes during IK solving
  // Default: position-only (X, Y, Z enabled; RX, RY, RZ disabled)
  ikAxisMask: { X: true, Y: true, Z: true, RX: false, RY: false, RZ: false } as IkAxisMask,

  // Actual TCP position from URDF (ground truth, updated every frame by ActualTCPVisualizer)
  actualTcpPosition: null as { X: number; Y: number; Z: number } | null,

  // Actions - Updated for keyframe model
  addKeyframe: (time, joint, value) => {
    set((state) => ({
      timeline: {
        ...state.timeline,
        keyframes: [
          ...state.timeline.keyframes,
          {
            id: uuidv4(),
            time,
            joint,
            value
          }
        ].sort((a, b) => a.time - b.time) // Keep sorted by time
      }
    }));
  },

  removeKeyframe: (id) => {
    set((state) => ({
      timeline: {
        ...state.timeline,
        keyframes: state.timeline.keyframes.filter((kf) => kf.id !== id)
      }
    }));
  },

  updateKeyframe: (id, updates) => {
    const state = get();
    const oldKeyframe = state.timeline.keyframes.find(kf => kf.id === id);

    console.log('💾 STORE updateKeyframe:', {
      id,
      updates,
      oldKeyframe: oldKeyframe ? {
        joint: oldKeyframe.joint,
        time: oldKeyframe.time.toFixed(2) + 's',
        value: oldKeyframe.value.toFixed(1) + '°'
      } : 'NOT FOUND'
    });

    set((state) => ({
      timeline: {
        ...state.timeline,
        keyframes: state.timeline.keyframes
          .map((kf) =>
            kf.id === id ? { ...kf, ...updates } : kf
          )
          .sort((a, b) => a.time - b.time) // Re-sort if time was updated
      }
    }));

    const newState = get();
    const newKeyframe = newState.timeline.keyframes.find(kf => kf.id === id);
    console.log('💾 STORE AFTER UPDATE:', {
      id,
      newKeyframe: newKeyframe ? {
        joint: newKeyframe.joint,
        time: newKeyframe.time.toFixed(2) + 's',
        value: newKeyframe.value.toFixed(1) + '°'
      } : 'NOT FOUND'
    });
  },

  setCurrentTime: (time) => {
    set((state) => ({
      playbackState: {
        ...state.playbackState,
        currentTime: time
      }
    }));
  },

  play: () => {
    set((state) => ({
      playbackState: {
        ...state.playbackState,
        isPlaying: true,
        startTime: Date.now() - state.playbackState.currentTime * 1000
      }
    }));
  },

  pause: () => {
    set((state) => ({
      playbackState: {
        ...state.playbackState,
        isPlaying: false
      }
    }));
  },

  stop: () => {
    set({
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        startTime: null,
        loop: false
      }
    });
  },

  recordKeyframes: () => {
    const state = get();
    const currentTime = state.playbackState.currentTime;

    // Record 6 separate keyframes (one per joint) at current time
    JOINT_NAMES.forEach((joint) => {
      state.addKeyframe(currentTime, joint, state.currentJointAngles[joint]);
    });
  },

  setJointAngle: (joint, angle) => {
    set((state) => ({
      currentJointAngles: {
        ...state.currentJointAngles,
        [joint]: angle
      }
    }));
  },

  // Motion mode actions
  setMotionMode: (mode) => {
    const state = get();

    // Stop playback before mode switch
    if (state.playbackState.isPlaying) {
      state.stop();
    }

    console.log('🔄 MODE SWITCH:', { from: state.timeline.mode, to: mode });

    set((state) => ({
      timeline: {
        ...state.timeline,
        mode,
        // Clear keyframes when switching modes
        keyframes: mode === 'joint' ? state.timeline.keyframes : [],
        cartesianKeyframes: mode === 'cartesian' ? state.timeline.cartesianKeyframes : []
      },
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        startTime: null,
        loop: false
      }
    }));
  },

  // Cartesian keyframe actions
  addCartesianKeyframe: (time, axis, value) => {
    set((state) => ({
      timeline: {
        ...state.timeline,
        cartesianKeyframes: [
          ...state.timeline.cartesianKeyframes,
          {
            id: uuidv4(),
            time,
            axis,
            value
          }
        ].sort((a, b) => a.time - b.time)
      }
    }));
  },

  removeCartesianKeyframe: (id) => {
    set((state) => ({
      timeline: {
        ...state.timeline,
        cartesianKeyframes: state.timeline.cartesianKeyframes.filter((kf) => kf.id !== id)
      }
    }));
  },

  updateCartesianKeyframe: (id, updates) => {
    const state = get();
    const oldKeyframe = state.timeline.cartesianKeyframes.find(kf => kf.id === id);

    console.log('💾 STORE updateCartesianKeyframe:', {
      id,
      updates,
      oldKeyframe: oldKeyframe ? {
        axis: oldKeyframe.axis,
        time: oldKeyframe.time.toFixed(2) + 's',
        value: oldKeyframe.value.toFixed(1)
      } : 'NOT FOUND'
    });

    set((state) => ({
      timeline: {
        ...state.timeline,
        cartesianKeyframes: state.timeline.cartesianKeyframes
          .map((kf) =>
            kf.id === id ? { ...kf, ...updates } : kf
          )
          .sort((a, b) => a.time - b.time)
      }
    }));
  },

  recordCartesianKeyframes: () => {
    const state = get();
    const currentTime = state.playbackState.currentTime;

    // Record 6 separate cartesian keyframes (one per axis) at current time
    CARTESIAN_AXES.forEach((axis) => {
      state.addCartesianKeyframe(currentTime, axis, state.currentCartesianPose[axis]);
    });
  },

  setCartesianValue: (axis, value) => {
    set((state) => ({
      currentCartesianPose: {
        ...state.currentCartesianPose,
        [axis]: value
      }
    }));
  },

  loadTimeline: (timeline) => {
    set({ timeline });
  },

  exportTimeline: () => {
    return JSON.stringify(get().timeline, null, 2);
  },

  setTcpOffset: (axis: 'x' | 'y' | 'z', value: number) => {
    set((state) => ({
      tcpOffset: {
        ...state.tcpOffset,
        [axis]: value
      }
    }));
  },

  setIkAxisMask: (updates: Partial<IkAxisMask>) => {
    set((state) => ({
      ikAxisMask: {
        ...state.ikAxisMask,
        ...updates
      }
    }));
  }
}));
