import { create } from 'zustand';
import { TimelineStore, Keyframe, CartesianKeyframe, Timeline, PlaybackState, JointAngles, CartesianPose, JointName, CartesianAxis, MotionMode, IkAxisMask, IOStatus, GripperStatus, RobotStatus, ConnectionStatus } from './types';
import { DEFAULT_DURATION, JOINT_NAMES, CARTESIAN_AXES } from './constants';
import { getHomePosition } from './positions';
import { v4 as uuidv4 } from 'uuid';

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  // Initial state
  timeline: {
    name: 'Untitled',
    mode: 'joint' as MotionMode,
    keyframes: [],
    cartesianKeyframes: [],
    duration: DEFAULT_DURATION
  },
  currentJointAngles: getHomePosition(),
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
    loop: false,
    executeOnRobot: false  // Controls whether to send commands to actual robot during playback
  },

  // URDF robot references (set by URDFRobot component)
  targetRobotRef: null as any,  // Target colored robot (commanded/target position)
  actualRobotRef: null as any, // Actual robot (hardware feedback/actual position)

  // TCP (Tool Center Point) offset from J6 reference frame (in millimeters)
  // User-adjustable to match different tools
  tcpOffset: { x: 47, y: 0, z: -62 } as { x: number; y: number; z: number },

  // IK axis mask - selectively enable/disable axes during IK solving
  // Default: Full 6DoF (all axes enabled)
  ikAxisMask: { X: true, Y: true, Z: true, RX: true, RY: true, RZ: true } as IkAxisMask,

  // Target TCP position from target robot URDF (commanded position, updated by TargetTCPVisualizer)
  targetTcpPosition: null as { X: number; Y: number; Z: number; RX: number; RY: number; RZ: number } | null,

  // Actual TCP position from actual robot URDF (hardware feedback, updated by ActualTCPVisualizer)
  actualTcpPosition: null as { X: number; Y: number; Z: number; RX: number; RY: number; RZ: number } | null,

  // Hardware feedback from WebSocket
  actualJointAngles: null as JointAngles | null,
  actualCartesianPose: null as CartesianPose | null,
  ioStatus: null as IOStatus | null,
  gripperStatus: null as GripperStatus | null,
  robotStatus: null as RobotStatus | null,
  connectionStatus: 'disconnected' as ConnectionStatus,

  // UI state
  selectedJoint: null as JointName | null,
  setSelectedJoint: (joint) => set({ selectedJoint: joint }),
  showActualRobot: true,
  setShowActualRobot: (show) => set({ showActualRobot: show }),
  showTargetRobot: true,
  setShowTargetRobot: (show) => set({ showTargetRobot: show }),
  stepAngle: 1.0, // Default step angle in degrees for keyboard and slider step buttons
  setStepAngle: (angle) => set({ stepAngle: angle }),
  jointHomedStatus: {
    J1: false,
    J2: false,
    J3: false,
    J4: false,
    J5: false,
    J6: false
  },
  setJointHomed: (joint, homed) => set((state) => ({
    jointHomedStatus: {
      ...state.jointHomedStatus,
      [joint]: homed
    }
  })),

  // Robot following modes (mutually exclusive)
  targetFollowsActual: false, // Target robot mirrors actual robot (teaching mode)
  actualFollowsTarget: false, // Send commands when target changes (live control mode)
  setTargetFollowsActual: (follows) => set((state) => ({
    targetFollowsActual: follows,
    // Disable the other mode if enabling this one
    actualFollowsTarget: follows ? false : state.actualFollowsTarget
  })),
  setActualFollowsTarget: (follows) => set((state) => ({
    actualFollowsTarget: follows,
    // Disable the other mode if enabling this one
    targetFollowsActual: follows ? false : state.targetFollowsActual
  })),

  // Movement parameters (speed/accel from UI controls)
  speed: 80, // Speed percentage (0-100)
  accel: 60, // Acceleration percentage (0-100)
  setSpeed: (speed) => set({ speed }),
  setAccel: (accel) => set({ accel }),

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
  },

  setCurrentTime: (time) => {
    set((state) => ({
      playbackState: {
        ...state.playbackState,
        currentTime: time
      }
    }));
  },

  play: (executeOnRobot = false) => {
    set((state) => ({
      playbackState: {
        ...state.playbackState,
        isPlaying: true,
        executeOnRobot,
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
      },
      // Auto-enable target robot when slider is moved
      showTargetRobot: true
    }));
  },

  // Motion mode actions
  setMotionMode: (mode) => {
    const state = get();

    // Stop playback before mode switch
    if (state.playbackState.isPlaying) {
      state.stop();
    }


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
  },

  // Hardware feedback actions (from WebSocket)
  setActualJointAngles: (angles) => {
    set({ actualJointAngles: angles });
  },

  setActualCartesianPose: (pose) => {
    set({ actualCartesianPose: pose });
  },

  setIOStatus: (status) => {
    set({ ioStatus: status });
  },

  setGripperStatus: (status) => {
    set({ gripperStatus: status });
  },

  setRobotStatus: (status) => {
    set({ robotStatus: status });
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  }
}));

// Note: Previously synced currentCartesianPose with targetTcpPosition
// This is no longer needed - "Move to Target" buttons now use targetTcpPosition directly
// currentCartesianPose is only for cartesian slider user input (shown via red gizmo)
