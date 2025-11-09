# Store Architecture Migration Status

This document tracks the progress of migrating from the monolithic `app/lib/store.ts` to the new 5-store architecture.

## Summary

**Completed:** 5/6 phases (83%) - Timeline components intentionally skipped per user request

- ✅ Phase 1: Cleanup & Foundation
- ✅ Phase 2: New Store Architecture
- ✅ Phase 3: Visualization Components (TCP visualizers, WebSocket connector)
- ✅ Phase 4: Input Components (JointSliders, CartesianSliders, CompactJointSliders)
- ✅ Phase 5: Non-Timeline Components (RobotViewer, TargetPoseVisualizer, useActualFollowsTarget)
- ⏳ Phase 6: Timeline Components (SKIPPED - user requested to exclude timeline)
- ⏳ Phase 7: Final Cleanup (remove old store when ready)

## Migration Progress

### ✅ Phase 1: Cleanup & Foundation (COMPLETED)
- Removed ~20 debug console.log statements
- Deleted dead code (commented JointLabels, stubbed forwardKinematics)
- Extracted TCP calculation to shared utility (`tcpCalculations.ts`)
  - Eliminated 270 lines of duplicate code
- Consolidated duplicate constants (CARTESIAN_AXES, IkAxisMask)
- Created `useNumericInput` hook for reusable input handling

**Commit:** `96fa4b3` Phase 1 cleanup

### ✅ Phase 2: New Store Architecture (COMPLETED)
Created 5 focused stores replacing the monolithic store:

1. **`useInputStore`** - Raw UI input state (what user types/moves)
   - `inputJointAngles`, `inputCartesianPose`
   - `selectedJoint`, visibility flags

2. **`useCommandStore`** - Commanded robot state (what we tell robot)
   - `commandedJointAngles`, `commandedTcpPose`
   - `targetRobotRef`, `speed`, `accel`
   - Control modes: `liveControlEnabled`, `teachModeEnabled`
   - Joint homing status

3. **`useHardwareStore`** - Hardware feedback (what robot reports)
   - `hardwareJointAngles`, `hardwareCartesianPose`, `hardwareTcpPose`
   - `hardwareRobotRef`
   - `ioStatus`, `gripperStatus`, `robotStatus`
   - `connectionStatus`

4. **`useTimelineStore`** - Timeline editing & playback
   - Timeline data, keyframes
   - Playback state (isPlaying, currentTime, loop, etc.)

5. **`useRobotConfigStore`** - Configuration settings
   - `tcpOffset`, `ikAxisMask`

**Commits:**
- `a0c4741` Phase 1: Create new store architecture
- `0549a26` Add comprehensive store architecture documentation

### ✅ Phase 3: Visualization Components (COMPLETED)
Migrated components that read/display robot state:

- ✅ `TargetTCPVisualizer.tsx`
  - Changed: `targetTcpPosition` → `commandedTcpPose`
  - Uses: `useCommandStore`, `useRobotConfigStore`

- ✅ `ActualTCPVisualizer.tsx`
  - Changed: `actualRobotRef` → `hardwareRobotRef`
  - Changed: `actualJointAngles` → `hardwareJointAngles`
  - Changed: `actualTcpPosition` → `hardwareTcpPose`
  - Uses: `useHardwareStore`, `useRobotConfigStore`

- ✅ `WebSocketConnector.tsx`
  - All hardware feedback → `useHardwareStore`
  - Joint homing status → `useCommandStore`
  - Uses: `useHardwareStore`, `useCommandStore`, `useConfigStore`

**Commit:** `d2438ca` Phase 2: Migrate visualization components

### ✅ Phase 4: Input Components (COMPLETED)
Migrated components that handle user input:

- ✅ `JointSliders.tsx`
  - Changed: `currentJointAngles` → `inputJointAngles`
  - Updates both input and commanded stores simultaneously
  - Uses: `useInputStore`, `useCommandStore`

- ✅ `CartesianSliders.tsx`
  - Changed: `currentCartesianPose` → `inputCartesianPose`
  - Changed: `targetTcpPosition` → `commandedTcpPose`
  - Updated IK solver calls to use new store variables
  - Uses: `useInputStore`, `useCommandStore`, `useRobotConfigStore`

- ✅ `CompactJointSliders.tsx`
  - Changed: `currentJointAngles` → `inputJointAngles`
  - Changed: `actualJointAngles` → `hardwareJointAngles`
  - Changed: `targetFollowsActual` → `teachModeEnabled`
  - Changed: `actualFollowsTarget` → `liveControlEnabled`
  - Made `stepAngle` a local constant (was 5° in old store)
  - Uses: `useInputStore`, `useCommandStore`, `useHardwareStore`

**Commit:** `63c4a6c` refactor: migrate input components to new store architecture

## ⚠️ Remaining Work

### ✅ Phase 5: Non-Timeline Components (COMPLETED)

Migrated all non-timeline components (per user request to skip timeline):

- ✅ `TargetPoseVisualizer.tsx`
  - Changed: `currentCartesianPose` → `inputCartesianPose`
  - Now displays user's cartesian slider input (red/green/blue gizmo)
  - Uses: `useInputStore`, `useTimelineStore`

