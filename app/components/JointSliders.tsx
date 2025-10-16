'use client';

import { useState } from 'react';
import { useTimelineStore } from '@/app/lib/store';
import { JOINT_NAMES, JOINT_LIMITS } from '@/app/lib/constants';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';

export default function JointSliders() {
  const currentJointAngles = useTimelineStore((state) => state.currentJointAngles);
  const setJointAngle = useTimelineStore((state) => state.setJointAngle);

  // Track input field values separately to allow editing
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const handleInputChange = (joint: string, value: string) => {
    // Allow typing (including partial numbers like "45." or "-")
    setInputValues({ ...inputValues, [joint]: value });
  };

  const handleInputBlur = (joint: string) => {
    const value = inputValues[joint];
    if (value !== undefined && value !== '') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        const limits = JOINT_LIMITS[joint as keyof typeof JOINT_LIMITS];
        // Clamp to joint limits
        const clampedValue = Math.max(limits.min, Math.min(limits.max, numValue));
        setJointAngle(joint as any, clampedValue);
      }
    }
    // Clear input value to revert to showing currentJointAngles
    setInputValues({ ...inputValues, [joint]: '' });
  };

  const handleInputKeyDown = (joint: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="space-y-4">
      {JOINT_NAMES.map((joint) => {
        const limits = JOINT_LIMITS[joint];
        const currentValue = currentJointAngles[joint];
        const displayValue = inputValues[joint] !== undefined && inputValues[joint] !== ''
          ? inputValues[joint]
          : currentValue.toFixed(1);

        return (
          <div key={joint} className="space-y-2">
            <div className="flex justify-between items-center text-sm gap-2">
              <span className="font-medium">{joint}</span>
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  value={displayValue}
                  onChange={(e) => handleInputChange(joint, e.target.value)}
                  onBlur={() => handleInputBlur(joint)}
                  onKeyDown={(e) => handleInputKeyDown(joint, e)}
                  className="w-16 h-7 px-2 text-xs font-mono text-right"
                />
                <span className="text-xs text-muted-foreground">°</span>
              </div>
            </div>
            <Slider
              min={limits.min}
              max={limits.max}
              step={0.1}
              value={[currentValue]}
              onValueChange={(values) => setJointAngle(joint as any, values[0])}
              className="w-full"
            />
          </div>
        );
      })}
    </div>
  );
}
