import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTimelineStore } from '@/app/lib/store';

/**
 * Visualizes the TARGET cartesian pose that the user is controlling
 * This shows where we WANT the TCP to go, not where it currently is
 * (IK will be computed later during playback to make the robot follow this target)
 */
export default function TargetPoseVisualizer() {
  const groupRef = useRef<THREE.Group>(null);
  const xArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const yArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const zArrowRef = useRef<THREE.ArrowHelper | null>(null);

  const currentCartesianPose = useTimelineStore((state) => state.currentCartesianPose);

  // Create arrows on mount
  useEffect(() => {
    if (!groupRef.current) return;

    // Arrow length in meters (50mm = 0.05m)
    const arrowLength = 0.05;
    const arrowHeadLength = arrowLength * 0.2;
    const arrowHeadWidth = arrowLength * 0.15;

    // X axis - Red
    xArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xff0000,
      arrowHeadLength,
      arrowHeadWidth
    );

    // Y axis - Green
    yArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x00ff00,
      arrowHeadLength,
      arrowHeadWidth
    );

    // Z axis - Blue
    zArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
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

  // Update target position and orientation every frame
  useFrame(() => {
    if (!groupRef.current) return;

    // Show the TARGET cartesian pose directly (what user is controlling)
    // NOT computed from FK - this is where we WANT to go
    // Convert mm to meters and update position
    // Note: Parent group has -90° X rotation to match robot URDF frame
    groupRef.current.position.set(
      currentCartesianPose.X / 1000,
      currentCartesianPose.Y / 1000,
      currentCartesianPose.Z / 1000
    );

    // Update rotation from target orientation (convert degrees to radians)
    groupRef.current.rotation.set(
      (currentCartesianPose.RX * Math.PI) / 180,
      (currentCartesianPose.RY * Math.PI) / 180,
      (currentCartesianPose.RZ * Math.PI) / 180
    );
  });

  return <group ref={groupRef} />;
}