- ✅ `useActualFollowsTarget.ts` (Live Control Mode)
  - Changed: `actualFollowsTarget` → `liveControlEnabled`
  - Changed: `currentJointAngles` → `commandedJointAngles`
  - Changed: `speed` now from `useCommandStore`
  - Sends commanded values to robot via API
  - Uses: `useCommandStore`, `useTimelineStore`

- ✅ `RobotViewer.tsx` (781 lines)
  - Main 3D visualization component with comprehensive updates:
    - **Robot refs**: `actualRobotRef` → `hardwareRobotRef`
    - **Joint angles**: `currentJointAngles` → `commandedJointAngles` (for commanded robot), `inputJointAngles` (for keyboard input)
    - **Cartesian**: `currentCartesianPose` → `inputCartesianPose`
    - **TCP positions**: `targetTcpPosition` → `commandedTcpPose`, `actualTcpPosition` → `hardwareTcpPose`
    - **Visibility**: `showActualRobot` → `showHardwareRobot`
    - **Control modes**: `targetFollowsActual` → `teachModeEnabled`, `actualFollowsTarget` → `liveControlEnabled`
    - **Teach mode logic**: Now copies `hardwareJointAngles` → `inputJointAngles` + `commandedJointAngles`
    - **Keyboard controls**: Now update both input and commanded stores
    - **UI labels**: "Target" → "Commanded", "Actual" → "Hardware"
  - Uses: All 5 stores

**Commit:** `778b412` refactor: migrate non-timeline components to new store architecture

### ⏳ Phase 6: Timeline Components (SKIPPED - User Request)

Timeline-related components intentionally NOT migrated per user request:

- ⏳ `Timeline.tsx` - Timeline editor with keyframes and playback controls
- ⏳ `usePlayback.ts` - Timeline interpolation and execution
- ⏳ `usePrePlaybackPosition.ts` - Saves/restores position before playback
- ⏳ `useScrubbing.ts` - Timeline scrubbing functionality

**Note**: `useTargetFollowsActual.ts` doesn't exist as a separate file - teach mode logic was implemented directly in RobotViewer (now migrated)

### Phase 7: Final Cleanup (NOT STARTED)

- ⏳ Delete old `app/lib/store.ts` (340 lines)
- ⏳ Remove any remaining imports of old store
- ⏳ Integration testing:
  - Timeline editing and playback
  - Live joint/cartesian control
  - 3D visualization (all gizmos working)
  - WebSocket hardware sync
  - Teach mode
  - IK solving (frontend + backend)

## Variable Name Mapping

Quick reference for migrating components:

| Old Name | New Name | New Store |
|----------|----------|-----------|
| `currentJointAngles` | `inputJointAngles` | `useInputStore` |
| `currentJointAngles` | `commandedJointAngles` | `useCommandStore` |
| `currentCartesianPose` | `inputCartesianPose` | `useInputStore` |
| `targetTcpPosition` | `commandedTcpPose` | `useCommandStore` |
| `actualJointAngles` | `hardwareJointAngles` | `useHardwareStore` |
| `actualCartesianPose` | `hardwareCartesianPose` | `useHardwareStore` |
| `actualTcpPosition` | `hardwareTcpPose` | `useHardwareStore` |
| `targetRobotRef` | `targetRobotRef` | `useCommandStore` |
| `actualRobotRef` | `hardwareRobotRef` | `useHardwareStore` |
| `targetFollowsActual` | `teachModeEnabled` | `useCommandStore` |
| `actualFollowsTarget` | `liveControlEnabled` | `useCommandStore` |
| `tcpOffset` | `tcpOffset` | `useRobotConfigStore` |
| `ikAxisMask` | `ikAxisMask` | `useRobotConfigStore` |
| `timeline` | `timeline` | `useTimelineStore` |
| `playbackState` | `playbackState` | `useTimelineStore` |

## Testing Checklist

Before removing old store, verify:

- [ ] Joint sliders control robot in joint mode
- [ ] Cartesian sliders + IK works in cartesian mode
- [ ] Frontend IK solver works
- [ ] Backend IK solver works
- [ ] Timeline keyframe recording works
- [ ] Timeline playback works (both modes)
- [ ] Live control mode sends commands to robot
- [ ] Teach mode reads from robot
- [ ] WebSocket receives hardware feedback
- [ ] All 3 TCP visualizers display correctly:
  - [ ] Red/green/blue (input cartesian pose)
  - [ ] Orange/cyan/magenta (commanded TCP from joints)
  - [ ] Yellow/lime/purple (hardware TCP from robot)
- [ ] Robot visualization shows both target and hardware ghosts
- [ ] E-stop works
- [ ] Speed/accel controls work
- [ ] Saved positions work
- [ ] Joint homing status displays correctly

## Architecture Benefits

The new 5-store architecture provides:

1. **Clear Data Flow** - Each store represents a distinct layer:
   - Input → Command → Robot Hardware ← Feedback

2. **Better Performance** - Components only re-render when their specific store changes

3. **Easier Testing** - Each store can be tested in isolation

4. **Clear Naming** - No more confusion about "current" vs "actual" vs "target"

5. **Better Code Organization** - Related state grouped together

6. **Type Safety** - Each store has its own typed interface

See `STORE_ARCHITECTURE.md` for detailed documentation.
