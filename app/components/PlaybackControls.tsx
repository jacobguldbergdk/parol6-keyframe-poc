'use client';

import { useTimelineStore } from '@/app/lib/stores/timelineStore';
import { useCommandStore } from '@/app/lib/stores/commandStore';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, Circle } from 'lucide-react';

export default function PlaybackControls() {
  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);
  const currentTime = useTimelineStore((state) => state.playbackState.currentTime);
  const duration = useTimelineStore((state) => state.timeline.duration);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const play = useTimelineStore((state) => state.play);
  const pause = useTimelineStore((state) => state.pause);
  const stop = useTimelineStore((state) => state.stop);
  const recordKeyframes = useTimelineStore((state) => state.recordKeyframes);
  const recordCartesianKeyframes = useTimelineStore((state) => state.recordCartesianKeyframes);

  // Get commanded state for recording
  const commandedJointAngles = useCommandStore((state) => state.commandedJointAngles);
  const commandedTcpPose = useCommandStore((state) => state.commandedTcpPose);

  const handleRecord = () => {
    if (motionMode === 'joint') {
      recordKeyframes(commandedJointAngles);
    } else if (commandedTcpPose) {
      recordCartesianKeyframes(commandedTcpPose);
    }
  };

  return (
    <div className="space-y-3">
      {/* Play/Pause & Stop */}
      <div className="flex gap-2">
        <Button
          onClick={isPlaying ? pause : play}
          variant={isPlaying ? "secondary" : "default"}
          size="sm"
          className="flex-1"
        >
          {isPlaying ? (
            <><Pause className="mr-2 h-4 w-4" /> Pause</>
          ) : (
            <><Play className="mr-2 h-4 w-4" /> Play</>
          )}
        </Button>

        <Button
          onClick={stop}
          variant="destructive"
          size="sm"
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>

      {/* Record Waypoint */}
      <Button
        onClick={handleRecord}
        variant="default"
        size="sm"
        className="w-full"
      >
        <Circle className="mr-2 h-4 w-4 fill-current" />
        Record Waypoint
      </Button>

      {/* Time Display */}
      <div className="text-sm text-muted-foreground font-mono text-center">
        {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
      </div>
    </div>
  );
}
