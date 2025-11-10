import { useEffect } from 'react';
import { useTimelineStore } from '@/app/lib/stores/timelineStore';
import { useCommandStore } from '@/app/lib/stores/commandStore';
import { useRobotConfigStore } from '@/app/lib/stores/robotConfigStore';
import { useInputStore } from '@/app/lib/stores/inputStore';
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
  const commandedJointAngles = useCommandStore((state) => state.commandedJointAngles);
  const targetRobotRef = useCommandStore((state) => state.targetRobotRef);
  const tcpOffset = useRobotConfigStore((state) => state.tcpOffset);
  const ikAxisMask = useRobotConfigStore((state) => state.ikAxisMask);

  useEffect(() => {
    // Skip if actively playing (usePlayback handles interpolation)
    if (isPlaying) return;


    if (motionMode === 'joint') {
      // Joint mode: Interpolate joint angles directly
      const interpolatedAngles = getJointAnglesAtTime(keyframes, currentTime);

      useCommandStore.setState({ commandedJointAngles: interpolatedAngles });
    } else {
      // Cartesian mode: Interpolate pose, then compute IK
      const interpolatedPose = getCartesianPoseAtTime(cartesianKeyframes, currentTime);

      // Update cartesian pose for target visualizer
      useInputStore.setState({
        inputCartesianPose: interpolatedPose
      });

      // Compute IK to update robot position (same as manual button)
      if (targetRobotRef) {
        const ikResult = inverseKinematicsDetailed(
          interpolatedPose,
          commandedJointAngles,
          targetRobotRef,
          tcpOffset,
          ikAxisMask
        );

        if (ikResult.success && ikResult.jointAngles) {
          // IK succeeded - update robot joint angles
          useCommandStore.setState({ commandedJointAngles: ikResult.jointAngles });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, keyframes, cartesianKeyframes, motionMode, isPlaying]);
}
