import { useEffect, useRef } from 'react';
import { useTimelineStore } from '@/app/lib/store';
import { getJointAnglesAtTime, getCartesianPoseAtTime } from '@/app/lib/interpolation';
import { inverseKinematicsDetailed } from '@/app/lib/kinematics';
import { DEFAULT_FPS } from '@/app/lib/constants';
import { moveJoints } from '@/app/lib/api';

/**
 * Playback loop hook - runs at 60fps when playing
 */
export function usePlayback() {
  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);
  const executeOnRobot = useTimelineStore((state) => state.playbackState.executeOnRobot);
  const currentTime = useTimelineStore ((state) => state.playbackState.currentTime);
  const startTime = useTimelineStore((state) => state.playbackState.startTime);
  const duration = useTimelineStore((state) => state.timeline.duration);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const cartesianKeyframes = useTimelineStore((state) => state.timeline.cartesianKeyframes);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const targetRobotRef = useTimelineStore((state) => state.targetRobotRef);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);
  const ikAxisMask = useTimelineStore((state) => state.ikAxisMask);
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
  const stop = useTimelineStore((state) => state.stop);

  // Track last time for keyframe crossing detection
  const lastTime = useRef(0);

  useEffect(() => {
    if (!isPlaying || startTime === null) return;

    // Reset lastTime when playback starts
    lastTime.current = 0;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // Convert to seconds

      if (elapsed >= duration) {
        stop();
        return;
      }

      setCurrentTime(elapsed);

      // Keyframe crossing detection (only in joint mode for now)
      if (motionMode === 'joint' && executeOnRobot) {
        // Find all unique keyframe times crossed since last frame
        const uniqueTimes = new Set<number>();
        keyframes.forEach(kf => {
          if (kf.time >= lastTime.current && kf.time <= elapsed) {
            uniqueTimes.add(kf.time);
          }
        });

        // Process each crossed keyframe time
        const sortedTimes = Array.from(uniqueTimes).sort((a, b) => a - b);
        sortedTimes.forEach(time => {
          // Find next keyframe time after this one
          const allKeyframeTimes = [...new Set(keyframes.map(kf => kf.time))];
          const futureKeyframeTimes = allKeyframeTimes.filter(t => t > time);
          const nextKeyframeTime = futureKeyframeTimes.length > 0
            ? Math.min(...futureKeyframeTimes)
            : null;

          if (nextKeyframeTime !== null) {
            // Get joint angles at the NEXT keyframe (not the current one)
            const nextKeyframeAngles = getJointAnglesAtTime(keyframes, nextKeyframeTime);
            const commandDuration = nextKeyframeTime - time;

            // Send move command to NEXT keyframe with duration
            moveJoints(nextKeyframeAngles, undefined, commandDuration).catch(error => {
              console.error('[Playback] Failed to send move command:', error);
            });
          }
        });
      }

      // Update lastTime for next frame
      lastTime.current = elapsed;

      if (motionMode === 'joint') {
        // Joint mode: Interpolate joint angles directly
        const interpolatedAngles = getJointAnglesAtTime(keyframes, elapsed);

        useTimelineStore.setState({ currentJointAngles: interpolatedAngles });
      } else {
        // Cartesian mode: Interpolate pose, then compute IK
        const interpolatedPose = getCartesianPoseAtTime(cartesianKeyframes, elapsed);

        // Update cartesian pose for target visualizer
        useTimelineStore.setState({
          currentCartesianPose: interpolatedPose
        });

        // Compute IK to update robot position (same as manual button)
        if (targetRobotRef) {
          const ikResult = inverseKinematicsDetailed(
            interpolatedPose,
            currentJointAngles,
            targetRobotRef,
            tcpOffset,
            ikAxisMask
          );

          if (ikResult.success && ikResult.jointAngles) {
            // IK succeeded - update robot joint angles
            useTimelineStore.setState({ currentJointAngles: ikResult.jointAngles });
          }
        }
      }
    }, 1000 / DEFAULT_FPS); // 60fps

    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, startTime, duration, motionMode, keyframes, cartesianKeyframes, setCurrentTime, stop, executeOnRobot]);
}
