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
import { TCPPoseDisplay, TCPPoseHeader } from './TCPPoseDisplay';
import { MemoryMonitor, WebGLContextMonitor } from './MemoryMonitor';
import { JOINT_LIMITS, JOINT_ANGLE_OFFSETS, CARTESIAN_LIMITS } from '../lib/constants';
import type { JointName, CartesianAxis } from '../lib/types';
import { inverseKinematicsDetailed } from '../lib/kinematics';
import { getHomePosition, getAllPositions } from '../lib/positions';
import { getApiBaseUrl } from '../lib/apiConfig';
import { moveJoints } from '../lib/api';
import { useSafetyConfirmation } from '../hooks/useSafetyConfirmation';
import { calculateTcpPoseFromUrdf } from '../lib/tcpCalculations';
import { threeJsToRobot } from '../lib/coordinateTransform';
import { Button } from '@/components/ui/button';

// @ts-ignore - urdf-loader doesn't have proper types
import URDFLoader from 'urdf-loader';

interface URDFRobotProps {
  showLabels: boolean;
  hardwareRobotColor: string;
  hardwareRobotTransparency: number;
  commanderRobotColor: string;
  commanderRobotTransparency: number;
}

function URDFRobot({ showLabels, hardwareRobotColor, hardwareRobotTransparency, commanderRobotColor, commanderRobotTransparency }: URDFRobotProps) {
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
                  // Joints use configured hardware robot color and transparency
                  if (!jointName) {
                    clonedMat.opacity = 0; // Fully transparent base
                  } else {
                    const opacity = useRobotConfigStore.getState().hardwareRobotTransparency;
                    const color = useRobotConfigStore.getState().hardwareRobotColor;
                    clonedMat.opacity = opacity;
                    clonedMat.color.set(color);
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

  // Update hardware robot appearance when config changes
  useEffect(() => {
    if (!hardwareRobotRef.current) return;

    hardwareRobotRef.current.traverse((child: any) => {
      if (child.isMesh && child.userData.isActual && child.userData.jointName) {
        // Handle both single materials and material arrays
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        materials.forEach((mat: any) => {
          if (mat && mat.userData.isActualMaterial) {
            // Update color and transparency from config
            mat.color.set(hardwareRobotColor);
            mat.transparent = true;
            mat.opacity = hardwareRobotTransparency;
            mat.depthWrite = false;
            mat.needsUpdate = true;
          }
        });
      }
    });
  }, [hardwareRobotColor, hardwareRobotTransparency]);

  // Update commander robot appearance when config changes
  useEffect(() => {
    if (!robotRef.current) return;

    robotRef.current.traverse((child: any) => {
      if (child.isMesh && !child.userData.isActual && child.userData.jointName) {
        // Handle both single materials and material arrays
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        materials.forEach((mat: any) => {
          if (mat && mat.userData.isCloned) {
            // Update color and transparency from config
            mat.color.set(commanderRobotColor);
            mat.transparent = commanderRobotTransparency < 1.0;
            mat.opacity = commanderRobotTransparency;
            mat.depthWrite = commanderRobotTransparency >= 1.0;
            mat.needsUpdate = true;
          }
        });
      }
    });
  }, [commanderRobotColor, commanderRobotTransparency]);

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
  const hardwareRobotColor = useRobotConfigStore((state) => state.hardwareRobotColor);
  const hardwareRobotTransparency = useRobotConfigStore((state) => state.hardwareRobotTransparency);
  const commanderRobotColor = useRobotConfigStore((state) => state.commanderRobotColor);
  const commanderRobotTransparency = useRobotConfigStore((state) => state.commanderRobotTransparency);

  // Safety confirmation hook
  const { confirmAction, SafetyDialog } = useSafetyConfirmation();

  // Step angles for keyboard controls
  const stepAngle = useInputStore((state) => state.stepAngle);
  const cartesianPositionStep = useInputStore((state) => state.cartesianPositionStep);

  const [showLabels, setShowLabels] = useState(true);

  // Get all saved positions from config
  const savedPositions = getAllPositions();

  // Track last valid cartesian pose for IK failure recovery
  const lastValidCartesianPose = useRef(inputCartesianPose);

  // Handle going to a preset position
  const handleGoToPosition = async (joints: { J1: number; J2: number; J3: number; J4: number; J5: number; J6: number }, presetName: string) => {
    // Safety confirmation check
    const confirmed = await confirmAction(
      `Move robot to "${presetName}" preset position?`,
      'Confirm Preset Movement'
    );
    if (!confirmed) return;

    // Set both input and commanded joint positions
    Object.entries(joints).forEach(([joint, angle]) => {
      setInputJointAngle(joint as any, angle);
      setCommandedJointAngle(joint as any, angle);
    });

    // If in cartesian mode, also update cartesian input sliders and RGB gizmo
    // to match the FK of the joint angles
    if (motionMode === 'cartesian' && targetRobotRef) {
      // Apply joint angles to URDF robot (same logic as kinematics.ts)
      const angleSigns = [1, 1, -1, -1, -1, -1];
      const jointNames = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;

      jointNames.forEach((joint, index) => {
        const angleDeg = joints[joint];
        const sign = angleSigns[index];
        const offset = JOINT_ANGLE_OFFSETS[index];
        const correctedAngleDeg = angleDeg * sign + offset;
        const angleRad = (correctedAngleDeg * Math.PI) / 180;
        const linkName = `L${index + 1}`;
        targetRobotRef.setJointValue(linkName, angleRad);
      });

      // Calculate FK to get cartesian position
      const threeJsPose = calculateTcpPoseFromUrdf(targetRobotRef, tcpOffset);

      if (threeJsPose) {
        // Convert Three.js coords to robot coords
        const robotPose = threeJsToRobot(threeJsPose);

        // Update cartesian input sliders to match
        setInputCartesianValue('X', robotPose.X);
        setInputCartesianValue('Y', robotPose.Y);
        setInputCartesianValue('Z', robotPose.Z);
        setInputCartesianValue('RX', robotPose.RX);
        setInputCartesianValue('RY', robotPose.RY);
        setInputCartesianValue('RZ', robotPose.RZ);
      }
    }
  };

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

      // Handle number keys 1-6 to select joints J1-J6 (but not Alt+number for presets)
      if (event.key >= '1' && event.key <= '6' && !event.altKey) {
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
          // Ctrl/Cmd: coarse control (step × 5)
          adjustmentStep = stepAngle * 5;
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
        // Rotation steps in degrees (from step_angle setting)
        if (event.shiftKey) {
          step = stepAngle / 10; // Fine
        } else if (event.ctrlKey || event.metaKey) {
          step = stepAngle * 5; // Coarse
        } else {
          step = stepAngle; // Normal
        }
      } else {
        // Position steps in mm (from cartesian_position_step_mm setting)
        if (event.shiftKey) {
          step = cartesianPositionStep / 10; // Fine
        } else if (event.ctrlKey || event.metaKey) {
          step = cartesianPositionStep * 5; // Coarse
        } else {
          step = cartesianPositionStep; // Normal
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

  // Spacebar shortcut: Move to Target (Joint) with safety confirmation
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Ignore keyboard events when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Handle spacebar key
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault(); // Prevent page scrolling

        // Safety confirmation check
        const confirmed = await confirmAction(
          'Move robot to target position using joint space motion?',
          'Confirm Joint Movement'
        );
        if (!confirmed) return;

        // Execute joint movement
        try {
          const result = await moveJoints(commandedJointAngles, speed);
          if (!result.success) {
            alert(`Failed to move robot (joint): ${result.error || 'Unknown error'}`);
          }
        } catch (error) {
          console.error('Error moving robot (joint):', error);
          alert('Failed to communicate with robot');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandedJointAngles, speed, confirmAction]);

  // Alt+number shortcuts: Go to preset positions
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Ignore keyboard events when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Handle Alt+number keys for preset positions
      if (event.altKey && event.key >= '1' && event.key <= '9') {
        event.preventDefault(); // Prevent browser shortcuts

        const presetIndex = parseInt(event.key) - 1; // Convert to 0-based index

        // Check if preset exists
        if (presetIndex < savedPositions.length) {
          const position = savedPositions[presetIndex];
          await handleGoToPosition(position.joints, position.name);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [savedPositions, handleGoToPosition]);

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
        {/* TCP Pose Section - Robot Coordinates (Z-up) */}
        <div className="mb-3">
          <div className="font-semibold mb-2 text-sm">TCP Pose (Robot Coords)</div>
          {commandedTcpPose || hardwareTcpPose ? (
            <div>
              <TCPPoseHeader className="text-[10px] text-gray-400" />
              {commandedTcpPose && (
                <TCPPoseDisplay
                  pose={commandedTcpPose}
                  label="Commanded"
                  colors={{
                    x: '#ff8800',  // Orange
                    y: '#00dddd',  // Cyan
                    z: '#dd00dd'   // Magenta/Fuchsia
                  }}
                  className="mb-0.5"
                />
              )}
              <TCPPoseDisplay
                pose={hardwareTcpPose}
                label="Hardware"
                colors={{
                  x: '#ffff00',  // Yellow
                  y: '#88ff00',  // Lime
                  z: '#aa00ff'   // Purple
                }}
              />
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

      {/* Target Preset Buttons - Bottom Left */}
      {savedPositions.length > 0 && (
        <div className="absolute bottom-4 left-4 bg-black/70 text-white p-3 rounded-lg text-xs z-10 backdrop-blur-sm">
          <div className="font-semibold mb-2">Target Presets</div>
          <div className="flex flex-col gap-1.5">
            {savedPositions.map((position, index) => (
              <Button
                key={position.name}
                variant="outline"
                size="sm"
                className="h-8 text-xs justify-start hover:bg-white/10"
                onClick={() => handleGoToPosition(position.joints, position.name)}
              >
                <span className="font-mono mr-2 text-gray-400">{index + 1}.</span>
                {position.name}
                <span className="ml-auto text-[9px] text-gray-500">Alt+{index + 1}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <Canvas camera={{ position: [0.5, 0.4, 0.8], fov: 50 }} onPointerMissed={handleCanvasClick}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Suspense fallback={null}>
          <URDFRobot
            showLabels={showLabels}
            hardwareRobotColor={hardwareRobotColor}
            hardwareRobotTransparency={hardwareRobotTransparency}
            commanderRobotColor={commanderRobotColor}
            commanderRobotTransparency={commanderRobotTransparency}
          />

          {/* Target TCP visualizer (orange/cyan/magenta) - shows commanded position from target robot */}
          {/* NOTE: NO rotation applied - gets world position directly from URDF */}
          {showTargetRobot && <TargetTCPVisualizer />}

          {/* Actual TCP visualizer (yellow/lime/purple) - shows hardware feedback from actual robot */}
          {/* NOTE: NO rotation applied - gets world position directly from URDF */}
          {showHardwareRobot && <ActualTCPVisualizer />}

          {/* Cartesian input gizmo (red/green/blue) - only in cartesian mode */}
          {/* Shows user's cartesian slider input - where they WANT to command the robot */}
          {/* NOTE: NO parent rotation - TargetPoseVisualizer handles coordinate transform internally */}
          {motionMode === 'cartesian' && <TargetPoseVisualizer />}
        </Suspense>
        <OrbitControls target={[0, 0.2, 0]} />

        {/* WebGL Context Loss Monitor - detects and logs WebGL crashes */}
        <WebGLContextMonitor />

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

      {/* Safety confirmation dialog */}
      <SafetyDialog />
    </div>
  );
}
