import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTimelineStore } from '@/app/lib/store';
import { calculateTcpPoseFromUrdf, tcpPosesAreDifferent } from '@/app/lib/tcpCalculations';
import type { CartesianPose } from '@/app/lib/types';

/**
 * Visualizes the ACTUAL TCP position from actual robot (hardware feedback)
 * This shows where the robot ACTUALLY IS (real hardware position)
 * Uses yellow/lime/purple color scheme
 *
 * Currently reads from actual robot at standby position
 * Future: Will sync with real robot hardware feedback
 *
 * IMPORTANT: Gets TCP position from ghost URDF L6 link's world transform
 */
export default function ActualTCPVisualizer() {
  const groupRef = useRef<THREE.Group>(null);
  const xArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const yArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const zArrowRef = useRef<THREE.ArrowHelper | null>(null);

  // Track last sent position to avoid unnecessary setState calls
  const lastPositionRef = useRef<CartesianPose | null>(null);

  const actualRobotRef = useTimelineStore((state) => state.actualRobotRef);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);
  const actualJointAngles = useTimelineStore((state) => state.actualJointAngles);

  // Create arrows on mount with distinct styling
  useEffect(() => {
    if (!groupRef.current) return;

    // Arrow size (40mm)
    const arrowLength = 0.04;
    const arrowHeadLength = arrowLength * 0.2;
    const arrowHeadWidth = arrowLength * 0.15;

    // Yellow/Lime/Purple color scheme for ACTUAL (actual robot / hardware feedback)
    // Different from target (orange/cyan/magenta) and cartesian input (red/green/blue)

    // X axis - Yellow (swapped: now points in negative Z direction)
    xArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),  // X arrow points in negative Z direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xffff00, // Yellow
      arrowHeadLength,
      arrowHeadWidth
    );

    // Y axis - Lime (labeled Y, flipped direction)
    yArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),  // Flipped: negated Y direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x88ff00, // Lime
      arrowHeadLength,
      arrowHeadWidth
    );

    // Z axis - Purple (swapped: now points in negative X direction)
    zArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),  // Z arrow points in negative X direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xaa00ff, // Purple
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

  // Update actual TCP position every frame from ghost URDF robot model
  useFrame(() => {
    if (!groupRef.current || !actualRobotRef) return;

    // Only compute TCP position if we have actual hardware feedback
    // Otherwise set to null to show N/A in UI
    if (!actualJointAngles) {
      useTimelineStore.setState({ actualTcpPosition: null });
      return;
    }

    // Calculate TCP pose using shared utility
    const newPosition = calculateTcpPoseFromUrdf(actualRobotRef, tcpOffset);
    if (!newPosition) return;

    // Update visual arrow group position (for rendering)
    const l6Link = actualRobotRef.links['L6'];
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
      useTimelineStore.setState({ actualTcpPosition: newPosition });
    }
  });

  return <group ref={groupRef} />;
}
