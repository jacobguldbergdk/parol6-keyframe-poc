'use client';

import { useEffect, useRef } from 'react';
import Header from '../components/Header';
import RobotViewer from '../components/RobotViewer';
import CompactJointSliders from '../components/CompactJointSliders';
import CartesianSliders from '../components/CartesianSliders';
import ControlOptions from '../components/ControlOptions';
import RobotStatusPanel from '../components/RobotStatusPanel';
import CommandLog from '../components/CommandLog';
import { useConfigStore } from '../lib/configStore';
import { useActualFollowsTarget } from '../hooks/useActualFollowsTarget';
import { useTimelineStore } from '../lib/stores/timelineStore';
import { useCommandStore } from '../lib/stores/commandStore';
import { useInputStore } from '../lib/stores/inputStore';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MotionMode } from '../lib/types';

export default function ControlPage() {
  // Fetch config from backend on mount
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  // Get mode and related state
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const setMotionMode = useTimelineStore((state) => state.setMotionMode);
  const commandedTcpPose = useCommandStore((state) => state.commandedTcpPose);

  // Track if we've synced the RGB gizmo for current cartesian session
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Enable live control mode - automatically sends move commands when target changes
  useActualFollowsTarget();

  // Auto-sync cartesian pose to robot TCP when switching to cartesian mode
  // Only runs ONCE per cartesian session to prevent feedback loop
  useEffect(() => {
    if (motionMode === 'cartesian' && commandedTcpPose && !hasSyncedRef.current) {
      useInputStore.setState({
        inputCartesianPose: {
          X: commandedTcpPose.X,
          Y: commandedTcpPose.Y,
          Z: commandedTcpPose.Z,
          RX: commandedTcpPose.RX,
          RY: commandedTcpPose.RY,
          RZ: commandedTcpPose.RZ
        }
      });
      hasSyncedRef.current = true;
    }

    // Reset sync flag when leaving cartesian mode
    if (motionMode !== 'cartesian') {
      hasSyncedRef.current = false;
    }
  }, [motionMode, commandedTcpPose]);

  // Handle mode change
  const handleModeChange = (newMode: string) => {
    if (newMode === 'joint' || newMode === 'cartesian') {
      setMotionMode(newMode as MotionMode);
    }
  };

  return (
    <main className="h-screen flex flex-col bg-background">
      <Header />

      {/* Main Content Grid */}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-4">
        {/* Top Row: 3D View (flexible) | Control Panels (fixed 600px) */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* 3D Robot View - Flexible width */}
          <div className="flex-1 min-w-0">
            <RobotViewer />
          </div>

          {/* Control Panels Column - Fixed 600px width */}
          <div className="w-[600px] flex-shrink-0 flex flex-col gap-4">
            {/* Mode Toggle */}
            <div className="bg-card rounded-lg border p-3 flex items-center gap-3">
              <span className="text-sm font-semibold text-muted-foreground">Motion Mode:</span>
              <ToggleGroup type="single" value={motionMode} onValueChange={handleModeChange}>
                <ToggleGroupItem value="joint" className="px-4">
                  Joint Space
                </ToggleGroupItem>
                <ToggleGroupItem value="cartesian" className="px-4">
                  Cartesian Space
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Row 1: Control Sliders (300px) + Options (300px) */}
            <div className="flex gap-4 h-[55%]">
              {/* Control Sliders - Fixed 300px - Conditional rendering based on mode */}
              <div className="w-[300px] flex-shrink-0">
                {motionMode === 'joint' ? (
                  <CompactJointSliders />
                ) : (
                  <div className="bg-card rounded-lg border p-4 h-full overflow-y-auto">
                    <h2 className="text-sm font-semibold mb-4">Cartesian Control</h2>
                    <CartesianSliders />
                  </div>
                )}
              </div>

              {/* Control Options - Fixed 300px */}
              <div className="w-[300px] flex-shrink-0">
                <ControlOptions />
              </div>
            </div>

            {/* Row 2: Robot Status - Full 600px width */}
            <div className="flex-1 min-h-0">
              <RobotStatusPanel />
            </div>
          </div>
        </div>

        {/* Bottom Row: Command Log */}
        <div className="h-[180px]">
          <CommandLog />
        </div>
      </div>
    </main>
  );
}
