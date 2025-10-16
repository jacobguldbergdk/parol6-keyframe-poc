import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTimelineStore } from '@/app/lib/store';
import { ORIENTATION_CONFIG } from '@/app/lib/constants';

/**
 * Visualizes the ACTUAL TCP position extracted from URDF model
 * This shows where the robot currently IS (as opposed to TargetPoseVisualizer showing where we WANT it to go)
 * On successful IK, this should perfectly overlap with the target gizmo
 *
 * IMPORTANT: Gets TCP position from URDF L6 link's world transform (accurate through all 6 joints)
 * NOT from simplified FK calculation (which was inaccurate)
 */
export default function ActualTCPVisualizer() {
  const groupRef = useRef<THREE.Group>(null);
  const xArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const yArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const zArrowRef = useRef<THREE.ArrowHelper | null>(null);

  const urdfRobotRef = useTimelineStore((state) => state.urdfRobotRef);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);

  // Create arrows on mount with distinct styling
  useEffect(() => {
    if (!groupRef.current) return;

    // Slightly smaller arrows than target (40mm vs 50mm)
    const arrowLength = 0.04;
    const arrowHeadLength = arrowLength * 0.2;
    const arrowHeadWidth = arrowLength * 0.15;

    // Dimmer colors to distinguish from target
    // Target uses: 0xff0000 (bright red), 0x00ff00 (bright green), 0x0000ff (bright blue)
    // Actual uses: orange, cyan, magenta (easier to see when overlapping)

    // X axis - Orange (swapped: now points in negative Z direction)
    xArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),  // X arrow points in negative Z direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xff8800, // Orange
      arrowHeadLength,
      arrowHeadWidth
    );

    // Y axis - Cyan (labeled Y, flipped direction)
    yArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),  // Flipped: negated Y direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x00dddd, // Cyan
      arrowHeadLength,
      arrowHeadWidth
    );

    // Z axis - Fuchsia (swapped: now points in negative X direction)
    zArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),  // Z arrow points in negative X direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xdd00dd, // Magenta/Fuchsia
      arrowHeadLength,
      arrowHeadWidth
    );

    groupRef.current.add(xArrowRef.current);
    groupRef.current.add(yArrowRef.current);
    groupRef.current.add(zArrowRef.current);

    return () => {
      if (xArrowRef.current) groupRef.current?.remove(xArrowRef.current);
      if (yArrowRef.current) groupRef.current?.remove(yArrowRef.current);
      if (zArrowRef.current) groupRef.current?.remove(zArrowRef.current);
    };
  }, []);

  // Update actual TCP position every frame from URDF model
  useFrame(() => {
    if (!groupRef.current || !urdfRobotRef) return;

    try {
      // Get L6 link from URDF robot (the last link before TCP)
      const l6Link = urdfRobotRef.links['L6'];
      if (!l6Link) return;

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

      groupRef.current.position.copy(tcpWorldPosition);
      groupRef.current.quaternion.copy(l6WorldQuaternion);

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

      useTimelineStore.setState({
        actualTcpPosition: {
          X: tcpWorldPosition.x * 1000,      // X stays the same
          Y: -tcpWorldPosition.z * 1000,     // Y = -Z (swap and negate)
          Z: tcpWorldPosition.y * 1000,      // Z = Y (swap)
          RX: rx_final,
          RY: ry_final,
          RZ: rz_final
        }
      });
    } catch (e) {
      // Silently ignore errors during URDF loading
      console.debug('ActualTCPVisualizer: URDF not ready', e);
    }
  });

  return <group ref={groupRef} />;
}
