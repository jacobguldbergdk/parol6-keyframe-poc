import { useEffect } from 'react';
import { useTimelineStore } from '@/app/lib/store';
import { getJointAnglesAtTime, getCartesianPoseAtTime } from '@/app/lib/interpolation';
import { inverseKinematicsDetailed } from '@/app/lib/kinematics';

/**
 * Scrubbing hook - updates robot position when timeline playhead is dragged
 * Only active when NOT playing (playback handles updates during play)
 */
export function useScrubbing() {
  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);
  const currentTime = useTimelineStore((state) => state.playbackState.currentTime);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const cartesianKeyframes = useTimelineStore((state) => state.timeline.cartesianKeyframes);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const urdfRobotRef = useTimelineStore((state) => state.urdfRobotRef);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);
  const ikAxisMask = useTimelineStore((state) => state.ikAxisMask);

  useEffect(() => {
    // Skip if actively playing (usePlayback handles interpolation)
    if (isPlaying) return;

    console.log('🎯 SCRUBBING:', motionMode, 'mode at', currentTime.toFixed(2) + 's');

    if (motionMode === 'joint') {
      // Joint mode: Interpolate joint angles directly
      const interpolatedAngles = getJointAnglesAtTime(keyframes, currentTime);

      console.log('🎯 SCRUBBING (Joint): Updated angles:', {
        angles: Object.entries(interpolatedAngles).map(([joint, angle]) =>
          `${joint}: ${angle.toFixed(1)}°`
        ).join(', ')
      });

      useTimelineStore.setState({ currentJointAngles: interpolatedAngles });
    } else {
      // Cartesian mode: Interpolate pose, then compute IK
      const interpolatedPose = getCartesianPoseAtTime(cartesianKeyframes, currentTime);

      console.log('🎯 SCRUBBING (Cartesian): Target pose at', currentTime.toFixed(2) + 's:', {
        position: `X:${interpolatedPose.X.toFixed(1)} Y:${interpolatedPose.Y.toFixed(1)} Z:${interpolatedPose.Z.toFixed(1)}`,
        orientation: `RX:${interpolatedPose.RX.toFixed(1)}° RY:${interpolatedPose.RY.toFixed(1)}° RZ:${interpolatedPose.RZ.toFixed(1)}°`
      });

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
          console.log('🎯 SCRUBBING (Cartesian): IK success, updated joint angles');
          useTimelineStore.setState({ currentJointAngles: ikResult.jointAngles });
        } else {
          // IK failed - log warning but keep last valid position
          console.warn('⚠️  SCRUBBING (Cartesian): IK failed:', ikResult.error?.message);
        }
      } else {
        console.warn('⚠️  SCRUBBING (Cartesian): URDF robot not loaded yet');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, keyframes, cartesianKeyframes, motionMode, isPlaying]);
}
