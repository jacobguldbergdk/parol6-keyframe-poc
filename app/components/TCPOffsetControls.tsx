'use client';

import { useTimelineStore } from '@/app/lib/store';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

export default function TCPOffsetControls() {
  const tcpOffset = useTimelineStore((state) => state.tcpOffset);
  const setTcpOffset = useTimelineStore((state) => state.setTcpOffset);

  const handleReset = () => {
    setTcpOffset('x', 47);
    setTcpOffset('y', 0);
    setTcpOffset('z', -62);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">TCP Tool Offset</h4>
        <Button onClick={handleReset} variant="ghost" size="sm">
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset
        </Button>
      </div>

      <div className="space-y-3">
        {/* X Offset */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium">X Offset</label>
            <span className="text-xs font-mono text-muted-foreground">
              {tcpOffset.x.toFixed(1)} mm
            </span>
          </div>
          <Slider
            min={-200}
            max={200}
            step={1}
            value={[tcpOffset.x]}
            onValueChange={(values) => setTcpOffset('x', values[0])}
            className="w-full"
          />
        </div>

        {/* Y Offset */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium">Y Offset</label>
            <span className="text-xs font-mono text-muted-foreground">
              {tcpOffset.y.toFixed(1)} mm
            </span>
          </div>
          <Slider
            min={-200}
            max={200}
            step={1}
            value={[tcpOffset.y]}
            onValueChange={(values) => setTcpOffset('y', values[0])}
            className="w-full"
          />
        </div>

        {/* Z Offset */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium">Z Offset</label>
            <span className="text-xs font-mono text-muted-foreground">
              {tcpOffset.z.toFixed(1)} mm
            </span>
          </div>
          <Slider
            min={-200}
            max={200}
            step={1}
            value={[tcpOffset.z]}
            onValueChange={(values) => setTcpOffset('z', values[0])}
            className="w-full"
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground italic mt-2">
        Adjust offset to match tool tip position relative to J6 flange
      </div>
    </div>
  );
}
