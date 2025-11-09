/**
 * useActualFollowsTarget Hook
 *
 * Implements "Live Control Mode" - automatically sends move commands to the robot
 * whenever the target joint angles are changed in the UI.
 *
 * Features:
 * - Debounced command sending (500ms) to avoid spamming the API
 * - Tracks change source to prevent feedback loops
 * - Only active when actualFollowsTarget is enabled
 * - Uses speed from UI slider (no duration - robot calculates based on speed)
 */

import { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '../lib/store';
import { JointAngles } from '../lib/types';
import { getApiBaseUrl } from '../lib/apiConfig';

export function useActualFollowsTarget() {
  const actualFollowsTarget = useTimelineStore((state) => state.actualFollowsTarget);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const speed = useTimelineStore((state) => state.speed);
  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);

  // Track the last angles we sent to avoid sending duplicates
  const lastSentAngles = useRef<JointAngles | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    // Skip during playback - playback handles its own command sending
    if (isPlaying) {
      return;
    }

    // Only proceed if live control mode is enabled
    if (!actualFollowsTarget) {
      return;
    }

    // Check if angles have actually changed
    if (lastSentAngles.current &&
        JSON.stringify(currentJointAngles) === JSON.stringify(lastSentAngles.current)) {
      return;
    }

    // Clear any existing debounce timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set up new debounced command
    debounceTimer.current = setTimeout(async () => {
      try {
        setIsSending(true);

        // Convert to array format for API
        const angles = [
          currentJointAngles.J1,
          currentJointAngles.J2,
          currentJointAngles.J3,
          currentJointAngles.J4,
          currentJointAngles.J5,
          currentJointAngles.J6,
        ];

        // Use speed from UI slider (no duration - let robot calculate based on speed)
        const speedPercentage = speed;

        // Send move command to API
        // Note: Only send speed_percentage, NOT duration
        // Duration would override speed and make the slider useless
        const response = await fetch(`${getApiBaseUrl()}/api/robot/move/joints`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            angles,
            speed_percentage: speedPercentage,
            wait_for_ack: false, // Non-blocking
            timeout: 10.0,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('[Live Control] Move command failed:', error);
          return;
        }

        const result = await response.json();

        // Update last sent angles
        lastSentAngles.current = { ...currentJointAngles };

      } catch (error) {
        console.error('[Live Control] Error sending move command:', error);
      } finally {
        setIsSending(false);
      }
    }, 500); // 500ms debounce

    // Cleanup on unmount or when dependencies change
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [actualFollowsTarget, currentJointAngles, speed, isPlaying]);

  // Reset last sent angles when mode is disabled
  useEffect(() => {
    if (!actualFollowsTarget) {
      lastSentAngles.current = null;
    }
  }, [actualFollowsTarget]);

  return {
    isSending,
    isActive: actualFollowsTarget,
  };
}
