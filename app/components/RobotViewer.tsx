'use client';

import { useEffect, useRef, Suspense, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { useInputStore, useCommandStore, useHardwareStore, useTimelineStore, useRobotConfigStore } from '@/app/lib/stores';
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
  const hardwareRobotRef = useRef<any>(null);
  const commandedJointAngles = useCommandStore((state) => state.commandedJointAngles);
  const selectedJoint = useInputStore((state) => state.selectedJoint);
  const showHardwareRobot = useInputStore((state) => state.showHardwareRobot);
  const jointHomedStatus = useCommandStore((state) => state.jointHomedStatus);
  const showTargetRobot = useInputStore((state) => state.showTargetRobot);

  // Load target robot
  useEffect(() => {
    const loader = new URDFLoader();

    loader.load(
      '/urdf/PAROL6.urdf',
      (robot: any) => {
        robotRef.current = robot;
        useCommandStore.setState({ targetRobotRef: robot });

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

          // Set initial joint positions from command store (Home position)
          const initialAngles = useCommandStore.getState().commandedJointAngles;
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

  // Load hardware robot (transparent, static position)
  useEffect(() => {
    const loader = new URDFLoader();

    loader.load(
      '/urdf/PAROL6.urdf',
      (robot: any) => {
        hardwareRobotRef.current = robot;

        // Save to store for ActualTCPVisualizer to access
        useHardwareStore.setState({ hardwareRobotRef: robot });

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

    Object.entries(commandedJointAngles).forEach(([joint, angleDeg], index) => {
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
  }, [commandedJointAngles, selectedJoint]);

  // Update hardware robot from hardware feedback (WebSocket data)
  const hardwareJointAngles = useHardwareStore((state) => state.hardwareJointAngles);

  useEffect(() => {
    if (!hardwareRobotRef.current) return;

    // Use hardware joint angles from robot feedback, or fallback to home position
    const angles = hardwareJointAngles || getHomePosition();

    const angleSigns = [1, 1, -1, -1, -1, -1];

    Object.entries(angles).forEach(([joint, angleDeg], index) => {
      const sign = angleSigns[index] || 1;
      const offset = JOINT_ANGLE_OFFSETS[index] || 0;
      const correctedAngleDeg = angleDeg * sign + offset;
      const angleRad = (correctedAngleDeg * Math.PI) / 180;
      const jointName = `L${index + 1}`;

      try {
        hardwareRobotRef.current.setJointValue(jointName, angleRad);
      } catch (e) {
        // Ignore
      }
    });
  }, [hardwareJointAngles]);

  // Update hardware robot colors based on homing status
  useEffect(() => {
    if (!hardwareRobotRef.current) return;

    hardwareRobotRef.current.traverse((child: any) => {
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
        {/* Hardware robot (transparent, shows hardware feedback) */}
        {showHardwareRobot && hardwareRobotRef.current && <primitive object={hardwareRobotRef.current} />}

        {/* Target robot with interactive meshes (shows commanded position) */}
        {showTargetRobot && robotRef.current && <InteractiveRobotMeshes robot={robotRef.current} />}
      </group>

      <Grid args={[10, 10]} cellColor="#6b6b6b" sectionColor="#3f3f3f" />
    </>
  );
}

export default function RobotViewer() {
  // Input store: User input state
  const inputJointAngles = useInputStore((state) => state.inputJointAngles);
  const setInputJointAngle = useInputStore((state) => state.setInputJointAngle);
  const inputCartesianPose = useInputStore((state) => state.inputCartesianPose);
  const setInputCartesianValue = useInputStore((state) => state.setInputCartesianValue);
  const selectedJoint = useInputStore((state) => state.selectedJoint);
  const setSelectedJoint = useInputStore((state) => state.setSelectedJoint);
  const showHardwareRobot = useInputStore((state) => state.showHardwareRobot);
  const setShowHardwareRobot = useInputStore((state) => state.setShowHardwareRobot);
  const showTargetRobot = useInputStore((state) => state.showTargetRobot);
  const setShowTargetRobot = useInputStore((state) => state.setShowTargetRobot);

  // Command store: Commanded robot state
  const commandedJointAngles = useCommandStore((state) => state.commandedJointAngles);
  const setCommandedJointAngle = useCommandStore((state) => state.setCommandedJointAngle);
  const setCommandedJointAngles = useCommandStore((state) => state.setCommandedJointAngles);
  const commandedTcpPose = useCommandStore((state) => state.commandedTcpPose);
  const targetRobotRef = useCommandStore((state) => state.targetRobotRef);
  const teachModeEnabled = useCommandStore((state) => state.teachModeEnabled);
  const setTeachModeEnabled = useCommandStore((state) => state.setTeachModeEnabled);
  const liveControlEnabled = useCommandStore((state) => state.liveControlEnabled);
  const setLiveControlEnabled = useCommandStore((state) => state.setLiveControlEnabled);
  const speed = useCommandStore((state) => state.speed);

  // Hardware store: Hardware feedback
  const hardwareJointAngles = useHardwareStore((state) => state.hardwareJointAngles);
  const hardwareTcpPose = useHardwareStore((state) => state.hardwareTcpPose);

  // Timeline store: Timeline state
  const motionMode = useTimelineStore((state) => state.timeline.mode);

  // Config store: Robot configuration
  const tcpOffset = useRobotConfigStore((state) => state.tcpOffset);
  const ikAxisMask = useRobotConfigStore((state) => state.ikAxisMask);

  // Step angle for keyboard controls (degrees)
  const stepAngle = 5;

  const [showLabels, setShowLabels] = useState(true);

  // Track last valid cartesian pose for IK failure recovery
  const lastValidCartesianPose = useRef(inputCartesianPose);

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

        const currentAngle = inputJointAngles[selectedJoint];
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

        // Update both input and commanded stores
        setInputJointAngle(selectedJoint, clampedAngle);
        setCommandedJointAngle(selectedJoint, clampedAngle);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedJoint, inputJointAngles, stepAngle, setInputJointAngle, setCommandedJointAngle, setSelectedJoint]);

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
      const currentValue = useInputStore.getState().inputCartesianPose[axis];
      const limits = CARTESIAN_LIMITS[axis];

      // Calculate new value
      const newValue = currentValue + (keyConfig.direction * step);

      // Clamp to limits
      const clampedValue = Math.max(limits.min, Math.min(limits.max, newValue));

      // Build new cartesian pose with updated value (use fresh store state)
      const currentPose = useInputStore.getState().inputCartesianPose;
      const newCartesianPose = { ...currentPose, [axis]: clampedValue };

      // Try to solve IK for the new pose
      if (!targetRobotRef) {
        // If robot not loaded yet, just update the value
        setInputCartesianValue(axis, clampedValue);
        return;
      }

      const ikResult = inverseKinematicsDetailed(
        newCartesianPose,
        useCommandStore.getState().commandedJointAngles, // Use fresh state for IK seed
        targetRobotRef,
        tcpOffset,
        ikAxisMask
      );

      if (ikResult.success && ikResult.jointAngles) {
        // IK succeeded - update both cartesian input and commanded joint angles
        setInputCartesianValue(axis, clampedValue);
        setCommandedJointAngles(ikResult.jointAngles);

        // Store as last valid pose
        lastValidCartesianPose.current = newCartesianPose;
      } else {
        // IK failed - revert to last valid pose
        console.warn('[IK] Failed to reach target position, reverting to last valid pose');
        // Update input cartesian pose to last valid
        Object.entries(lastValidCartesianPose.current).forEach(([key, value]) => {
          setInputCartesianValue(key as CartesianAxis, value);
        });

        // Optional: Play error sound or show visual feedback
        // You could add a toast notification here
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [motionMode, inputCartesianPose, commandedJointAngles, setInputCartesianValue, setCommandedJointAngles, targetRobotRef, tcpOffset, ikAxisMask]);

  // Teach Mode: Mirror hardware feedback in input (teaching mode - input follows hardware)
  useEffect(() => {
    if (teachModeEnabled && hardwareJointAngles) {
      // Copy all hardware joint angles to input and commanded angles
      Object.entries(hardwareJointAngles).forEach(([joint, angle]) => {
        const jointName = joint as JointName;
        setInputJointAngle(jointName, angle);
        setCommandedJointAngle(jointName, angle);
      });
    }
  }, [teachModeEnabled, hardwareJointAngles, setInputJointAngle, setCommandedJointAngle]);

  // Sync once: Send commanded position to robot (one-shot command)
  const handleSyncOnce = async () => {
    // Only works in joint mode
    if (motionMode !== 'joint') {
      return;
    }

    try {
      // Convert commanded joint angles to array format
      const anglesArray = [
        commandedJointAngles.J1,
        commandedJointAngles.J2,
        commandedJointAngles.J3,
        commandedJointAngles.J4,
        commandedJointAngles.J5,
        commandedJointAngles.J6
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
          {commandedTcpPose || hardwareTcpPose ? (
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
              {/* Commanded Row (orange/cyan/magenta - commanded robot) */}
              {commandedTcpPose && (
                <div className="grid grid-cols-7 gap-2 mb-0.5">
                  <div className="text-gray-400">Commanded:</div>
                  <div className="text-center text-orange-400">{commandedTcpPose.X.toFixed(1)}</div>
                  <div className="text-center text-cyan-400">{commandedTcpPose.Y.toFixed(1)}</div>
                  <div className="text-center text-fuchsia-400">{commandedTcpPose.Z.toFixed(1)}</div>
                  <div className="text-center text-orange-400">{commandedTcpPose.RX.toFixed(1)}</div>
                  <div className="text-center text-cyan-400">{commandedTcpPose.RY.toFixed(1)}</div>
                  <div className="text-center text-fuchsia-400">{commandedTcpPose.RZ.toFixed(1)}</div>
                </div>
              )}
              {/* Hardware Row (yellow/lime/purple - hardware robot) */}
              <div className="grid grid-cols-7 gap-2">
                <div className="text-gray-400">Hardware:</div>
                <div className="text-center text-yellow-400">{hardwareTcpPose?.X.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-lime-400">{hardwareTcpPose?.Y.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-purple-400">{hardwareTcpPose?.Z.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-yellow-400">{hardwareTcpPose?.RX.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-lime-400">{hardwareTcpPose?.RY.toFixed(1) ?? 'N/A'}</div>
                <div className="text-center text-purple-400">{hardwareTcpPose?.RZ.toFixed(1) ?? 'N/A'}</div>
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
            {/* Commanded Row */}
            <div className="grid grid-cols-7 gap-2 mb-0.5">
              <div className="text-gray-400">Commanded:</div>
              <div className="text-center">{commandedJointAngles.J1.toFixed(1)}</div>
              <div className="text-center">{commandedJointAngles.J2.toFixed(1)}</div>
              <div className="text-center">{commandedJointAngles.J3.toFixed(1)}</div>
              <div className="text-center">{commandedJointAngles.J4.toFixed(1)}</div>
              <div className="text-center">{commandedJointAngles.J5.toFixed(1)}</div>
              <div className="text-center">{commandedJointAngles.J6.toFixed(1)}</div>
            </div>
            {/* Hardware Row */}
            <div className="grid grid-cols-7 gap-2">
              <div className="text-gray-400">Hardware:</div>
              <div className="text-center">{hardwareJointAngles?.J1.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{hardwareJointAngles?.J2.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{hardwareJointAngles?.J3.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{hardwareJointAngles?.J4.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{hardwareJointAngles?.J5.toFixed(1) ?? 'N/A'}</div>
              <div className="text-center">{hardwareJointAngles?.J6.toFixed(1) ?? 'N/A'}</div>
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
              checked={showHardwareRobot}
              onChange={(e) => setShowHardwareRobot(e.target.checked)}
              className="w-3 h-3 cursor-pointer"
            />
            <span>Show Hardware Robot</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors">
            <input
              type="checkbox"
              checked={showTargetRobot}
              onChange={(e) => setShowTargetRobot(e.target.checked)}
              className="w-3 h-3 cursor-pointer"
            />
            <span>Show Commanded Robot</span>
          </label>

          {/* Divider */}
          <div className="border-t border-gray-600 my-2"></div>

          {/* Follow Modes */}
          <div className="text-[10px] text-gray-400 mb-1">Control Modes</div>
          <label className="flex items-center gap-2 cursor-pointer hover:text-green-400 transition-colors">
            <input
              type="checkbox"
              checked={teachModeEnabled}
              onChange={(e) => setTeachModeEnabled(e.target.checked)}
              className="w-3 h-3 cursor-pointer"
            />
            <span className={teachModeEnabled ? 'text-green-400' : ''}>
              Teach Mode (Input Follows Hardware)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer hover:text-yellow-400 transition-colors">
            <input
              type="checkbox"
              checked={liveControlEnabled}
              onChange={(e) => setLiveControlEnabled(e.target.checked)}
              className="w-3 h-3 cursor-pointer"
            />
            <span className={liveControlEnabled ? 'text-yellow-400 font-semibold' : ''}>
              Live Control (Hardware Follows Commands)
              {liveControlEnabled && <span className="ml-1 text-[9px] bg-yellow-500/20 px-1 py-0.5 rounded">LIVE</span>}
            </span>
            {/* Sync once button - only in joint mode */}
            {motionMode === 'joint' && (
              <button
                onClick={handleSyncOnce}
                className="w-3 h-3 flex items-center justify-center text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sync once: Send commanded position to robot"
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
