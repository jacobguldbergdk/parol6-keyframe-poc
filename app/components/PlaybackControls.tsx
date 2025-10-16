'use client';

import { useTimelineStore } from '@/app/lib/store';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, Circle } from 'lucide-react';

export default function PlaybackControls() {
  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);
  const currentTime = useTimelineStore((state) => state.playbackState.currentTime);
  const duration = useTimelineStore((state) => state.timeline.duration);
  const play = useTimelineStore((state) => state.play);
  const pause = useTimelineStore((state) => state.pause);
  const stop = useTimelineStore((state) => state.stop);
  const recordWaypoint = useTimelineStore((state) => state.recordWaypoint);

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
        onClick={recordWaypoint}
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
