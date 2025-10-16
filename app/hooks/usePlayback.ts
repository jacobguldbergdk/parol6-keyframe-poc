import { useEffect } from 'react';
import { useTimelineStore } from '@/app/lib/store';
import { getJointAnglesAtTime, getCartesianPoseAtTime } from '@/app/lib/interpolation';
import { inverseKinematicsDetailed } from '@/app/lib/kinematics';
import { DEFAULT_FPS } from '@/app/lib/constants';

/**
 * Playback loop hook - runs at 60fps when playing
 */
export function usePlayback() {
  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);
  const currentTime = useTimelineStore ((state) => state.playbackState.currentTime);
  const startTime = useTimelineStore((state) => state.playbackState.startTime);
  const duration = useTimelineStore((state) => state.timeline.duration);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const cartesianKeyframes = useTimelineStore((state) => state.timeline.cartesianKeyframes);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const urdfRobotRef = useTimelineStore((state) => state.urdfRobotRef);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);
  const ikAxisMask = useTimelineStore((state) => state.ikAxisMask);
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
  const stop = useTimelineStore((state) => state.stop);

  useEffect(() => {
    if (!isPlaying || startTime === null) return;

    if (motionMode === 'joint') {
      console.log('▶️  PLAYBACK STARTED (Joint mode) with keyframes:', {
        totalKeyframes: keyframes.length,
        keyframesByJoint: keyframes.reduce((acc, kf) => {
          if (!acc[kf.joint]) acc[kf.joint] = [];
          acc[kf.joint].push(`${kf.time.toFixed(2)}s`);
          return acc;
        }, {} as Record<string, string[]>)
      });
    } else {
      console.log('▶️  PLAYBACK STARTED (Cartesian mode) with keyframes:', {
        totalKeyframes: cartesianKeyframes.length,
        keyframesByAxis: cartesianKeyframes.reduce((acc, kf) => {
          if (!acc[kf.axis]) acc[kf.axis] = [];
          acc[kf.axis].push(`${kf.time.toFixed(2)}s`);
          return acc;
        }, {} as Record<string, string[]>)
      });
    }

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // Convert to seconds

      if (elapsed >= duration) {
        stop();
        return;
      }

      setCurrentTime(elapsed);

      if (motionMode === 'joint') {
        // Joint mode: Interpolate joint angles directly
        const interpolatedAngles = getJointAnglesAtTime(keyframes, elapsed);

        // Log interpolation every second (to avoid spam)
        if (Math.floor(elapsed * 10) % 10 === 0) {
          console.log('🎬 INTERPOLATING (Joint) at', elapsed.toFixed(2) + 's:', {
            keyframesUsed: keyframes.length,
            angles: Object.entries(interpolatedAngles).map(([joint, angle]) =>
              `${joint}: ${angle.toFixed(1)}°`
            ).join(', ')
          });
        }

        useTimelineStore.setState({ currentJointAngles: interpolatedAngles });
      } else {
        // Cartesian mode: Interpolate pose, then compute IK
        const interpolatedPose = getCartesianPoseAtTime(cartesianKeyframes, elapsed);

        // Log interpolation every second (to avoid spam)
        if (Math.floor(elapsed * 10) % 10 === 0) {
          console.log('🎬 INTERPOLATING (Cartesian) at', elapsed.toFixed(2) + 's:', {
            keyframesUsed: cartesianKeyframes.length,
            position: `X:${interpolatedPose.X.toFixed(1)} Y:${interpolatedPose.Y.toFixed(1)} Z:${interpolatedPose.Z.toFixed(1)}`,
            orientation: `RX:${interpolatedPose.RX.toFixed(1)}° RY:${interpolatedPose.RY.toFixed(1)}° RZ:${interpolatedPose.RZ.toFixed(1)}°`
          });
        }

        // Update cartesian pose for target visualizer
        useTimelineStore.setState({
          currentCartesianPose: interpolatedPose
        });

        // Compute IK to update robot position (same as manual button)
        if (urdfRobotRef) {
          const ikResult = inverseKinematicsDetailed(
            interpolatedPose,
            currentJointAngles,
            urdfRobotRef,
            tcpOffset,
            ikAxisMask
          );

          if (ikResult.success && ikResult.jointAngles) {
            // IK succeeded - update robot joint angles
            useTimelineStore.setState({ currentJointAngles: ikResult.jointAngles });
          } else {
            // IK failed - log warning but continue playback with last valid position
            if (Math.floor(elapsed * 10) % 10 === 0) {
              console.warn('⚠️  PLAYBACK (Cartesian): IK failed at', elapsed.toFixed(2) + 's:', ikResult.error?.message);
            }
          }
        } else {
          // URDF not loaded yet - log once
          if (Math.floor(elapsed * 10) % 10 === 0) {
            console.warn('⚠️  PLAYBACK (Cartesian): URDF robot not loaded yet');
          }
        }
      }
    }, 1000 / DEFAULT_FPS); // 60fps

    return () => {
      console.log('⏹️  PLAYBACK STOPPED');
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, startTime, duration, motionMode, keyframes, cartesianKeyframes, setCurrentTime, stop]);
}
