'use client';

import { useEffect, useRef, Suspense, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { useTimelineStore } from '@/app/lib/store';
import TargetPoseVisualizer from './TargetPoseVisualizer';
import TargetTCPVisualizer from './TargetTCPVisualizer';
import ActualTCPVisualizer from './ActualTCPVisualizer';
import JointLabels from './JointLabels';
import InteractiveRobotMeshes from './InteractiveRobotMeshes';
import { JointContextMenu } from './JointContextMenu';
import { JOINT_LIMITS, JOINT_ANGLE_OFFSETS, CARTESIAN_LIMITS } from '../lib/constants';
import type { JointName, CartesianAxis } from '../lib/types';
import { inverseKinematicsDetailed } from '../lib/kinematics';
import { getHomePosition } from '../lib/positions';
import { getApiBaseUrl } from '../lib/apiConfig';

// @ts-ignore - urdf-loader doesn't have proper types
import URDFLoader from 'urdf-loader';

interface URDFRobotProps {
  showLabels: boolean;
}

function URDFRobot({ showLabels }: URDFRobotProps) {
  const robotRef = useRef<any>(null);
  const actualRobotRef = useRef<any>(null);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const selectedJoint = useTimelineStore((state) => state.selectedJoint);
  const showActualRobot = useTimelineStore((state) => state.showActualRobot);
  const jointHomedStatus = useTimelineStore((state) => state.jointHomedStatus);
  const showTargetRobot = useTimelineStore((state) => state.showTargetRobot);

  // Load target robot
  useEffect(() => {
    const loader = new URDFLoader();

    loader.load(
      '/urdf/PAROL6.urdf',
      (robot: any) => {
        robotRef.current = robot;
        useTimelineStore.setState({ targetRobotRef: robot });

        // Wait a bit for meshes to load, then setup
        setTimeout(() => {
          // Setup meshes with event handlers
          robot.traverse((child: any) => {
            if (child.isMesh) {
              // Find which joint this mesh belongs to
              let jointName = null;
              let parent = child.parent;
              while (parent) {
                if (parent.isURDFJoint) {
                  const match = parent.name.match(/L(\d)/);
                  if (match) {
                    jointName = `J${match[1]}` as JointName;
                  }
                  break;
                }
                parent = parent.parent;
              }

              if (jointName) {
                child.userData.jointName = jointName;

                // Clone material for independent coloring
                if (child.material) {
                  child.material = child.material.clone();
                  child.material.userData.isCloned = true;
                }

                // Enable raycasting for this mesh so it can be clicked
                child.userData.clickable = true;
              }
            }
          });

          // Set initial joint positions from store (Home position)
          const initialAngles = useTimelineStore.getState().currentJointAngles;
          const angleSigns = [1, 1, -1, -1, -1, -1];

          Object.entries(initialAngles).forEach(([joint, angleDeg], index) => {
            const sign = angleSigns[index] || 1;
            const offset = JOINT_ANGLE_OFFSETS[index] || 0;
            const correctedAngleDeg = angleDeg * sign + offset;
            const angleRad = (correctedAngleDeg * Math.PI) / 180;
            const jointName = `L${index + 1}`;

            try {
              robot.setJointValue(jointName, angleRad);
            } catch (e) {
              // Ignore joint not found errors
            }
          });

          robot.updateMatrixWorld(true);
        }, 500); // Wait 500ms for meshes to load
      }
    );
  }, []);

  // Load actual robot (transparent, static position)
  useEffect(() => {
    const loader = new URDFLoader();

    loader.load(
      '/urdf/PAROL6.urdf',
      (robot: any) => {
        actualRobotRef.current = robot;

        // Save to store for ActualTCPVisualizer to access
        useTimelineStore.setState({ actualRobotRef: robot });

        // Wait for meshes to load before applying transparency
        setTimeout(() => {
          // Make all materials transparent
          robot.traverse((child: any) => {
            if (child.isMesh) {
              // Mark this mesh as part of actual robot
              child.userData.isActual = true;

              // Find which joint this mesh belongs to (same logic as target robot)
              let jointName = null;
              let parent = child.parent;
              while (parent) {
                if (parent.isURDFJoint) {
                  const match = parent.name.match(/L(\d)/);
                  if (match) {
                    jointName = `J${match[1]}` as JointName;
                  }
                  break;
                }
                parent = parent.parent;
              }
              if (jointName) {
                child.userData.jointName = jointName;
              }

              // Handle both single materials and material arrays
              const materials = Array.isArray(child.material) ? child.material : [child.material];

              const newMaterials: any[] = [];
              materials.forEach((mat: any) => {
                if (mat) {
                  // Clone to avoid affecting target robot
                  const clonedMat = mat.clone();
                  clonedMat.transparent = true;

                  // Base (no jointName) should be fully transparent
                  // Joints start red (unhomed) and turn blue when homed
                  if (!jointName) {
                    clonedMat.opacity = 0; // Fully transparent base
                  } else {
                    clonedMat.opacity = 0.35;
                    clonedMat.color.setHex(0xff0000); // Red - unhomed initial state
                  }

                  clonedMat.depthWrite = false;
                  clonedMat.side = THREE.DoubleSide;
                  clonedMat.userData.isActualMaterial = true; // Mark as ghost material
                  clonedMat.needsUpdate = true;

                  newMaterials.push(clonedMat);
                }
              });

              // Replace material
              child.material = Array.isArray(child.material) ? newMaterials : newMaterials[0];

              // Set render order for proper transparency sorting
              child.renderOrder = -1; // Render ghost first
            }
          });

          // Set initial joint positions to Home position
          const initialAngles = getHomePosition();
          const angleSigns = [1, 1, -1, -1, -1, -1];

          Object.entries(initialAngles).forEach(([joint, angleDeg], index) => {
            const sign = angleSigns[index] || 1;
            const offset = JOINT_ANGLE_OFFSETS[index] || 0;
            const correctedAngleDeg = angleDeg * sign + offset;
            const angleRad = (correctedAngleDeg * Math.PI) / 180;
            const jointName = `L${index + 1}`;

            try {
              robot.setJointValue(jointName, angleRad);
            } catch (e) {
              // Ignore joint not found errors
            }
          });

          robot.updateMatrixWorld(true);
        }, 500); // Wait 500ms for meshes to load
      }
    );
  }, []);

  // Update joint angles for target robot + apply coloring
  useEffect(() => {
    if (!robotRef.current) return;

    const angleSigns = [1, 1, -1, -1, -1, -1];

    Object.entries(currentJointAngles).forEach(([joint, angleDeg], index) => {
      const sign = angleSigns[index] || 1;
      const offset = JOINT_ANGLE_OFFSETS[index] || 0;
      const correctedAngleDeg = angleDeg * sign + offset;
      const angleRad = (correctedAngleDeg * Math.PI) / 180;
      const jointName = `L${index + 1}`;

      try {
        robotRef.current.setJointValue(jointName, angleRad);
      } catch (e) {
        // Ignore joint not found errors
      }
    });

    // Apply coloring to joint meshes (separate pass for clarity)
    let coloredMeshCount = 0;
    let skippedActualCount = 0;

    robotRef.current.traverse((child: any) => {
      if (child.isMesh) {
        // Check if this is a ghost mesh that should be skipped
        if (child.userData.isActual) {
          skippedActualCount++;
          return; // Skip ghost meshes!
        }

        // Only highlight selected joint (no color coding based on position)
        if (child.userData.jointName && child.material) {
          coloredMeshCount++;
          const jointKey = child.userData.jointName as JointName;

          // Add emissive for selection only
          if (selectedJoint === jointKey) {
            child.material.emissive.setHex(0xf97316); // orange-500 - contrasts well with blue transparent actual robot
            child.material.emissiveIntensity = 0.5;
          } else {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0;
          }

          child.material.needsUpdate = true;
        }
      }
    });
  }, [currentJointAngles, selectedJoint]);

  // Update actual robot from actual hardware feedback (WebSocket data)
  const actualJointAngles = useTimelineStore((state) => state.actualJointAngles);

  useEffect(() => {
    if (!actualRobotRef.current) return;

    // Use actual joint angles from hardware feedback, or fallback to home position
    const angles = actualJointAngles || getHomePosition();

    const angleSigns = [1, 1, -1, -1, -1, -1];

    Object.entries(angles).forEach(([joint, angleDeg], index) => {
      const sign = angleSigns[index] || 1;
      const offset = JOINT_ANGLE_OFFSETS[index] || 0;
      const correctedAngleDeg = angleDeg * sign + offset;
      const angleRad = (correctedAngleDeg * Math.PI) / 180;
      const jointName = `L${index + 1}`;

      try {
        actualRobotRef.current.setJointValue(jointName, angleRad);
      } catch (e) {
        // Ignore
      }
    });
  }, [actualJointAngles]);

  // Update actual robot colors based on homing status
  useEffect(() => {
    if (!actualRobotRef.current) return;

    actualRobotRef.current.traverse((child: any) => {
      if (child.isMesh && child.userData.isActual && child.userData.jointName) {
        const jointName = child.userData.jointName as JointName;
        const isHomed = jointHomedStatus[jointName];

        // Red = unhomed, Blue = homed
        const color = isHomed ? 0x64B5F6 : 0xff0000;

        // Handle both single materials and material arrays
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        materials.forEach((mat: any) => {
          if (mat && mat.userData.isActualMaterial) {
            // Update color while preserving transparency properties
            mat.color.setHex(color);
            mat.transparent = true;
            mat.opacity = 0.35;
            mat.depthWrite = false;
            mat.needsUpdate = true;
          }
        });
      }
    });
  }, [jointHomedStatus]);

  return (
    <>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {/* Actual robot (transparent, static) */}
        {showActualRobot && actualRobotRef.current && <primitive object={actualRobotRef.current} />}

        {/* Target robot with interactive meshes */}
        {showTargetRobot && robotRef.current && <InteractiveRobotMeshes robot={robotRef.current} />}
      </group>

      <Grid args={[10, 10]} cellColor="#6b6b6b" sectionColor="#3f3f3f" />
    </>
  );
}

export default function RobotViewer() {
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const currentCartesianPose = useTimelineStore((state) => state.currentCartesianPose);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const targetTcpPosition = useTimelineStore((state) => state.targetTcpPosition);
  const actualTcpPosition = useTimelineStore((state) => state.actualTcpPosition);
  const actualJointAngles = useTimelineStore((state) => state.actualJointAngles);
  const selectedJoint = useTimelineStore((state) => state.selectedJoint);
  const setSelectedJoint = useTimelineStore((state) => state.setSelectedJoint);
  const setJointAngle = useTimelineStore((state) => state.setJointAngle);
  const setCartesianValue = useTimelineStore((state) => state.setCartesianValue);
  const stepAngle = useTimelineStore((state) => state.stepAngle);
  const showActualRobot = useTimelineStore((state) => state.showActualRobot);
  const setShowActualRobot = useTimelineStore((state) => state.setShowActualRobot);
  const showTargetRobot = useTimelineStore((state) => state.showTargetRobot);
  const setShowTargetRobot = useTimelineStore((state) => state.setShowTargetRobot);
  const targetFollowsActual = useTimelineStore((state) => state.targetFollowsActual);
  const setTargetFollowsActual = useTimelineStore((state) => state.setTargetFollowsActual);
  const actualFollowsTarget = useTimelineStore((state) => state.actualFollowsTarget);
  const setActualFollowsTarget = useTimelineStore((state) => state.setActualFollowsTarget);
  const targetRobotRef = useTimelineStore((state) => state.targetRobotRef);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);
  const ikAxisMask = useTimelineStore((state) => state.ikAxisMask);
  const speed = useTimelineStore((state) => state.speed);

  const [showLabels, setShowLabels] = useState(true);

  // Track last valid cartesian pose for IK failure recovery
  const lastValidCartesianPose = useRef(currentCartesianPose);

  // Keyboard controls for joint adjustment
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore keyboard events when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Handle Escape key to deselect
      if (event.key === 'Escape') {
        setSelectedJoint(null);
        return;
      }

      // Handle number keys 1-6 to select joints J1-J6
      if (event.key >= '1' && event.key <= '6') {
        const jointNumber = parseInt(event.key);
        const jointName = `J${jointNumber}` as JointName;
        setSelectedJoint(jointName);
        return;
      }

      // Handle arrow keys for joint adjustment (only when joint is selected)
      if (selectedJoint && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault(); // Prevent page scrolling

        const currentAngle = currentJointAngles[selectedJoint];
        const limits = JOINT_LIMITS[selectedJoint];

        // Calculate step based on modifier keys
        let adjustmentStep = stepAngle;
        if (event.shiftKey) {
          // Shift: fine control (step / 10)
          adjustmentStep = stepAngle / 10;
        } else if (event.ctrlKey || event.metaKey) {
          // Ctrl/Cmd: coarse control (step × 3)
          adjustmentStep = stepAngle * 3;
        }

        // Apply direction
        const direction = event.key === 'ArrowUp' ? 1 : -1;
        const newAngle = currentAngle + (direction * adjustmentStep);

        // Clamp to joint limits
        const clampedAngle = Math.max(limits.min, Math.min(limits.max, newAngle));

        setJointAngle(selectedJoint, clampedAngle);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedJoint, currentJointAngles, stepAngle, setJointAngle, setSelectedJoint]);

  // Keyboard controls for cartesian TCP adjustment (WASD-QE keys)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only active in cartesian mode
      if (motionMode !== 'cartesian') {
        return;
      }

      // Ignore keyboard events when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Key mapping: WASD-QE for position, Alt+WASD-QE for rotation
      const keyMap: { [key: string]: { axis: CartesianAxis, direction: number, isRotation: boolean } } = {
        'a': { axis: 'Y', direction: -1, isRotation: false },
        'd': { axis: 'Y', direction: 1, isRotation: false },
        'w': { axis: 'X', direction: 1, isRotation: false },
        's': { axis: 'X', direction: -1, isRotation: false },
        'q': { axis: 'Z', direction: -1, isRotation: false },
        'e': { axis: 'Z', direction: 1, isRotation: false },
        'A': { axis: 'Y', direction: -1, isRotation: false },
        'D': { axis: 'Y', direction: 1, isRotation: false },
        'W': { axis: 'X', direction: 1, isRotation: false },
        'S': { axis: 'X', direction: -1, isRotation: false },
        'Q': { axis: 'Z', direction: -1, isRotation: false },
        'E': { axis: 'Z', direction: 1, isRotation: false },
      };

      const keyPressed = event.key;
      const keyConfig = keyMap[keyPressed.toLowerCase()];

      if (!keyConfig) {
        return;
      }

      event.preventDefault(); // Prevent page scrolling

      // Determine axis (switch to rotation if Alt is pressed)
      let axis: CartesianAxis = keyConfig.axis;
      if (event.altKey) {
        // Convert X/Y/Z to RX/RY/RZ
        axis = `R${keyConfig.axis}` as CartesianAxis;
      }

      // Calculate step size based on modifier keys and axis type
      const isRotationAxis = axis.startsWith('R');
      let step: number;

      if (isRotationAxis) {
        // Rotation steps in degrees
        if (event.shiftKey) {
          step = 0.5; // Fine
        } else if (event.ctrlKey || event.metaKey) {
          step = 25; // Coarse
        } else {
          step = 5; // Normal
        }
      } else {
        // Position steps in mm
        if (event.shiftKey) {
          step = 0.5; // Fine
        } else if (event.ctrlKey || event.metaKey) {
          step = 25; // Coarse
        } else {
          step = 5; // Normal
        }
      }

      // Get current value and limits (read fresh from store to avoid stale closure)
      const currentValue = useTimelineStore.getState().currentCartesianPose[axis];
      const limits = CARTESIAN_LIMITS[axis];

      // Calculate new value
      const newValue = currentValue + (keyConfig.direction * step);

      // Clamp to limits
      const clampedValue = Math.max(limits.min, Math.min(limits.max, newValue));

      // Build new cartesian pose with updated value (use fresh store state)
      const currentPose = useTimelineStore.getState().currentCartesianPose;
      const newCartesianPose = { ...currentPose, [axis]: clampedValue };

      // Try to solve IK for the new pose
      if (!targetRobotRef) {
        // If robot not loaded yet, just update the value
        setCartesianValue(axis, clampedValue);
        return;
      }

      const ikResult = inverseKinematicsDetailed(
        newCartesianPose,
        useTimelineStore.getState().currentJointAngles, // Use fresh state for IK
        targetRobotRef,
        tcpOffset,
        ikAxisMask
      );

      if (ikResult.success && ikResult.jointAngles) {
        // IK succeeded - update both cartesian pose and joint angles
        setCartesianValue(axis, clampedValue);
        useTimelineStore.setState({ currentJointAngles: ikResult.jointAngles });

        // Store as last valid pose
        lastValidCartesianPose.current = newCartesianPose;
      } else {
        // IK failed - revert to last valid pose
        console.warn('[IK] Failed to reach target position, reverting to last valid pose');
        useTimelineStore.setState({ currentCartesianPose: lastValidCartesianPose.current });

        // Optional: Play error sound or show visual feedback
        // You could add a toast notification here
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [motionMode, currentCartesianPose, currentJointAngles, setCartesianValue, targetRobotRef, tcpOffset, ikAxisMask]);

  // Target Follows Actual: Mirror hardware feedback in target robot (teaching mode)
  useEffect(() => {
    if (targetFollowsActual && actualJointAngles) {
      // Copy all actual joint angles to target joint angles
      Object.entries(actualJointAngles).forEach(([joint, angle]) => {
        setJointAngle(joint as keyof typeof actualJointAngles, angle);
      });
    }
  }, [targetFollowsActual, actualJointAngles, setJointAngle]);

  // Sync once: Send current target position to robot (one-shot command)
  const handleSyncOnce = async () => {
    // Only works in joint mode
    if (motionMode !== 'joint') {
      return;
    }

    try {
      // Convert joint angles to array format
      const anglesArray = [
        currentJointAngles.J1,
        currentJointAngles.J2,
        currentJointAngles.J3,
        currentJointAngles.J4,
        currentJointAngles.J5,
        currentJointAngles.J6
      ];

      // Send move command to backend
      const response = await fetch(`${getApiBaseUrl()}/api/robot/move/joints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          angles: anglesArray,
          speed_percentage: speed,
          wait_for_ack: false,
          timeout: 10.0
        })
      });

      if (!response.ok) {
        console.error('Sync once failed:', response.statusText);
      }
    } catch (error) {
      console.error('Sync once error:', error);
    }
  };

  // Handle click on canvas background to deselect joint
  const handleCanvasClick = (event: any) => {
    // Only deselect if clicking on canvas background (not on robot meshes)
    // InteractiveRobotMeshes will call stopPropagation() for mesh clicks
    setSelectedJoint(null);
  };

  return (
    <div className="w-full h-full bg-gray-950 rounded-lg overflow-hidden border relative">
      {/* Context Menu */}
      <JointContextMenu />

      {/* Coordinate Overlay */}
      <div className="absolute top-4 left-4 bg-black/70 text-white p-3 rounded-lg text-xs font-mono z-10 backdrop-blur-sm">
        {/* TCP Pose Section */}
        <div className="mb-3">
          <div className="font-semibold mb-2 text-sm">TCP Pose</div>
          {targetTcpPosition || actualTcpPosition ? (
            <div>
              {/* Column Headers */}
              <div className="grid grid-cols-7 gap-2 mb-1 text-[10px] text-gray-400 text-center">
                <div></div>
                <div>X</div>
                <div>Y</div>
                <div>Z</div>
                <div>RX</div>
                <div>RY</div>
                <div>RZ</div>
              </div>
              {/* Target Row (orange/cyan/magenta - target robot) */}
              {targetTcpPosition && (
                <div className="grid grid-cols-7 gap-2 mb-0.5">
                  <div className="text-gray-400">Target:</div>
                  <div className="text-center text-orange-400">{targetTcpPosition.X.toFixed(1)}</div>
                  <div className="text-center text-cyan-400">{targetTcpPosition.Y.toFixed(1)}</div>
                  <div className="text-center text-fuchsia-400">{targetTcpPosition.Z.toFixed(1)}</div>
                  <div className="text-center text-orange-400">{targetTcpPosition.RX.toFixed(1)}</div>
                  <div className="text-center text-cyan-400">{targetTcpPosition.RY.toFixed(1)}</div>
                  <div className="text-center text-fuchsia-400">{targetTcpPosition.RZ.toFixed(1)}</div>
                </div>
              )}
              {/* Actual Row (yellow/lime/purple - actual robot) */}
              <div className="grid grid-cols-7 gap-2">
                <div className="text-gray-400">Actual:</div>
                <div className="text-center text-yellow-400">{actualTcpPosition?.X.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-lime-400">{actualTcpPosition?.Y.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-purple-400">{actualTcpPosition?.Z.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-yellow-400">{actualTcpPosition?.RX.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-lime-400">{actualTcpPosition?.RY.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-purple-400">{actualTcpPosition?.RZ.toFixed(1) ?? 'N/A'}</div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 italic">Loading robot model...</div>
          )}
        </div>

        {/* Joint Angles Section */}
        <div className="pt-3 border-t border-gray-700">
          <div className="font-semibold mb-2 text-sm">Joint Angles</div>
          <div>
            {/* Column Headers */}
            <div className="grid grid-cols-7 gap-2 mb-1 text-[10px] text-gray-400 text-center">
              <div></div>
              <div>J1</div>
              <div>J2</div>
              <div>J3</div>
              <div>J4</div>
              <div>J5</div>
              <div>J6</div>
            </div>
            {/* Target Row */}
            <div className="grid grid-cols-7 gap-2 mb-0.5">
              <div className="text-gray-400">Target:</div>
              <div className="text-center">{currentJointAngles.J1.toFixed(1)}</div>
              <div className="text-center">{currentJointAngles.J2.toFixed(1)}</div>
              <div className="text-center">{currentJointAngles.J3.toFixed(1)}</div>
              <div className="text-center">{currentJointAngles.J4.toFixed(1)}</div>
              <div className="text-center">{currentJointAngles.J5.toFixed(1)}</div>
              <div className="text-center">{currentJointAngles.J6.toFixed(1)}</div>
            </div>
            {/* Actual Row */}
            <div className="grid grid-cols-7 gap-2">
              <div className="text-gray-400">Actual:</div>
              <div className="text-center">{actualJointAngles?.J1.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{actualJointAngles?.J2.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{actualJointAngles?.J3.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{actualJointAngles?.J4.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{actualJointAngles?.J5.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{actualJointAngles?.J6.toFixed(1) ?? 'N/A'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Display Controls */}
      <div className="absolute top-4 right-4 bg-black/70 text-white p-3 rounded-lg text-xs z-10 backdrop-blur-sm">
        <div className="font-semibold mb-2">Display Options</div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors">
            <input
              type="checkbox"
              checked={showActualRobot}
              onChange={(e) => setShowActualRobot(e.target.checked)}
              className="w-3 h-3 cursor-pointer"
            />
            <span>Show Actual Robot</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors">
            <input
              type="checkbox"
              checked={showTargetRobot}
              onChange={(e) => setShowTargetRobot(e.target.checked)}
              className="w-3 h-3 cursor-pointer"
            />
            <span>Show Target Robot</span>
          </label>

          {/* Divider */}
          <div className="border-t border-gray-600 my-2"></div>

          {/* Follow Modes */}
          <div className="text-[10px] text-gray-400 mb-1">Follow Modes</div>
          <label className="flex items-center gap-2 cursor-pointer hover:text-green-400 transition-colors">
            <input
              type="checkbox"
              checked={targetFollowsActual}
              onChange={(e) => setTargetFollowsActual(e.target.checked)}
              className="w-3 h-3 cursor-pointer"
            />
            <span className={targetFollowsActual ? 'text-green-400' : ''}>
              Target Follows Actual
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer hover:text-yellow-400 transition-colors">
            <input
              type="checkbox"
              checked={actualFollowsTarget}
              onChange={(e) => setActualFollowsTarget(e.target.checked)}
              className="w-3 h-3 cursor-pointer"
            />
            <span className={actualFollowsTarget ? 'text-yellow-400 font-semibold' : ''}>
              Actual Follows Target
              {actualFollowsTarget && <span className="ml-1 text-[9px] bg-yellow-500/20 px-1 py-0.5 rounded">LIVE</span>}
            </span>
            {/* Sync once button - only in joint mode */}
            {motionMode === 'joint' && (
              <button
                onClick={handleSyncOnce}
                className="w-3 h-3 flex items-center justify-center text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sync once: Send current target position to robot"
                aria-label="Sync once"
              >
                ↻
              </button>
            )}
          </label>
        </div>
      </div>

      <Canvas camera={{ position: [0.5, 0.4, 0.8], fov: 50 }} onPointerMissed={handleCanvasClick}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Suspense fallback={null}>
          <URDFRobot showLabels={showLabels} />

          {/* Target TCP visualizer (orange/cyan/magenta) - shows commanded position from target robot */}
          {/* NOTE: NO rotation applied - gets world position directly from URDF */}
          <TargetTCPVisualizer />

          {/* Actual TCP visualizer (yellow/lime/purple) - shows hardware feedback from actual robot */}
          {/* NOTE: NO rotation applied - gets world position directly from URDF */}
          <ActualTCPVisualizer />

          {/* Cartesian input gizmo (red/green/blue) - only in cartesian mode */}
          {/* Shows user's cartesian slider input - where they WANT to command the robot */}
          {/* NOTE: NO parent rotation - TargetPoseVisualizer handles coordinate transform internally */}
          {motionMode === 'cartesian' && <TargetPoseVisualizer />}
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
