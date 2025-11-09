/**
 * Timeline Store
 * Timeline editing and playback state
 * Manages keyframes, playback control, and timeline metadata
 */

import { create } from 'zustand';
import type { Keyframe, CartesianKeyframe, Timeline, PlaybackState, MotionMode, JointName, CartesianAxis } from '../types';
import { DEFAULT_DURATION, JOINT_NAMES, CARTESIAN_AXES } from '../constants';
import { v4 as uuidv4 } from 'uuid';

export interface TimelineStore {
  // Timeline data
  timeline: Timeline;

  // Playback state
  playbackState: PlaybackState;

  // Actions - Keyframe management
  addKeyframe: (time: number, joint: JointName, value: number) => void;
  removeKeyframe: (id: string) => void;
  updateKeyframe: (id: string, updates: Partial<Keyframe>) => void;
  recordKeyframes: () => void;

  // Actions - Cartesian keyframe management
  addCartesianKeyframe: (time: number, axis: CartesianAxis, value: number) => void;
  removeCartesianKeyframe: (id: string) => void;
  updateCartesianKeyframe: (id: string, updates: Partial<CartesianKeyframe>) => void;
  recordCartesianKeyframes: () => void;

  // Actions - Playback control
  setCurrentTime: (time: number) => void;
  play: (executeOnRobot?: boolean) => void;
  pause: () => void;
  stop: () => void;

  // Actions - Timeline management
  setMotionMode: (mode: MotionMode) => void;
  loadTimeline: (timeline: Timeline) => void;
  exportTimeline: () => string;
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  // Initial state
  timeline: {
    name: 'Untitled',
    mode: 'joint',
    keyframes: [],
    cartesianKeyframes: [],
    duration: DEFAULT_DURATION
  },

  playbackState: {
    isPlaying: false,
    currentTime: 0,
    startTime: null,
    loop: false,
    executeOnRobot: false
  },

  // Keyframe management actions
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
          .map((kf) => (kf.id === id ? { ...kf, ...updates } : kf))
          .sort((a, b) => a.time - b.time) // Re-sort if time was updated
      }
    }));
  },

  recordKeyframes: () => {
    const state = get();
    const currentTime = state.playbackState.currentTime;

    // Import inputStore to get current joint angles
    // Note: This will be handled by components that call this action
    // They should read from inputStore and pass values
    // For now, we'll import the command store
    import('./commandStore').then(({ useCommandStore }) => {
      const commandedJointAngles = useCommandStore.getState().commandedJointAngles;

      // Record 6 separate keyframes (one per joint) at current time
      JOINT_NAMES.forEach((joint) => {
        state.addKeyframe(currentTime, joint, commandedJointAngles[joint]);
      });
    });
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
          .map((kf) => (kf.id === id ? { ...kf, ...updates } : kf))
          .sort((a, b) => a.time - b.time)
      }
    }));
  },

  recordCartesianKeyframes: () => {
    const state = get();
    const currentTime = state.playbackState.currentTime;

    // Import inputStore to get current cartesian pose
    import('./inputStore').then(({ useInputStore }) => {
      const inputCartesianPose = useInputStore.getState().inputCartesianPose;

      // Record 6 separate cartesian keyframes (one per axis) at current time
      CARTESIAN_AXES.forEach((axis) => {
        state.addCartesianKeyframe(currentTime, axis, inputCartesianPose[axis]);
      });
    });
  },

  // Playback control actions
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
        loop: false,
        executeOnRobot: false
      }
    });
  },

  // Timeline management
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
        loop: false,
        executeOnRobot: false
      }
    }));
  },

  loadTimeline: (timeline) => {
    set({ timeline });
  },

  exportTimeline: () => {
    return JSON.stringify(get().timeline, null, 2);
  }
}));
