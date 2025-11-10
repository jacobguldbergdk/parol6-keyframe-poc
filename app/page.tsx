'use client';

import { useEffect, useRef } from 'react';
import Header from './components/Header';
import RobotViewer from './components/RobotViewer';
import Timeline from './components/Timeline';
import JointSliders from './components/JointSliders';
import CartesianSliders from './components/CartesianSliders';
import ControlOptions from './components/ControlOptions';
import { usePlayback } from './hooks/usePlayback';
import { useScrubbing } from './hooks/useScrubbing';
import { useActualFollowsTarget } from './hooks/useActualFollowsTarget';
import { useTimelineStore } from './lib/stores/timelineStore';
import { useRobotConfigStore } from './lib/stores/robotConfigStore';
import { useCommandStore } from './lib/stores/commandStore';
import { useInputStore } from './lib/stores/inputStore';
import { useConfigStore } from './lib/configStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Download, Upload } from 'lucide-react';
import type { MotionMode } from './lib/types';

export default function Home() {
  // Initialize playback loop
  usePlayback();

  // Initialize scrubbing (robot follows playhead when not playing)
  useScrubbing();

  // Enable live control mode - automatically sends move commands when target changes
  useActualFollowsTarget();

  const exportTimeline = useTimelineStore((state) => state.exportTimeline);
  const loadTimeline = useTimelineStore((state) => state.loadTimeline);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const setMotionMode = useTimelineStore((state) => state.setMotionMode);
  const setTcpOffset = useRobotConfigStore((state) => state.setTcpOffset);
  const setHardwareRobotColor = useRobotConfigStore((state) => state.setHardwareRobotColor);
  const setHardwareRobotTransparency = useRobotConfigStore((state) => state.setHardwareRobotTransparency);
  const setCommanderRobotColor = useRobotConfigStore((state) => state.setCommanderRobotColor);
  const setCommanderRobotTransparency = useRobotConfigStore((state) => state.setCommanderRobotTransparency);
  const setSpeed = useCommandStore((state) => state.setSpeed);
  const commandedTcpPose = useCommandStore((state) => state.commandedTcpPose);

  // Track if we've synced the RGB gizmo for current cartesian session
  const hasSyncedRef = useRef(false);

  const { config, fetchConfig } = useConfigStore();

  // Initialize TCP offset from config.yaml on mount
  useEffect(() => {
    const initializeConfig = async () => {
      await fetchConfig();
    };
    initializeConfig();
  }, [fetchConfig]);

  // Sync tcp_offset from config to robotConfigStore when config loads
  useEffect(() => {
    if (config?.ui?.tcp_offset) {
      setTcpOffset('x', config.ui.tcp_offset.x);
      setTcpOffset('y', config.ui.tcp_offset.y);
      setTcpOffset('z', config.ui.tcp_offset.z);
    }
  }, [config, setTcpOffset]);

  // Sync default_speed_percentage from config to commandStore when config loads
  useEffect(() => {
    if (config?.ui?.default_speed_percentage !== undefined) {
      setSpeed(config.ui.default_speed_percentage);
    }
  }, [config, setSpeed]);

  // Sync robot appearance from config to robotConfigStore when config loads
  useEffect(() => {
    if (config?.ui?.hardware_robot) {
      setHardwareRobotColor(config.ui.hardware_robot.color);
      setHardwareRobotTransparency(config.ui.hardware_robot.transparency);
    }
    if (config?.ui?.commander_robot) {
      setCommanderRobotColor(config.ui.commander_robot.color);
      setCommanderRobotTransparency(config.ui.commander_robot.transparency);
    }
  }, [config, setHardwareRobotColor, setHardwareRobotTransparency, setCommanderRobotColor, setCommanderRobotTransparency]);

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

  const handleModeChange = (value: string) => {
    const newMode = value as MotionMode;
    if (!newMode || newMode === motionMode) return;

    // Confirm mode switch (clears timeline)
    if (confirm('Switching motion mode will clear the current timeline. Continue?')) {
      setMotionMode(newMode);
    }
  };

  const handleExport = () => {
    const json = exportTimeline();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timeline.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const timeline = JSON.parse(event.target?.result as string);
        loadTimeline(timeline);
      } catch (error) {
        alert('Failed to load timeline file. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <main className="h-screen flex flex-col bg-background">
      {/* Header */}
      <Header />

      <div className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-semibold">Timeline Editor</h2>
          <ToggleGroup type="single" value={motionMode} onValueChange={handleModeChange}>
            <ToggleGroupItem value="joint">Joint Space</ToggleGroupItem>
            <ToggleGroupItem value="cartesian">Cartesian Space</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button asChild variant="outline" size="sm">
            <label className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              Import
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          </Button>
        </div>
      </div>

      {/* Main Content: 80% 3D View / 20% Controls */}
      <div className="flex-1 flex min-h-0">
        {/* 3D Viewer - 80% */}
        <div className="flex-1 p-4">
          <RobotViewer />
        </div>

        {/* Controls Panel - 20% */}
        <div className="w-80 border-l p-4 overflow-y-auto flex-shrink-0 space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-3">
              {motionMode === 'joint' ? 'Joint Angles' : 'Cartesian Position'}
            </h3>
            {motionMode === 'joint' ? <JointSliders /> : <CartesianSliders />}
          </Card>

          <ControlOptions />
        </div>
      </div>

      {/* Timeline - Full Width at Bottom */}
      <div className="h-[30vh] border-t">
        <Timeline />
      </div>
    </main>
  );
}
