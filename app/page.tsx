'use client';

import RobotViewer from './components/RobotViewer';
import Timeline from './components/Timeline';
import JointSliders from './components/JointSliders';
import CartesianSliders from './components/CartesianSliders';
import TCPOffsetControls from './components/TCPOffsetControls';
import { usePlayback } from './hooks/usePlayback';
import { useScrubbing } from './hooks/useScrubbing';
import { useTimelineStore } from './lib/store';
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

  const exportTimeline = useTimelineStore((state) => state.exportTimeline);
  const loadTimeline = useTimelineStore((state) => state.loadTimeline);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const setMotionMode = useTimelineStore((state) => state.setMotionMode);

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
        console.error('Failed to load timeline:', error);
        alert('Failed to load timeline file. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <main className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold">🤖 PAROL6 Timeline Editor v2.0</h1>
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
      </header>

      {/* Main Content: 80% 3D View / 20% Controls */}
      <div className="flex-1 flex min-h-0">
        {/* 3D Viewer - 80% */}
        <div className="flex-1 p-4">
          <RobotViewer />
        </div>

        {/* Controls Panel - 20% */}
        <div className="w-80 border-l p-4 overflow-y-auto flex-shrink-0">
          <Card className="p-4 mb-4">
            <h3 className="font-semibold mb-3">
              {motionMode === 'joint' ? 'Joint Angles' : 'Cartesian Position'}
            </h3>
            {motionMode === 'joint' ? <JointSliders /> : <CartesianSliders />}
          </Card>

          <Card className="p-4">
            <TCPOffsetControls />
          </Card>
        </div>
      </div>

      {/* Timeline - Full Width at Bottom */}
      <div className="h-[30vh] border-t">
        <Timeline />
      </div>
    </main>
  );
}
