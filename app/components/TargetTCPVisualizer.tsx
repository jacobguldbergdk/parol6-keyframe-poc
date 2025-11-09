import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTimelineStore } from '@/app/lib/store';
import { calculateTcpPoseFromUrdf, tcpPosesAreDifferent } from '@/app/lib/tcpCalculations';
import type { CartesianPose } from '@/app/lib/types';

/**
 * Visualizes the TARGET TCP position extracted from target robot URDF model
 * This shows where we're COMMANDING the robot to go (the main colored robot's TCP)
 * Uses orange/cyan/magenta color scheme
 *
 * IMPORTANT: Gets TCP position from URDF L6 link's world transform (accurate through all 6 joints)
 * NOT from simplified FK calculation (which was inaccurate)
 */
export default function TargetTCPVisualizer() {
  const groupRef = useRef<THREE.Group>(null);
  const xArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const yArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const zArrowRef = useRef<THREE.ArrowHelper | null>(null);

  // Track last sent position to avoid unnecessary setState calls
  const lastPositionRef = useRef<CartesianPose | null>(null);

  const targetRobotRef = useTimelineStore((state) => state.targetRobotRef);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);

  // Create arrows on mount with distinct styling
  useEffect(() => {
    if (!groupRef.current) return;

    // Arrow size (40mm)
    const arrowLength = 0.04;
    const arrowHeadLength = arrowLength * 0.2;
    const arrowHeadWidth = arrowLength * 0.15;

    // Orange/Cyan/Magenta color scheme for TARGET (target robot)
    // Different from cartesian input (red/green/blue) and actual (yellow/lime/purple)

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

  // Update target TCP position every frame from main URDF robot model
  useFrame(() => {
    if (!groupRef.current || !targetRobotRef) return;

    // Calculate TCP pose using shared utility
    const newPosition = calculateTcpPoseFromUrdf(targetRobotRef, tcpOffset);
    if (!newPosition) return;

    // Update visual arrow group position (for rendering)
    const l6Link = targetRobotRef.links['L6'];
    if (l6Link) {
      l6Link.updateMatrixWorld(true);
      const l6WorldPosition = new THREE.Vector3();
      const l6WorldQuaternion = new THREE.Quaternion();
      l6Link.getWorldPosition(l6WorldPosition);
      l6Link.getWorldQuaternion(l6WorldQuaternion);

      const localOffset = new THREE.Vector3(
        tcpOffset.x / 1000,
        tcpOffset.y / 1000,
        tcpOffset.z / 1000
      );
      const worldOffset = localOffset.applyQuaternion(l6WorldQuaternion);
      const tcpWorldPosition = l6WorldPosition.add(worldOffset);

      groupRef.current.position.copy(tcpWorldPosition);
      groupRef.current.quaternion.copy(l6WorldQuaternion);
    }

    // Only update store if position changed significantly
    if (tcpPosesAreDifferent(newPosition, lastPositionRef.current)) {
      lastPositionRef.current = newPosition;
      useTimelineStore.setState({ targetTcpPosition: newPosition });
    }
  });

  return <group ref={groupRef} />;
}
