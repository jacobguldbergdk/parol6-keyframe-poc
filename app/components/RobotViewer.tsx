'use client';

import { useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { useTimelineStore } from '@/app/lib/store';
import TargetPoseVisualizer from './TargetPoseVisualizer';
import ActualTCPVisualizer from './ActualTCPVisualizer';

// @ts-ignore - urdf-loader doesn't have proper types
import URDFLoader from 'urdf-loader';

function URDFRobot() {
  const robotRef = useRef<any>(null);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);

  useEffect(() => {
    const loader = new URDFLoader();
    loader.load(
      '/urdf/PAROL6.urdf',
      (robot: any) => {
        robotRef.current = robot;
        // Store robot ref in global store so ActualTCPVisualizer can access it
        useTimelineStore.setState({ urdfRobotRef: robot });
        // Force re-render
        robot.updateMatrixWorld(true);
      },
      undefined,
      (error: any) => console.error('Error loading URDF:', error)
    );
  }, []);

  useEffect(() => {
    if (!robotRef.current) return;

    // Angle transformations from PAROL Web Commander
    // Formula: URDF_angle = (controller_angle × sign) + offset
    const angleSigns = [1, 1, -1, -1, -1, -1];  // J1-J6
    const angleOffsets = [0, 90, 180, 0, 0, 180];  // degrees, J1-J6

    // Update robot joint angles (convert degrees to radians)
    Object.entries(currentJointAngles).forEach(([joint, angleDeg], index) => {
      const sign = angleSigns[index] || 1;
      const offset = angleOffsets[index] || 0;

      // Apply sign correction and offset before converting to radians
      const correctedAngleDeg = angleDeg * sign + offset;
      const angleRad = (correctedAngleDeg * Math.PI) / 180;
      const jointName = `L${index + 1}`; // Joint names in URDF: L1, L2, L3, L4, L5, L6

      try {
        robotRef.current.setJointValue(jointName, angleRad);
      } catch (e) {
        // Ignore joint not found errors during initial load
      }
    });
  }, [currentJointAngles]);

  return (
    <>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {robotRef.current && <primitive object={robotRef.current} />}
      </group>
      <Grid args={[10, 10]} cellColor="#6b6b6b" sectionColor="#3f3f3f" />
    </>
  );
}

export default function RobotViewer() {
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const currentCartesianPose = useTimelineStore((state) => state.currentCartesianPose);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const actualTcpPosition = useTimelineStore((state) => state.actualTcpPosition);

  return (
    <div className="w-full h-full bg-gray-950 rounded-lg overflow-hidden border relative">
      {/* Coordinate Overlay */}
      <div className="absolute top-4 left-4 bg-black/70 text-white p-3 rounded-lg text-xs font-mono z-10 backdrop-blur-sm">
        <div className="font-semibold mb-2 text-sm flex items-center gap-2">
          <span className="text-orange-400">●</span>
          Actual TCP Pose (from URDF)
        </div>
        {actualTcpPosition ? (
          <div className="space-y-1">
            <div className="flex gap-3">
              <span className="text-orange-400">X: {actualTcpPosition.X.toFixed(1)} mm</span>
              <span className="text-cyan-400">Y: {actualTcpPosition.Y.toFixed(1)} mm</span>
              <span className="text-fuchsia-400">Z: {actualTcpPosition.Z.toFixed(1)} mm</span>
            </div>
            <div className="flex gap-3">
              <span className="text-orange-400">RX: {actualTcpPosition.RX.toFixed(1)}°</span>
              <span className="text-cyan-400">RY: {actualTcpPosition.RY.toFixed(1)}°</span>
              <span className="text-fuchsia-400">RZ: {actualTcpPosition.RZ.toFixed(1)}°</span>
            </div>
            <div className="text-[10px] text-gray-500 italic">
              Ground truth pose from URDF model (colors match gizmo)
            </div>
          </div>
        ) : (
          <div className="text-gray-500 italic">Loading robot model...</div>
        )}
        {motionMode === 'cartesian' && (
          <div className="mt-3 pt-2 border-t border-gray-700">
            <div className="font-semibold mb-1 flex items-center gap-2">
              <span className="text-red-500">●</span>
              Target Pose (IK Goal)
            </div>
            <div className="space-y-1">
              <div className="flex gap-3">
                <span className="text-red-400">X: {currentCartesianPose.X.toFixed(1)} mm</span>
                <span className="text-green-400">Y: {currentCartesianPose.Y.toFixed(1)} mm</span>
                <span className="text-blue-400">Z: {currentCartesianPose.Z.toFixed(1)} mm</span>
              </div>
              <div className="flex gap-3">
                <span className="text-red-400">RX: {currentCartesianPose.RX.toFixed(1)}°</span>
                <span className="text-green-400">RY: {currentCartesianPose.RY.toFixed(1)}°</span>
                <span className="text-blue-400">RZ: {currentCartesianPose.RZ.toFixed(1)}°</span>
              </div>
              <div className="text-[10px] text-gray-500 italic">
                Target gizmo: red/green/blue arrows
              </div>
            </div>
          </div>
        )}
      </div>

      <Canvas camera={{ position: [0.5, 0.4, 0.8], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Suspense fallback={null}>
          <URDFRobot />

          {/* Actual TCP position (always visible) - shows where robot IS */}
          {/* NOTE: NO rotation applied - gets world position directly from URDF */}
          <ActualTCPVisualizer />

          {/* Target position (only in cartesian mode) - shows where we WANT to go */}
          {motionMode === 'cartesian' && (
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <TargetPoseVisualizer />
            </group>
          )}
        </Suspense>
        <OrbitControls target={[0, 0.2, 0]} />

        {/* Interactive rotating coordinate system gizmo */}
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <GizmoViewport
              axisColors={['#ff0000', '#00ff00', '#0000ff']}
              labelColor="white"
            />
          </group>
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
