/**
 * API client for PAROL6 backend services
 */

import { CartesianPose, JointAngles, IkAxisMask } from './types';
import { getApiBaseUrl } from './apiConfig';
import { ORIENTATION_CONFIG } from './constants';

export interface IKResult {
  success: boolean;
  joints?: JointAngles;
  error?: string;
  iterations?: number;
  residual?: number;
  source: 'frontend' | 'backend';
}

/**
 * Convert frontend UI coordinates to backend coordinate system
 *
 * Frontend applies transformations when extracting from URDF:
 * - X = URDF.x * 1000
 * - Y = -URDF.z * 1000
 * - Z = URDF.y * 1000
 * - RX = -raw_rx
 * - RY = -raw_ry + 90
 * - RZ = raw_rz + 180
 *
 * This function reverses those transformations for backend commands
 */
function frontendToBackendCoordinates(frontendPose: CartesianPose): number[] {
  // Reverse position transformations
  const backendX = frontendPose.X / 1000;
  const backendY = frontendPose.Z / 1000;
  const backendZ = -frontendPose.Y / 1000;

  // Reverse orientation transformations
  const backendRX = -frontendPose.RX;
  const backendRY = ORIENTATION_CONFIG.offset.RY - frontendPose.RY;  // 90 - RY
  const backendRZ = frontendPose.RZ - ORIENTATION_CONFIG.offset.RZ;  // RZ - (-180) = RZ + 180

  return [
    backendX * 1000,  // Convert back to mm for backend
    backendY * 1000,
    backendZ * 1000,
    backendRX,
    backendRY,
    backendRZ
  ];
}

/**
 * Call backend IK solver
 *
 * Uses the same IK implementation as the actual robot controller,
 * ensuring consistency between visualization and execution.
 */
export async function solveIKBackend(
  targetPose: CartesianPose,
  currentJoints: JointAngles,
  axisMask?: IKAxisMask,
  targetRobotRef?: any,
  tcpOffset?: { x: number; y: number; z: number }
): Promise<IKResult> {
  try {
    // Convert CartesianPose to array format expected by backend
    const targetPoseArray = [
      targetPose.X,
      targetPose.Y,
      targetPose.Z,
      targetPose.RX,
      targetPose.RY,
      targetPose.RZ
    ];

    // Convert JointAngles to array
    const currentJointsArray = [
      currentJoints.J1,
      currentJoints.J2,
      currentJoints.J3,
      currentJoints.J4,
      currentJoints.J5,
      currentJoints.J6
    ];

    // Convert axis mask to array (if provided)
    const axisMaskArray = axisMask ? [
      axisMask.X ? 1 : 0,
      axisMask.Y ? 1 : 0,
      axisMask.Z ? 1 : 0,
      axisMask.RX ? 1 : 0,
      axisMask.RY ? 1 : 0,
      axisMask.RZ ? 1 : 0
    ] : undefined;

    // Extract quaternion from target robot URDF (preferred over Euler angles)
    let targetQuaternion: number[] | undefined = undefined;
    if (targetRobotRef) {
      try {
        const THREE = await import('three');
        const { ORIENTATION_CONFIG } = await import('./constants');

        const l6Link = targetRobotRef.links['L6'];
        if (l6Link) {
          // Update world matrix to ensure transforms are current
          l6Link.updateMatrixWorld(true);

          // Get world quaternion
          const l6WorldQuaternion = new THREE.Quaternion();
          l6Link.getWorldQuaternion(l6WorldQuaternion);

          // Apply parent rotation inverse if enabled (same as TargetTCPVisualizer)
          let quaternionToUse = l6WorldQuaternion;
          if (ORIENTATION_CONFIG.applyQuaternionTransform) {
            const parentRotation = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ')
            );
            const parentRotationInverse = parentRotation.clone().invert();
            quaternionToUse = parentRotationInverse.clone().multiply(l6WorldQuaternion);
          }

          // Extract [w, x, y, z] for backend
          targetQuaternion = [
            quaternionToUse.w,
            quaternionToUse.x,
            quaternionToUse.y,
            quaternionToUse.z
          ];
        }
      } catch (error) {
        // Quaternion extraction failed, will use Euler angles
      }
    }

    // Call backend API
    const response = await fetch(`${getApiBaseUrl()}/api/ik`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target_pose: targetPoseArray,
        target_quaternion: targetQuaternion,  // Send quaternion if available
        current_joints: currentJointsArray,
        axis_mask: axisMaskArray
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend IK request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success && data.joints) {
      // Convert array back to JointAngles
      const joints: JointAngles = {
        J1: data.joints[0],
        J2: data.joints[1],
        J3: data.joints[2],
        J4: data.joints[3],
        J5: data.joints[4],
        J6: data.joints[5]
      };

      return {
        success: true,
        joints,
        error: undefined,
        iterations: data.iterations,
        residual: data.residual,
        source: 'backend'
      };
    } else {
      return {
        success: false,
        error: data.error || 'IK solution failed',
        iterations: data.iterations,
        source: 'backend'
      };
    }

  } catch (error) {
    console.error('Backend IK error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      source: 'backend'
    };
  }
}

/**
 * Check if backend API is reachable
 */
export async function checkBackendConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Move robot joints to specified angles
 */
export async function moveJoints(
  angles: JointAngles,
  speedPercentage?: number,
  duration?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const anglesArray = [angles.J1, angles.J2, angles.J3, angles.J4, angles.J5, angles.J6];

    // Build request body with either speed_percentage OR duration (mutually exclusive)
    const requestBody: any = {
      angles: anglesArray
    };

    if (duration !== undefined) {
      requestBody.duration = duration;
    } else if (speedPercentage !== undefined) {
      requestBody.speed_percentage = speedPercentage;
    } else {
      throw new Error('Must provide either speedPercentage or duration');
    }

    const response = await fetch(`${getApiBaseUrl()}/api/robot/move/joints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Move joints failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true };
  } catch (error) {
    console.error('Move joints error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Move robot to pose (joint-interpolated motion, curved path)
 */
export async function movePose(
  pose: CartesianPose,
  speedPercentage: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Convert frontend UI coordinates to backend coordinate system
    const poseArray = frontendToBackendCoordinates(pose);

    const response = await fetch(`${getApiBaseUrl()}/api/robot/move/pose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pose: poseArray,
        speed_percentage: speedPercentage
      })
    });

    if (!response.ok) {
      throw new Error(`Move pose failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true };
  } catch (error) {
    console.error('Move pose error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Move robot to pose (cartesian straight-line motion)
 */
export async function moveCartesian(
  pose: CartesianPose,
  speedPercentage: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Convert frontend UI coordinates to backend coordinate system
    const poseArray = frontendToBackendCoordinates(pose);

    const response = await fetch(`${getApiBaseUrl()}/api/robot/move/cartesian`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pose: poseArray,
        speed_percentage: speedPercentage
      })
    });

    if (!response.ok) {
      throw new Error(`Move cartesian failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true };
  } catch (error) {
    console.error('Move cartesian error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
