'use client';

import { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '@/app/lib/store';
import { JOINT_NAMES, JOINT_COLORS, CARTESIAN_AXES } from '@/app/lib/constants';

// Add CSS for outline nodes
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    .outline-node {
      padding-left: 20px;
      font-size: 12px;
      display: flex;
      align-items: center;
      width: 100%;
      font-family: Roboto, 'Helvetica Neue', sans-serif;
      color: white;
      user-select: none;
    }
    .outline-node:hover {
      background: #201616;
    }
  `;
  if (!document.head.querySelector('#timeline-outline-styles')) {
    style.id = 'timeline-outline-styles';
    document.head.appendChild(style);
  }
}

export default function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);

  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const cartesianKeyframes = useTimelineStore((state) => state.timeline.cartesianKeyframes);
  const currentTime = useTimelineStore((state) => state.playbackState.currentTime);
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
  const updateKeyframe = useTimelineStore((state) => state.updateKeyframe);
  const updateCartesianKeyframe = useTimelineStore((state) => state.updateCartesianKeyframe);
  const removeKeyframe = useTimelineStore((state) => state.removeKeyframe);
  const removeCartesianKeyframe = useTimelineStore((state) => state.removeCartesianKeyframe);
  const duration = useTimelineStore((state) => state.timeline.duration);
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<string>>(new Set());

  // Function to register event handlers on timeline instance
  const registerEventHandlers = (timeline: any) => {
    console.log('🔧 Registering event handlers');

    // Listen for time changes (playhead scrubbing)
    if (timeline.onTimeChanged) {
      timeline.onTimeChanged((args: any) => {
        setCurrentTime(args.val / 1000); // Convert ms to seconds
      });
    }

    // Listen for keyframe changes (dragging)
    if (timeline.onKeyframeChanged) {
      timeline.onKeyframeChanged((args: any) => {
        console.log('🎯 onKeyframeChanged FIRED!', args);

        // FIX: keyframe data is at args.target.keyframe, NOT args.target.model
        const keyframe = args.target?.keyframe;
        if (keyframe && keyframe.keyframeId) {
          const oldTime = args.prevVal / 1000;
          const newTime = args.val / 1000;

          const storeState = useTimelineStore.getState();

          if (storeState.timeline.mode === 'joint') {
            const kf = storeState.timeline.keyframes.find(k => k.id === keyframe.keyframeId);
            console.log('🎯 KEYFRAME DRAG (Joint):', {
              keyframeId: keyframe.keyframeId,
              joint: kf?.joint || 'UNKNOWN',
              oldTime: `${oldTime.toFixed(2)}s`,
              newTime: `${newTime.toFixed(2)}s`
            });
            updateKeyframe(keyframe.keyframeId, { time: newTime });
          } else {
            const kf = storeState.timeline.cartesianKeyframes.find(k => k.id === keyframe.keyframeId);
            console.log('🎯 KEYFRAME DRAG (Cartesian):', {
              keyframeId: keyframe.keyframeId,
              axis: kf?.axis || 'UNKNOWN',
              oldTime: `${oldTime.toFixed(2)}s`,
              newTime: `${newTime.toFixed(2)}s`
            });
            updateCartesianKeyframe(keyframe.keyframeId, { time: newTime });
          }
        }
      });
    }

    // Listen for selection changes
    if (timeline.onSelected) {
      timeline.onSelected((args: any) => {
        const selected = timeline.getSelectedKeyframes?.() || [];
        const selectedIds = new Set<string>();
        selected.forEach((kf: any) => {
          if (kf.keyframeId) {
            selectedIds.add(kf.keyframeId);
          }
        });
        setSelectedKeyframes(selectedIds);
      });
    }
  };

  // Ensure we're on the client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !isClient) return;

    console.log('🎬 TIMELINE INIT: Mode =', motionMode);

    // Dynamically import animation-timeline-js only on client
    import('animation-timeline-js').then((module) => {
      const { Timeline: TimelineLib } = module;

      try {
        // Initialize timeline
        const timeline = new TimelineLib({
          id: containerRef.current,
          headerHeight: 45, // Match outline header height
          rowsStyle: {
            height: 40,
            marginBottom: 3
          }
        });

        // Create rows based on motion mode
        const storeState = useTimelineStore.getState();
        const rows = storeState.timeline.mode === 'joint'
          ? JOINT_NAMES.map((joint, index) => ({
              title: `Joint ${index + 1}`, // This is used for outline labels
              keyframes: keyframes
                .filter(kf => kf.joint === joint)
                .map(kf => ({
                  val: kf.time * 1000, // Convert to ms
                  selected: false,
                  // Store keyframe ID for tracking
                  keyframeId: kf.id
                })),
              hidden: false
            }))
          : CARTESIAN_AXES.map((axis) => ({
              title: axis, // X, Y, Z, RX, RY, RZ
              keyframes: cartesianKeyframes
                .filter(kf => kf.axis === axis)
                .map(kf => ({
                  val: kf.time * 1000, // Convert to ms
                  selected: false,
                  keyframeId: kf.id
                })),
              hidden: false
            }));

        timeline.setModel({
          rows: rows
        });

        // Render outline labels
        if (outlineRef.current) {
          outlineRef.current.innerHTML = ''; // Clear existing
          rows.forEach((row: any, index: number) => {
            const div = document.createElement('div');
            div.className = 'outline-node';
            const height = 40; // Match row height
            const marginBottom = 3; // Match row marginBottom
            div.style.maxHeight = div.style.minHeight = `${height}px`;
            div.style.marginBottom = `${marginBottom}px`;
            div.innerText = row.title || `Track ${index}`;
            outlineRef.current?.appendChild(div);
          });
        }

        // Register event handlers
        registerEventHandlers(timeline);

        timelineRef.current = timeline;

        // Sync scrolling between outline and timeline
        const syncScroll = () => {
          if (outlineRef.current && timeline._scrollContainer) {
            outlineRef.current.scrollTop = timeline._scrollContainer.scrollTop;
          }
        };

        if (timeline._scrollContainer) {
          timeline._scrollContainer.addEventListener('scroll', syncScroll);
        }

        return () => {
          if (timeline._scrollContainer) {
            timeline._scrollContainer.removeEventListener('scroll', syncScroll);
          }
          if (timeline.dispose) {
            timeline.dispose();
          }
        };
      } catch (error) {
        console.error('Timeline initialization error:', error);
      }
    }).catch((error) => {
      console.error('Failed to load animation-timeline-js:', error);
    });
  }, [setCurrentTime, updateKeyframe, updateCartesianKeyframe, motionMode, isClient]);

  // Separate effect to update timeline model when keyframes change
  useEffect(() => {
    if (!timelineRef.current || !isClient) return;

    const rows = motionMode === 'joint'
      ? JOINT_NAMES.map((joint, index) => ({
          title: `Joint ${index + 1}`,
          keyframes: keyframes
            .filter(kf => kf.joint === joint)
            .map(kf => ({
              val: kf.time * 1000,
              selected: false,
              keyframeId: kf.id
            })),
          hidden: false
        }))
      : CARTESIAN_AXES.map((axis) => ({
          title: axis,
          keyframes: cartesianKeyframes
            .filter(kf => kf.axis === axis)
            .map(kf => ({
              val: kf.time * 1000,
              selected: false,
              keyframeId: kf.id
            })),
          hidden: false
        }));

    if (motionMode === 'joint') {
      console.log('📊 TIMELINE MODEL UPDATE (Joint):', {
        totalKeyframes: keyframes.length,
        byJoint: JOINT_NAMES.map(joint => ({
          joint,
          count: keyframes.filter(kf => kf.joint === joint).length,
          times: keyframes.filter(kf => kf.joint === joint).map(kf => kf.time.toFixed(2) + 's').join(', ')
        }))
      });
    } else {
      console.log('📊 TIMELINE MODEL UPDATE (Cartesian):', {
        totalKeyframes: cartesianKeyframes.length,
        byAxis: CARTESIAN_AXES.map(axis => ({
          axis,
          count: cartesianKeyframes.filter(kf => kf.axis === axis).length,
          times: cartesianKeyframes.filter(kf => kf.axis === axis).map(kf => kf.time.toFixed(2) + 's').join(', ')
        }))
      });
    }

    try {
      timelineRef.current.setModel({ rows });
      // Re-register event handlers after setModel
      registerEventHandlers(timelineRef.current);
    } catch (e) {
      console.error('Error updating timeline model:', e);
    }
  }, [keyframes, cartesianKeyframes, motionMode, isClient]);

  // Update scrubber position
  useEffect(() => {
    if (timelineRef.current && timelineRef.current.setTime) {
      try {
        timelineRef.current.setTime(currentTime * 1000);
      } catch (e) {
        // Ignore errors during scrubbing
      }
    }
  }, [currentTime]);

  // Add keyboard delete support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKeyframes.size > 0) {
        e.preventDefault();
        // Delete all selected keyframes based on mode
        selectedKeyframes.forEach(id => {
          if (motionMode === 'joint') {
            removeKeyframe(id);
          } else {
            removeCartesianKeyframe(id);
          }
        });
        setSelectedKeyframes(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedKeyframes, motionMode, removeKeyframe, removeCartesianKeyframe]);

  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);
  const play = useTimelineStore((state) => state.play);
  const pause = useTimelineStore((state) => state.pause);
  const stop = useTimelineStore((state) => state.stop);
  const recordKeyframes = useTimelineStore((state) => state.recordKeyframes);
  const recordCartesianKeyframes = useTimelineStore((state) => state.recordCartesianKeyframes);

  const handleRecord = () => {
    if (motionMode === 'joint') {
      recordKeyframes();
    } else {
      recordCartesianKeyframes();
    }
  };

  const handleDeleteSelected = () => {
    selectedKeyframes.forEach(id => {
      if (motionMode === 'joint') {
        removeKeyframe(id);
      } else {
        removeCartesianKeyframe(id);
      }
    });
    setSelectedKeyframes(new Set());
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar - Exact copy of reference site */}
      <div
        className="flex items-center"
        style={{
          backgroundColor: '#3c3c3c',
          paddingLeft: '44px',
          maxHeight: '36px',
          height: '36px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Playback buttons */}
        <button
          onClick={play}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title="Play"
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          play_arrow
        </button>

        <button
          onClick={pause}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title="Pause"
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          pause
        </button>

        <button
          onClick={stop}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title="Stop"
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          stop
        </button>

        <div style={{ width: '1px', background: 'gray', height: '100%', marginRight: '5px' }}></div>

        {/* Record button */}
        <button
          onClick={handleRecord}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title={motionMode === 'joint' ? 'Record Keyframes (All Joints)' : 'Record Keyframes (All Axes)'}
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          fiber_manual_record
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }}></div>

        {/* Right side - Delete and Time */}
        <button
          onClick={handleDeleteSelected}
          disabled={selectedKeyframes.size === 0}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: selectedKeyframes.size === 0 ? '#555555' : '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: selectedKeyframes.size === 0 ? 'default' : 'pointer'
          }}
          title="Remove Selected Keyframes"
          onMouseOver={(e) => { if (selectedKeyframes.size > 0) e.currentTarget.style.background = '#201616' }}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          close
        </button>

        {/* Time Display */}
        <div style={{
          color: '#adadad',
          fontSize: '12px',
          fontFamily: 'monospace',
          marginRight: '10px'
        }}>
          {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
        </div>
      </div>

      {/* Footer: Outline + Timeline */}
      <div style={{ display: 'flex', flex: 1, minHeight: '200px' }}>
        {/* Outline Panel - Left */}
        <div style={{
          width: '150px',
          background: '#161616',
          borderRight: '1px solid #3c3c3c',
          overflow: 'hidden'
        }}>
          <div style={{ height: '45px', background: '#3c3c3c' }}></div>
          <div
            ref={outlineRef}
            style={{ overflowY: 'auto', overflowX: 'hidden' }}
          />
        </div>

        {/* Timeline Canvas - Right */}
        <div
          ref={containerRef}
          style={{ flex: 1, background: '#161616' }}
        />
      </div>
    </div>
  );
}
