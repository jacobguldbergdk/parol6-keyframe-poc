/**
 * usePrePlaybackPosition Hook
 *
 * Ensures robot is at t=0 keyframe position before starting execute playback.
 * Moves robot to start position at 50% speed if not already there.
 */

import { useState, useRef } from 'react';
import { useTimelineStore } from '../lib/store';
import { JointAngles } from '../lib/types';
import { moveJoints } from '../lib/api';
import { getJointAnglesAtTime } from '../lib/interpolation';
import { JOINT_NAMES } from '../lib/constants';

const POSITION_TOLERANCE_DEGREES = 0.1; // 0.1 degree tolerance
const MOVE_SPEED_PERCENTAGE = 50; // Fixed 50% speed for pre-move
const POLL_INTERVAL_MS = 100; // Check position every 100ms
const TIMEOUT_MS = 60000; // 60 second safety timeout

/**
 * Check if actual position matches target within tolerance
 */
function isAtPosition(actual: JointAngles, target: JointAngles, tolerance: number): boolean {
  return JOINT_NAMES.every(joint =>
    Math.abs(actual[joint] - target[joint]) <= tolerance
  );
}

export function usePrePlaybackPosition() {
  const [isMovingToStart, setIsMovingToStart] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const actualJointAngles = useTimelineStore((state) => state.actualJointAngles);
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const play = useTimelineStore((state) => state.play);

  /**
   * Clear all timers
   */
  const clearTimers = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  /**
   * Move to start position and then start playback
   */
  const moveToStartAndPlay = async () => {
    // Only works in joint mode for now
    if (motionMode !== 'joint') {
      console.error('[PrePlayback] Cartesian mode not yet supported for pre-playback positioning');
      setMoveError('Pre-playback positioning only works in joint mode');
      return;
    }

    // Check if robot is connected
    if (!actualJointAngles) {
      console.error('[PrePlayback] Robot not connected - cannot execute playback');
      setMoveError('Robot not connected. Please connect robot before executing playback.');
      return;
    }

    // Get t=0 target position
    if (keyframes.length === 0) {
      console.error('[PrePlayback] No keyframes found');
      setMoveError('No keyframes to play');
      return;
    }

    const targetPosition = getJointAnglesAtTime(keyframes, 0);

    // Check if already at position
    if (isAtPosition(actualJointAngles, targetPosition, POSITION_TOLERANCE_DEGREES)) {
      play(true);
      return;
    }

    // Start moving to position
    setIsMovingToStart(true);
    setMoveError(null);

    try {
      // Send move command at 50% speed
      const result = await moveJoints(targetPosition, MOVE_SPEED_PERCENTAGE);

      if (!result.success) {
        throw new Error(result.error || 'Move command failed');
      }

      // Poll for position arrival
      return new Promise<void>((resolve, reject) => {
        let startTime = Date.now();

        // Set timeout
        timeoutRef.current = setTimeout(() => {
          clearTimers();
          const error = 'Timeout waiting for robot to reach start position (60s)';
          console.error('[PrePlayback]', error);
          setMoveError(error);
          setIsMovingToStart(false);
          reject(new Error(error));
        }, TIMEOUT_MS);

        // Poll actual position
        pollIntervalRef.current = setInterval(() => {
          const currentActual = useTimelineStore.getState().actualJointAngles;

          if (!currentActual) {
            clearTimers();
            const error = 'Lost connection to robot during pre-move';
            console.error('[PrePlayback]', error);
            setMoveError(error);
            setIsMovingToStart(false);
            reject(new Error(error));
            return;
          }

          // Check if at position
          if (isAtPosition(currentActual, targetPosition, POSITION_TOLERANCE_DEGREES)) {
            clearTimers();
            setIsMovingToStart(false);

            // Start playback
            play(true);
            resolve();
          }
        }, POLL_INTERVAL_MS);
      });

    } catch (error) {
      clearTimers();
      const errorMsg = error instanceof Error ? error.message : 'Unknown error during pre-move';
      console.error('[PrePlayback] Error:', errorMsg);
      setMoveError(errorMsg);
      setIsMovingToStart(false);
    }
  };

  return {
    moveToStartAndPlay,
    isMovingToStart,
    moveError,
    clearError: () => setMoveError(null)
  };
}
