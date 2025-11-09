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
import { solveIKBackend, IKResult } from '@/app/lib/api';
import { AlertCircle, CheckCircle, Calculator, Network, Copy } from 'lucide-react';

export default function CartesianSliders() {
  const currentCartesianPose = useTimelineStore((state) => state.currentCartesianPose);
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const setCartesianValue = useTimelineStore((state) => state.setCartesianValue);
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);
  const targetRobotRef = useTimelineStore((state) => state.targetRobotRef);
  const targetTcpPosition = useTimelineStore((state) => state.targetTcpPosition);
  const ikAxisMask = useTimelineStore((state) => state.ikAxisMask);
  const setIkAxisMask = useTimelineStore((state) => state.setIkAxisMask);

  const [ikStatus, setIkStatus] = useState<{
    type: 'idle' | 'computing' | 'success' | 'error';
    message?: string;
    distance?: number;
    iterations?: number;
  }>({ type: 'idle' });

  const [backendIkStatus, setBackendIkStatus] = useState<{
    type: 'idle' | 'computing' | 'success' | 'error';
    message?: string;
    iterations?: number;
  }>({ type: 'idle' });

  // Store results for comparison
  const [frontendResult, setFrontendResult] = useState<IKResult | null>(null);
  const [backendResult, setBackendResult] = useState<IKResult | null>(null);

  // Track input field values separately to allow editing
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Handle slider changes: ONLY update target pose, NO IK computation
  // IK will be computed later during timeline playback
  const handleSliderChange = (axis: CartesianAxis, value: number) => {
    setCartesianValue(axis, value);
    // Clear IK status when user changes target
    if (ikStatus.type !== 'idle' || backendIkStatus.type !== 'idle') {
      setIkStatus({ type: 'idle' });
      setBackendIkStatus({ type: 'idle' });
      setFrontendResult(null);
      setBackendResult(null);
    }
  };

  // Compute IK on demand using numerical solver
  const handleComputeIK = () => {
    setIkStatus({ type: 'computing' });

    if (!targetRobotRef) {
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
        targetRobotRef,
        tcpOffset,
        ikAxisMask
      );

      if (ikResult.success && ikResult.jointAngles) {
        // Update joint angles - robot will move to match target
        useTimelineStore.setState({ currentJointAngles: ikResult.jointAngles });
        setIkStatus({
          type: 'success',
          message: `Converged in ${ikResult.iterations} iterations (error: ${ikResult.finalError?.toFixed(2)}mm)`,
          iterations: ikResult.iterations
        });
        // Store result for comparison
        setFrontendResult({
          success: true,
          joints: ikResult.jointAngles,
          iterations: ikResult.iterations,
          source: 'frontend'
        });
      } else {
        setIkStatus({
          type: 'error',
          message: ikResult.error?.message || 'IK failed',
          distance: ikResult.error?.distance,
          iterations: ikResult.iterations
        });
        setFrontendResult({
          success: false,
          error: ikResult.error?.message || 'IK failed',
          iterations: ikResult.iterations,
          source: 'frontend'
        });
      }
    }, 50);
  };

  // Compute IK using backend solver
  const handleComputeBackendIK = async () => {
    setBackendIkStatus({ type: 'computing' });

    try {
      const result = await solveIKBackend(
        currentCartesianPose,
        currentJointAngles,
        ikAxisMask,
        targetRobotRef,  // Pass URDF reference for quaternion extraction
        tcpOffset        // Pass TCP offset for consistency
      );

      setBackendResult(result);

      if (result.success && result.joints) {
        // Update joint angles - robot will move to match target
        useTimelineStore.setState({ currentJointAngles: result.joints });
        setBackendIkStatus({
          type: 'success',
          message: `Backend IK solved in ${result.iterations || '?'} iterations (residual: ${result.residual?.toFixed(4) || 'N/A'})`,
          iterations: result.iterations
        });
      } else {
        setBackendIkStatus({
          type: 'error',
          message: result.error || 'Backend IK failed',
          iterations: result.iterations
        });
      }
    } catch (error) {
      setBackendIkStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      setBackendResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'backend'
      });
    }
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
    if (ikStatus.type !== 'idle' || backendIkStatus.type !== 'idle') {
      setIkStatus({ type: 'idle' });
      setBackendIkStatus({ type: 'idle' });
      setFrontendResult(null);
      setBackendResult(null);
    }
  };

  const handleInputKeyDown = (axis: CartesianAxis, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  // Sync cartesian sliders to match target robot's actual TCP position
  const handleSyncToRobotTcp = () => {
    if (!targetTcpPosition) {
      return;
    }

    // Copy all 6 values from targetTcpPosition to currentCartesianPose
    useTimelineStore.setState({
      currentCartesianPose: {
        X: targetTcpPosition.X,
        Y: targetTcpPosition.Y,
        Z: targetTcpPosition.Z,
        RX: targetTcpPosition.RX,
        RY: targetTcpPosition.RY,
        RZ: targetTcpPosition.RZ
      }
    });

    // Clear IK status since we're resetting to a known position
    setIkStatus({ type: 'idle' });
    setBackendIkStatus({ type: 'idle' });
    setFrontendResult(null);
    setBackendResult(null);
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

      {/* Sync to Robot Button */}
      <div className="mt-4">
        <Button
          onClick={handleSyncToRobotTcp}
          disabled={!targetTcpPosition}
          className="w-full"
          variant="outline"
          size="sm"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy From Robot TCP
        </Button>
        <div className="mt-1 text-xs text-muted-foreground italic text-center">
          Sync sliders to target robot's actual position
        </div>
      </div>

      {/* Compute IK Buttons */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          onClick={handleComputeIK}
          disabled={ikStatus.type === 'computing'}
          className="w-full"
          variant="default"
        >
          <Calculator className="w-4 h-4 mr-2" />
          {ikStatus.type === 'computing' ? 'Computing...' : 'IK (Frontend)'}
        </Button>
        <Button
          onClick={handleComputeBackendIK}
          disabled={backendIkStatus.type === 'computing'}
          className="w-full"
          variant="outline"
        >
          <Network className="w-4 h-4 mr-2" />
          {backendIkStatus.type === 'computing' ? 'Computing...' : 'IK (Backend)'}
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
            <div className="font-semibold text-red-500 mb-1">Frontend IK Failed</div>
            <div className="text-red-400">{ikStatus.message}</div>
            {ikStatus.iterations && (
              <div className="text-red-400/70 mt-1">
                Iterations: {ikStatus.iterations}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backend IK Status Feedback */}
      {backendIkStatus.type === 'success' && (
        <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-400">
            <div className="font-semibold mb-1">Backend IK Success!</div>
            <div>{backendIkStatus.message}</div>
          </div>
        </div>
      )}

      {backendIkStatus.type === 'error' && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <div className="font-semibold text-red-500 mb-1">Backend IK Failed</div>
            <div className="text-red-400">{backendIkStatus.message}</div>
            {backendIkStatus.iterations && (
              <div className="text-red-400/70 mt-1">
                Iterations: {backendIkStatus.iterations}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comparison View */}
      {frontendResult && backendResult && frontendResult.success && backendResult.success && (
        <div className="mt-4 pt-4 border-t">
          <h4 className="text-xs font-semibold mb-3 text-muted-foreground">IK Comparison</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="font-semibold text-muted-foreground">Joint</div>
            <div className="font-semibold text-green-500 text-center">Frontend</div>
            <div className="font-semibold text-blue-500 text-center">Backend</div>

            {['J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map((joint) => {
              const frontendVal = frontendResult.joints?.[joint as keyof typeof frontendResult.joints] || 0;
              const backendVal = backendResult.joints?.[joint as keyof typeof backendResult.joints] || 0;
              const diff = Math.abs(frontendVal - backendVal);
              const isSignificant = diff > 5; // More than 5 degrees difference

              return (
                <div key={joint} className="contents">
                  <div className="text-muted-foreground">{joint}:</div>
                  <div className="font-mono text-center">{frontendVal.toFixed(1)}°</div>
                  <div className="font-mono text-center">{backendVal.toFixed(1)}°</div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 space-y-1">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold">Max Difference:</span>{' '}
              {Math.max(
                ...['J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map((joint) => {
                  const frontendVal = frontendResult.joints?.[joint as keyof typeof frontendResult.joints] || 0;
                  const backendVal = backendResult.joints?.[joint as keyof typeof backendResult.joints] || 0;
                  return Math.abs(frontendVal - backendVal);
                })
              ).toFixed(2)}°
            </div>
            {Math.max(
              ...['J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map((joint) => {
                const frontendVal = frontendResult.joints?.[joint as keyof typeof frontendResult.joints] || 0;
                const backendVal = backendResult.joints?.[joint as keyof typeof backendResult.joints] || 0;
                return Math.abs(frontendVal - backendVal);
              })
            ) > 5 && (
              <div className="text-xs text-amber-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>Significant difference detected (>5°)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
