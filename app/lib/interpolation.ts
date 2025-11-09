import { Keyframe, JointAngles, JointName, CartesianKeyframe, CartesianPose, CartesianAxis } from './types';
import { JOINT_NAMES, CARTESIAN_AXES } from './constants';
import { getHomePosition } from './positions';

/**
 * Linear interpolation between two values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Get interpolated value for a single joint at a specific time
 */
function getJointValueAtTime(
  keyframes: Keyframe[],
  joint: JointName,
  time: number
): number {
  // Filter keyframes for this specific joint
  const jointKeyframes = keyframes
    .filter(kf => kf.joint === joint)
    .sort((a, b) => a.time - b.time);

  // If no keyframes for this joint, return home position
  if (jointKeyframes.length === 0) {
    return getHomePosition()[joint];
  }

  // If before first keyframe, return first keyframe value
  if (time <= jointKeyframes[0].time) {
    return jointKeyframes[0].value;
  }

  // If after last keyframe, return last keyframe value
  if (time >= jointKeyframes[jointKeyframes.length - 1].time) {
    return jointKeyframes[jointKeyframes.length - 1].value;
  }

  // Find surrounding keyframes
  let before = jointKeyframes[0];
  let after = jointKeyframes[1];

  for (let i = 0; i < jointKeyframes.length - 1; i++) {
    if (time >= jointKeyframes[i].time && time <= jointKeyframes[i + 1].time) {
      before = jointKeyframes[i];
      after = jointKeyframes[i + 1];
      break;
    }
  }

  // Calculate interpolation factor (0 to 1)
  const duration = after.time - before.time;
  const elapsed = time - before.time;
  const t = duration > 0 ? elapsed / duration : 0;

  // Interpolate between the two keyframe values
  return lerp(before.value, after.value, t);
}

/**
 * Get interpolated joint angles at a specific time
 * Each joint is interpolated independently based on its own keyframes
 */
export function getJointAnglesAtTime(
  keyframes: Keyframe[],
  time: number
): JointAngles {
  const result: JointAngles = {} as JointAngles;

  // Interpolate each joint independently
  JOINT_NAMES.forEach((joint) => {
    result[joint] = getJointValueAtTime(keyframes, joint, time);
  });

  return result;
}

/**
 * Calculate total path length (sum of angular distances)
 * For keyframe model, this calculates per-joint motion
 */
export function calculatePathLength(keyframes: Keyframe[]): number {
  if (keyframes.length < 2) return 0;

  let totalDistance = 0;

  // Calculate distance for each joint independently
  JOINT_NAMES.forEach((joint) => {
    const jointKeyframes = keyframes
      .filter(kf => kf.joint === joint)
      .sort((a, b) => a.time - b.time);

    for (let i = 0; i < jointKeyframes.length - 1; i++) {
      const kf1 = jointKeyframes[i];
      const kf2 = jointKeyframes[i + 1];
      totalDistance += Math.abs(kf2.value - kf1.value);
    }
  });

  return totalDistance;
}

/**
 * Get interpolated value for a single cartesian axis at a specific time
 */
function getCartesianValueAtTime(
  keyframes: CartesianKeyframe[],
  axis: CartesianAxis,
  time: number,
  defaultValue: number
): number {
  // Filter keyframes for this specific axis
  const axisKeyframes = keyframes
    .filter(kf => kf.axis === axis)
    .sort((a, b) => a.time - b.time);

  // If no keyframes for this axis, return default value
  if (axisKeyframes.length === 0) {
    return defaultValue;
  }

  // If before first keyframe, return first keyframe value
  if (time <= axisKeyframes[0].time) {
    return axisKeyframes[0].value;
  }

  // If after last keyframe, return last keyframe value
  if (time >= axisKeyframes[axisKeyframes.length - 1].time) {
    return axisKeyframes[axisKeyframes.length - 1].value;
  }

  // Find surrounding keyframes
  let before = axisKeyframes[0];
  let after = axisKeyframes[1];

  for (let i = 0; i < axisKeyframes.length - 1; i++) {
    if (time >= axisKeyframes[i].time && time <= axisKeyframes[i + 1].time) {
      before = axisKeyframes[i];
      after = axisKeyframes[i + 1];
      break;
    }
  }

  // Calculate interpolation factor (0 to 1)
  const duration = after.time - before.time;
  const elapsed = time - before.time;
  const t = duration > 0 ? elapsed / duration : 0;

  // Interpolate between the two keyframe values
  return lerp(before.value, after.value, t);
}

/**
 * Get interpolated cartesian pose at a specific time
 * Each axis is interpolated independently based on its own keyframes
 */
export function getCartesianPoseAtTime(
  keyframes: CartesianKeyframe[],
  time: number
): CartesianPose {
  const result: CartesianPose = {
    X: 0,
    Y: 0,
    Z: 300, // Default height
    RX: 0,
    RY: 0,
    RZ: 0
  };

  // Default values for each axis
  const defaults = { X: 0, Y: 0, Z: 300, RX: 0, RY: 0, RZ: 0 };

  // Interpolate each axis independently
  CARTESIAN_AXES.forEach((axis) => {
    result[axis] = getCartesianValueAtTime(keyframes, axis, time, defaults[axis]);
  });

  return result;
}
