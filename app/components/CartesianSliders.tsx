'use client';

import { useState } from 'react';
import { useTimelineStore } from '@/app/lib/store';
import { CARTESIAN_AXES, CARTESIAN_LIMITS } from '@/app/lib/constants';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { CartesianAxis, IkAxisMask } from '@/app/lib/types';
import { inverseKinematicsDetailed } from '@/app/lib/kinematics';
import { AlertCircle, CheckCircle, Calculator } from 'lucide-react';

export default function CartesianSliders() {
  const currentCartesianPose = useTimelineStore((state) => state.currentCartesianPose);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const setCartesianValue = useTimelineStore((state) => state.setCartesianValue);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);
  const urdfRobotRef = useTimelineStore((state) => state.urdfRobotRef);
  const ikAxisMask = useTimelineStore((state) => state.ikAxisMask);
  const setIkAxisMask = useTimelineStore((state) => state.setIkAxisMask);

  const [ikStatus, setIkStatus] = useState<{
    type: 'idle' | 'computing' | 'success' | 'error';
    message?: string;
    distance?: number;
    iterations?: number;
  }>({ type: 'idle' });

  // Track input field values separately to allow editing
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Handle slider changes: ONLY update target pose, NO IK computation
  // IK will be computed later during timeline playback
  const handleSliderChange = (axis: CartesianAxis, value: number) => {
    console.log(`💡 CARTESIAN SLIDER: User changed ${axis} to ${value.toFixed(1)}`);
    setCartesianValue(axis, value);
    // Clear IK status when user changes target
    if (ikStatus.type !== 'idle') {
      setIkStatus({ type: 'idle' });
    }
  };

  // Compute IK on demand using numerical solver
  const handleComputeIK = () => {
    console.log('🎯 Computing IK for target TCP pose:', currentCartesianPose);
    setIkStatus({ type: 'computing' });

    if (!urdfRobotRef) {
      setIkStatus({
        type: 'error',
        message: 'URDF robot model not loaded yet. Please wait...'
      });
      return;
    }

    // Small delay to show loading state
    setTimeout(() => {
      // Target is TCP position - numerical IK handles TCP offset internally
      const ikResult = inverseKinematicsDetailed(
        currentCartesianPose,
        currentJointAngles,
        urdfRobotRef,
        tcpOffset,
        ikAxisMask
      );

      if (ikResult.success && ikResult.jointAngles) {
        console.log('✅ IK success:', ikResult.jointAngles);
        // Update joint angles - robot will move to match target
        useTimelineStore.setState({ currentJointAngles: ikResult.jointAngles });
        setIkStatus({
          type: 'success',
          message: `Converged in ${ikResult.iterations} iterations (error: ${ikResult.finalError?.toFixed(2)}mm)`,
          iterations: ikResult.iterations
        });
      } else {
        console.warn('❌ IK failed:', ikResult.error);
        setIkStatus({
          type: 'error',
          message: ikResult.error?.message || 'IK failed',
          distance: ikResult.error?.distance,
          iterations: ikResult.iterations
        });
      }
    }, 50);
  };


  const getUnit = (axis: CartesianAxis) => {
    return ['X', 'Y', 'Z'].includes(axis) ? 'mm' : '°';
  };

  const getStep = (axis: CartesianAxis) => {
    return ['X', 'Y', 'Z'].includes(axis) ? 1 : 0.1;
  };

  const handleInputChange = (axis: CartesianAxis, value: string) => {
    // Allow typing (including partial numbers like "45." or "-")
    setInputValues({ ...inputValues, [axis]: value });
  };

  const handleInputBlur = (axis: CartesianAxis) => {
    const value = inputValues[axis];
    if (value !== undefined && value !== '') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        const limits = CARTESIAN_LIMITS[axis];
        // Clamp to limits
        const clampedValue = Math.max(limits.min, Math.min(limits.max, numValue));
        setCartesianValue(axis, clampedValue);
      }
    }
    // Clear input value to revert to showing currentCartesianPose
    setInputValues({ ...inputValues, [axis]: '' });
    // Clear IK status when user changes target
    if (ikStatus.type !== 'idle') {
      setIkStatus({ type: 'idle' });
    }
  };

  const handleInputKeyDown = (axis: CartesianAxis, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="space-y-4">
      {/* Cartesian Sliders */}
      <div className="space-y-4">
        {CARTESIAN_AXES.map((axis) => {
          const limits = CARTESIAN_LIMITS[axis];
          const unit = getUnit(axis);
          const step = getStep(axis);
          const currentValue = currentCartesianPose[axis];
          const displayValue = inputValues[axis] !== undefined && inputValues[axis] !== ''
            ? inputValues[axis]
            : currentValue.toFixed(1);

          return (
            <div key={axis} className="space-y-2">
              <div className="flex justify-between items-center text-sm gap-2">
                <span className="font-medium">{axis}</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    value={displayValue}
                    onChange={(e) => handleInputChange(axis, e.target.value)}
                    onBlur={() => handleInputBlur(axis)}
                    onKeyDown={(e) => handleInputKeyDown(axis, e)}
                    className="w-16 h-7 px-2 text-xs font-mono text-right"
                  />
                  <span className="text-xs text-muted-foreground">{unit}</span>
                </div>
              </div>
              <Slider
                min={limits.min}
                max={limits.max}
                step={step}
                value={[currentValue]}
                onValueChange={(values) => handleSliderChange(axis, values[0])}
                className="w-full"
              />
            </div>
          );
        })}
      </div>

      {/* IK Axis Mask Selector */}
      <div className="mt-4 pt-4 border-t">
        <div className="text-xs font-semibold mb-2 text-muted-foreground">IK Solve Axes:</div>
        <div className="flex flex-wrap gap-3">
          {(['X', 'Y', 'Z', 'RX', 'RY', 'RZ'] as const).map((axis) => (
            <label key={axis} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={ikAxisMask[axis]}
                onCheckedChange={(checked) => {
                  setIkAxisMask({ [axis]: checked === true });
                }}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">
                {axis}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2 text-xs text-muted-foreground italic">
          Select which axes to solve during IK computation
        </div>
      </div>

      {/* Compute IK Button */}
      <div className="mt-4">
        <Button
          onClick={handleComputeIK}
          disabled={ikStatus.type === 'computing'}
          className="w-full"
          variant="default"
        >
          <Calculator className="w-4 h-4 mr-2" />
          {ikStatus.type === 'computing' ? 'Computing IK...' : 'Compute IK'}
        </Button>
      </div>

      {/* IK Status Feedback */}
      {ikStatus.type === 'success' && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-green-400">
            <div className="font-semibold mb-1">IK Success!</div>
            <div>{ikStatus.message}</div>
          </div>
        </div>
      )}

      {ikStatus.type === 'error' && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <div className="font-semibold text-red-500 mb-1">IK Failed</div>
            <div className="text-red-400">{ikStatus.message}</div>
            {ikStatus.iterations && (
              <div className="text-red-400/70 mt-1">
                Iterations: {ikStatus.iterations}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current Joint Angles Display (read-only) */}
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Current Joint Angles (Robot Position)</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {['J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map((joint) => (
            <div key={joint} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{joint}:</span>
              <span className="font-mono">
                {currentJointAngles[joint as keyof typeof currentJointAngles].toFixed(1)}°
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-muted-foreground italic">
          Use "Compute IK" button to move robot to target position
        </div>
      </div>
    </div>
  );
}
