'use client';

import { useEffect } from 'react';
import { useRobotWebSocket } from '../hooks/useRobotWebSocket';
import { useTimelineStore } from '../lib/store';
import { useConfigStore } from '../lib/configStore';

/**
 * WebSocketConnector - Invisible component that manages WebSocket connection
 * and syncs robot feedback data to the Zustand store.
 *
 * This component should be placed once at the root level of the control page.
 */
export default function WebSocketConnector() {
  // Get WebSocket config from config store
  const config = useConfigStore((state) => state.config);

  const {
    connectionState,
    robotData,
  } = useRobotWebSocket(undefined, {
    topics: config?.frontend.websocket.topics || ['status', 'joints', 'pose', 'io', 'gripper'],
    rateHz: config?.frontend.websocket.default_rate_hz || 10,
    logLevel: (config?.logging.level as any) || 'INFO',
  });

  // Get store actions
  const setConnectionStatus = useTimelineStore((state) => state.setConnectionStatus);
  const setActualJointAngles = useTimelineStore((state) => state.setActualJointAngles);
  const setActualCartesianPose = useTimelineStore((state) => state.setActualCartesianPose);
  const setIOStatus = useTimelineStore((state) => state.setIOStatus);
  const setGripperStatus = useTimelineStore((state) => state.setGripperStatus);
  const setRobotStatus = useTimelineStore((state) => state.setRobotStatus);
  const setJointHomed = useTimelineStore((state) => state.setJointHomed);

  // Update connection status when it changes
  useEffect(() => {
    setConnectionStatus(connectionState);
  }, [connectionState, setConnectionStatus]);

  // Update robot data in store when it changes
  useEffect(() => {
    // Update joint angles if available
    if (robotData.joints?.angles) {
      const angles = robotData.joints.angles;
      // Convert array [J1, J2, J3, J4, J5, J6] to object
      setActualJointAngles({
        J1: angles[0],
        J2: angles[1],
        J3: angles[2],
        J4: angles[3],
        J5: angles[4],
        J6: angles[5],
      });
    }
  }, [robotData.joints, setActualJointAngles]);

  useEffect(() => {
    // Update cartesian pose if available
    if (robotData.pose) {
      setActualCartesianPose({
        X: robotData.pose.x,
        Y: robotData.pose.y,
        Z: robotData.pose.z,
        RX: robotData.pose.roll,
        RY: robotData.pose.pitch,
        RZ: robotData.pose.yaw,
      });
    }
  }, [robotData.pose, setActualCartesianPose]);

  useEffect(() => {
    // Update I/O status if available
    if (robotData.io) {
      setIOStatus(robotData.io);
    }
  }, [robotData.io, setIOStatus]);

  useEffect(() => {
    // Update gripper status if available
    if (robotData.gripper) {
      setGripperStatus(robotData.gripper);
    }
  }, [robotData.gripper, setGripperStatus]);

  useEffect(() => {
    // Update robot status if available
    if (robotData.status) {
      setRobotStatus(robotData.status);
    }
  }, [robotData.status, setRobotStatus]);

  useEffect(() => {
    // Update homing status if available
    if (robotData.status?.homed && Array.isArray(robotData.status.homed)) {
      const jointNames = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;
      robotData.status.homed.forEach((isHomed, index) => {
        if (index < 6) {
          setJointHomed(jointNames[index], isHomed);
        }
      });
    }
  }, [robotData.status?.homed, setJointHomed]);

  // This component renders nothing - it only manages WebSocket connection
  return null;
}
