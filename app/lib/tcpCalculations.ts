/**
 * TCP (Tool Center Point) calculation utilities
 * Extracted to eliminate code duplication across TargetTCPVisualizer, ActualTCPVisualizer, and kinematics
 */

import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import { CartesianPose } from './types';
import { ORIENTATION_CONFIG } from './constants';

export interface TCPOffset {
  x: number;
  y: number;
  z: number;
}

/**
 * Calculate TCP pose from URDF robot model
 *
 * This function extracts the world position and orientation of the L6 link,
 * applies the TCP offset, and transforms the coordinates to match the robot's
 * coordinate system conventions.
 *
 * @param urdfRobot - The URDF robot instance
 * @param tcpOffset - TCP offset in mm (relative to L6 flange)
 * @returns CartesianPose with X,Y,Z in mm and RX,RY,RZ in degrees, or null if calculation fails
 */
export function calculateTcpPoseFromUrdf(
  urdfRobot: URDFRobot,
  tcpOffset: TCPOffset
): CartesianPose | null {
  try {
    // Get L6 link from URDF robot (the last link before TCP)
    const l6Link = urdfRobot.links['L6'];
    if (!l6Link) return null;

    // Update world matrix to ensure transforms are current
    l6Link.updateMatrixWorld(true);

    // Get world position of L6 link
    const l6WorldPosition = new THREE.Vector3();
    l6Link.getWorldPosition(l6WorldPosition);

    // Get world rotation
    const l6WorldQuaternion = new THREE.Quaternion();
    l6Link.getWorldQuaternion(l6WorldQuaternion);

    // Apply TCP offset in L6's local coordinate frame
    // Convert mm to meters
    const localOffset = new THREE.Vector3(
      tcpOffset.x / 1000,
      tcpOffset.y / 1000,
      tcpOffset.z / 1000
    );

    // Transform offset from L6 local space to world space
    const worldOffset = localOffset.applyQuaternion(l6WorldQuaternion);

    // Final TCP position = L6 position + transformed offset
    const tcpWorldPosition = l6WorldPosition.add(worldOffset);

    // Transform orientation from world frame to viewport frame (if enabled)
    // The robot parent has rotation={[-Math.PI/2, 0, 0]} (rotated -90° around X)
    let quaternionToUse = l6WorldQuaternion;

    if (ORIENTATION_CONFIG.applyQuaternionTransform) {
      // Apply inverse of parent rotation to undo coordinate frame transformation
      const parentRotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ')  // The actual parent rotation
      );
      const parentRotationInverse = parentRotation.clone().invert();
      quaternionToUse = parentRotationInverse.clone().multiply(l6WorldQuaternion);
    }

    // Extract Euler angles using configured order
    const euler = new THREE.Euler().setFromQuaternion(
      quaternionToUse,
      ORIENTATION_CONFIG.eulerOrder
    );

    // Apply orientation offset and negation
    const rx_raw = (euler.x * 180) / Math.PI;
    const ry_raw = (euler.y * 180) / Math.PI;
    const rz_raw = (euler.z * 180) / Math.PI;

    // Apply offset, then apply negation
    const rx_final = (ORIENTATION_CONFIG.negateRX ? -1 : 1) * (rx_raw - ORIENTATION_CONFIG.offset.RX);
    const ry_final = (ORIENTATION_CONFIG.negateRY ? -1 : 1) * (ry_raw - ORIENTATION_CONFIG.offset.RY);
    const rz_final = (ORIENTATION_CONFIG.negateRZ ? -1 : 1) * (rz_raw - ORIENTATION_CONFIG.offset.RZ);

    // Build final pose with coordinate transformations
    return {
      X: tcpWorldPosition.x * 1000,      // X stays the same
      Y: -tcpWorldPosition.z * 1000,     // Y = -Z (swap and negate)
      Z: tcpWorldPosition.y * 1000,      // Z = Y (swap)
      RX: rx_final,
      RY: ry_final,
      RZ: rz_final
    };
  } catch (error) {
    // Return null on any error (e.g., during URDF loading)
    return null;
  }
}

/**
 * Check if two TCP poses are significantly different
 *
 * @param pose1 - First pose
 * @param pose2 - Second pose
 * @param tolerance - Threshold for change (default: 0.01mm / 0.01°)
 * @returns true if poses differ by more than tolerance
 */
export function tcpPosesAreDifferent(
  pose1: CartesianPose | null,
  pose2: CartesianPose | null,
  tolerance: number = 0.01
): boolean {
  if (!pose1 || !pose2) return true;

  return (
    Math.abs(pose1.X - pose2.X) > tolerance ||
    Math.abs(pose1.Y - pose2.Y) > tolerance ||
    Math.abs(pose1.Z - pose2.Z) > tolerance ||
    Math.abs(pose1.RX - pose2.RX) > tolerance ||
    Math.abs(pose1.RY - pose2.RY) > tolerance ||
    Math.abs(pose1.RZ - pose2.RZ) > tolerance
  );
}
