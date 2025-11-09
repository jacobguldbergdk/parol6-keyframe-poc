import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useInputStore, useTimelineStore } from '@/app/lib/stores';

/**
 * Visualizes the INPUT cartesian pose that the user is controlling via sliders
 * This shows where the user wants the TCP to go (red/green/blue gizmo)
 * (IK will be computed later during playback to make the robot follow this target)
 * Only shown in cartesian mode - hidden in joint mode
 */
export default function TargetPoseVisualizer() {
  const groupRef = useRef<THREE.Group>(null);
  const xArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const yArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const zArrowRef = useRef<THREE.ArrowHelper | null>(null);

  const inputCartesianPose = useInputStore((state) => state.inputCartesianPose);
  const motionMode = useTimelineStore((state) => state.timeline.mode);

  // Only show this gizmo in cartesian mode - it represents a cartesian target
  if (motionMode !== 'cartesian') {
    return null;
  }

  // Create arrows on mount
  useEffect(() => {
    if (!groupRef.current) return;

    // Arrow length in meters (50mm = 0.05m)
    const arrowLength = 0.05;
    const arrowHeadLength = arrowLength * 0.2;
    const arrowHeadWidth = arrowLength * 0.15;

    // X axis - Red (user X = viewport X)
    xArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xff0000,
      arrowHeadLength,
      arrowHeadWidth
    );

    // Y axis - Green (user Y = -viewport Z)
    yArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x00ff00,
      arrowHeadLength,
      arrowHeadWidth
    );

    // Z axis - Blue (user Z = viewport Y)
    zArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x0000ff,
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

  // Update input pose position and orientation every frame
  useFrame(() => {
    if (!groupRef.current) return;

    // Show the INPUT cartesian pose using same coordinate convention as TargetTCPVisualizer
    // Apply inverse transform: user space (X,Y,Z) → URDF world space (x,y,z)
    // User space: X=x, Y=-z, Z=y
    // Inverse: x=X, y=Z, z=-Y
    // Convert mm to meters and update position
    groupRef.current.position.set(
      inputCartesianPose.X / 1000,   // x = X
      inputCartesianPose.Z / 1000,   // y = Z (was Y)
      -inputCartesianPose.Y / 1000   // z = -Y (was Z, negated)
    );

    // Update rotation from input orientation (convert degrees to radians)
    // Apply rotation transform to match coordinate system:
    // RX → rotation.x (around viewport X = user X)
    // RZ → rotation.y (around viewport Y = user Z)
    // -RY → rotation.z (around viewport Z = -user Y)
    groupRef.current.rotation.set(
      (inputCartesianPose.RX * Math.PI) / 180,
      (inputCartesianPose.RZ * Math.PI) / 180,
      -(inputCartesianPose.RY * Math.PI) / 180
    );
  });

  return <group ref={groupRef} />;
}
