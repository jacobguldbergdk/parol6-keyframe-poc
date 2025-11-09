'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useState } from 'react';
import { useTimelineStore } from '../lib/store';
import { Move, AlertTriangle, StopCircle } from 'lucide-react';
import { getApiBaseUrl } from '../lib/apiConfig';
import { moveJoints, movePose, moveCartesian } from '../lib/api';
import { getAllPositions } from '../lib/positions';
import { useConfigStore } from '../lib/configStore';

export default function ControlOptions() {
  const [isMoving, setIsMoving] = useState(false);
  const [isHoming, setIsHoming] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const stepAngle = useTimelineStore((state) => state.stepAngle);
  const setStepAngle = useTimelineStore((state) => state.setStepAngle);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const targetTcpPosition = useTimelineStore((state) => state.targetTcpPosition);
  const robotStatus = useTimelineStore((state) => state.robotStatus);
  const speed = useTimelineStore((state) => state.speed);
  const setSpeed = useTimelineStore((state) => state.setSpeed);
  const accel = useTimelineStore((state) => state.accel);
  const setAccel = useTimelineStore((state) => state.setAccel);
  const setJointAngle = useTimelineStore((state) => state.setJointAngle);
  const config = useConfigStore((state) => state.config);

  // Get all saved positions from config
  const savedPositions = getAllPositions();

  const handleMoveJoint = async () => {
    setIsMoving(true);
    try {
      const result = await moveJoints(currentJointAngles, speed);
      if (!result.success) {
        alert(`Failed to move robot (joint): ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error moving robot (joint):', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsMoving(false);
    }
  };

  const handleMovePose = async () => {
    if (!targetTcpPosition) {
      alert('Target position not available yet. Please wait for robot to load.');
      return;
    }
    setIsMoving(true);
    try {
      const result = await movePose(targetTcpPosition, speed);
      if (!result.success) {
        alert(`Failed to move robot (pose): ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error moving robot (pose):', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsMoving(false);
    }
  };

  const handleMoveCartesian = async () => {
    if (!targetTcpPosition) {
      alert('Target position not available yet. Please wait for robot to load.');
      return;
    }
    setIsMoving(true);
    try {
      const result = await moveCartesian(targetTcpPosition, speed);
      if (!result.success) {
        alert(`Failed to move robot (cartesian): ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error moving robot (cartesian):', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsMoving(false);
    }
  };

  const handleHome = async () => {
    setIsHoming(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/robot/home`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to home robot:', error);
        alert(`Failed to home robot: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error homing robot:', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsHoming(false);
    }
  };

  const handleClearEstop = async () => {
    setIsClearing(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/robot/clear-estop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to clear E-stop:', error);
        alert(`Failed to clear E-stop: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error clearing E-stop:', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsClearing(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/robot/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to stop robot:', error);
        alert(`Failed to stop robot: ${error.detail || 'Unknown error'}`);
      } else {
        // Reset moving states when stop is successful
        setIsMoving(false);
        setIsHoming(false);
      }
    } catch (error) {
      console.error('Error stopping robot:', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsStopping(false);
    }
  };

  const handleGoToPosition = (joints: { J1: number; J2: number; J3: number; J4: number; J5: number; J6: number }) => {
    // Set target robot to specified position
    Object.entries(joints).forEach(([joint, angle]) => {
      setJointAngle(joint as any, angle);
    });
  };

  return (
    <Card className="p-3 h-full flex flex-col">
      <h2 className="text-sm font-semibold mb-3">Options</h2>

      <div className="space-y-3 flex-1">
        {/* Speed Control */}
        <div>
          <label className="text-xs font-medium mb-1.5 block">
            Speed: {speed}%
          </label>
          <Slider
            value={[speed]}
            onValueChange={(value) => setSpeed(value[0])}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
        </div>

        {/* Acceleration Control */}
        <div>
          <label className="text-xs font-medium mb-1.5 block">
            Accel: {accel}%
          </label>
          <Slider
            value={[accel]}
            onValueChange={(value) => setAccel(value[0])}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
        </div>

        {/* Step Angle Control */}
        <div>
          <label className="text-xs font-medium mb-1.5 block">
            Step: {stepAngle.toFixed(2)}°
          </label>
          <Slider
            value={[stepAngle]}
            onValueChange={(value) => setStepAngle(value[0])}
            min={0.01}
            max={10}
            step={0.01}
            className="w-full"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-1.5 mt-3 pt-3 border-t">
        {/* E-Stop Clear Button - Show prominently when E-stop is active */}
        {robotStatus?.estop_active && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs w-full font-semibold"
            onClick={handleClearEstop}
            disabled={isClearing}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            {isClearing ? 'Clearing...' : 'Clear E-Stop'}
          </Button>
        )}

        {/* Stop Button - Show prominently when robot is moving */}
        {(isMoving || isHoming) && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs w-full font-semibold bg-red-600 hover:bg-red-700"
            onClick={handleStop}
            disabled={isStopping}
          >
            <StopCircle className="h-3.5 w-3.5 mr-1.5" />
            {isStopping ? 'Stopping...' : 'STOP Robot'}
          </Button>
        )}

        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs w-full font-semibold"
          onClick={handleMoveJoint}
          disabled={isMoving || isHoming}
        >
          <Move className="h-3.5 w-3.5 mr-1.5" />
          {isMoving ? 'Moving...' : 'Move to Target (Joint)'}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs w-full font-semibold"
          onClick={handleMovePose}
          disabled={isMoving || isHoming}
        >
          <Move className="h-3.5 w-3.5 mr-1.5" />
          {isMoving ? 'Moving...' : 'Move to Target (Pose)'}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-8 text-xs w-full font-semibold"
          onClick={handleMoveCartesian}
          disabled={isMoving || isHoming}
        >
          <Move className="h-3.5 w-3.5 mr-1.5" />
          {isMoving ? 'Moving...' : 'Move to Target (Cartesian)'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs w-full"
          onClick={handleHome}
          disabled={isHoming || isMoving}
        >
          {isHoming ? 'Homing...' : 'Home Position'}
        </Button>

        {/* Preset Position Buttons - Dynamic from config.yaml */}
        {savedPositions.length > 0 && (
          <div className="pt-2 border-t">
            <label className="text-xs font-medium mb-1.5 block">Target Presets</label>
            <div className="flex gap-1.5 flex-wrap">
              {savedPositions.map((position) => (
                <Button
                  key={position.name}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex-1 min-w-[70px]"
                  onClick={() => handleGoToPosition(position.joints)}
                  disabled={isMoving || isHoming}
                >
                  {position.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
