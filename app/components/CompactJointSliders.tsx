'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useTimelineStore } from '../lib/store';
import { JOINT_LIMITS, JOINT_NAMES } from '../lib/constants';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CompactJointSliders() {
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const setJointAngle = useTimelineStore((state) => state.setJointAngle);
  const stepAngle = useTimelineStore((state) => state.stepAngle);
  const targetFollowsActual = useTimelineStore((state) => state.targetFollowsActual);
  const actualFollowsTarget = useTimelineStore((state) => state.actualFollowsTarget);

  // Get actual values from store (hardware feedback)
  const actualJointAngles = useTimelineStore((state) => state.actualJointAngles) || currentJointAngles;

  const handleStepJoint = (joint: string, direction: number) => {
    const currentValue = currentJointAngles[joint as keyof typeof currentJointAngles];
    const limits = JOINT_LIMITS[joint as keyof typeof JOINT_LIMITS];
    const newValue = Math.max(limits.min, Math.min(limits.max, currentValue + (direction * stepAngle)));
    setJointAngle(joint as any, newValue);
  };

  return (
    <Card className="p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Joint Control</h2>
        {actualFollowsTarget && (
          <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded font-semibold">
            ⚡ LIVE MODE
          </span>
        )}
        {targetFollowsActual && (
          <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-1 rounded font-semibold">
            🔗 FOLLOWING
          </span>
        )}
      </div>

      {/* Joint Sliders - Compact */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {JOINT_NAMES.map((joint) => {
          const limits = JOINT_LIMITS[joint];
          const setValue = currentJointAngles[joint];
          const actualValue = actualJointAngles[joint];
          const error = Math.abs(setValue - actualValue);

          // Color coding based on tracking error
          let errorColor = 'text-green-500';
          if (error > 1 && error <= 5) {
            errorColor = 'text-yellow-500';
          } else if (error > 5) {
            errorColor = 'text-red-500';
          }

          return (
            <div key={joint} className="space-y-1 pb-2 border-b last:border-b-0">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium">
                  {joint}
                </span>
                <span className="text-xs text-muted-foreground">
                  [{limits.min.toFixed(0)}° to {limits.max.toFixed(0)}°]
                </span>
              </div>

              {/* Set Value Slider */}
              <div className="flex items-center gap-2" title={targetFollowsActual ? 'Controls disabled - Target is following Actual robot' : ''}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStepJoint(joint, -1)}
                  className="h-6 w-6 p-0"
                  disabled={targetFollowsActual}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <div className="flex-1">
                  <Slider
                    value={[setValue]}
                    onValueChange={(value) => setJointAngle(joint as any, value[0])}
                    min={limits.min}
                    max={limits.max}
                    step={0.1}
                    className="w-full"
                    disabled={targetFollowsActual}
                    tabIndex={-1}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStepJoint(joint, 1)}
                  className="h-6 w-6 p-0"
                  disabled={targetFollowsActual}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <span className={`text-xs font-mono w-12 text-right ${targetFollowsActual ? 'opacity-50' : ''}`}>
                  {setValue.toFixed(1)}°
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
