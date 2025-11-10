# PAROL6 Frontend Store Architecture

## Overview

The frontend state is organized into **5 focused Zustand stores**, each with a single responsibility. This separation ensures clear data flow, better performance, and easier testing.

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA FLOW LAYERS                          │
└─────────────────────────────────────────────────────────────────┘

LAYER 1: USER INPUT
  ↓ useInputStore
  ↓ (what user types in sliders/keyboard)

LAYER 2: COMMANDED STATE
  ↓ useCommandStore
  ↓ (what we tell robot to do)

LAYER 3: HARDWARE FEEDBACK
  ↓ useHardwareStore
  ↓ (what robot actually does)

LAYER 4: TIMELINE
  ↓ useTimelineStore
  ↓ (keyframes and playback)

LAYER 5: CONFIGURATION
  ↓ useRobotConfigStore
  ↓ (settings that rarely change)
```

---

## 1. useInputStore

**Purpose:** Raw UI input state from sliders and keyboard controls

**Location:** `app/lib/stores/inputStore.ts`

### Responsibilities

- Stores direct user input from UI controls (before any processing)
- Manages UI preferences (selected joint, step angle, visibility toggles)
- In joint mode: stores raw joint angle values from sliders
- In cartesian mode: stores cartesian values BEFORE IK solving

### State Contents

- **Input Joint Angles:** Raw joint values from sliders (J1-J6)
- **Input Cartesian Pose:** Cartesian values before IK (X, Y, Z, RX, RY, RZ)
- **UI Preferences:** Selected joint, step angle, robot visibility toggles

### Visual Representation

- **Red/Green/Blue RGB Gizmo** (cartesian mode only) shows the input cartesian pose

---

## 2. useCommandStore

**Purpose:** Commanded robot state - what we're telling the robot to do

**Location:** `app/lib/stores/commandStore.ts`

### Responsibilities

- Stores joint angles we're commanding (from direct input OR from IK solving)
- Maintains the target robot's TCP pose (calculated via URDF forward kinematics)
- Manages motion parameters (speed, acceleration)
- Controls live control and teach modes
- Tracks joint homing status

### State Contents

- **Commanded Joint Angles:** The joint angles we want the robot at (from input or IK)
- **Commanded TCP Pose:** Calculated from URDF FK using commanded joint angles
- **Target Robot Reference:** URDF model reference for visualization
- **Motion Parameters:** Speed (0-100%), Acceleration (0-100%)
- **Control Modes:** Live control enabled, teach mode enabled (mutually exclusive)
- **Joint Homing Status:** Boolean per joint (J1-J6)

### Visual Representation

- **Colored URDF Robot** in 3D viewer (the "target" robot)
- **Orange/Cyan/Magenta Gizmo** shows commanded TCP pose

---

## 3. useHardwareStore

**Purpose:** Hardware feedback from physical robot

**Location:** `app/lib/stores/hardwareStore.ts`

### Responsibilities

- Stores real joint angles from hardware encoders (via WebSocket)
- Maintains actual TCP pose from backend FK
- Stores I/O status, gripper status, robot status
- Manages connection status
- Provides reference for ghost robot visualization

### State Contents

- **Hardware Joint Angles:** Real encoder values from physical robot
- **Hardware Cartesian Pose:** TCP pose from backend FK calculation
- **Hardware TCP Pose:** Frontend-calculated TCP from URDF (for visualization)
- **Hardware Robot Reference:** URDF model reference for ghost visualization
- **I/O Status:** Digital I/O state (inputs/outputs, e-stop)
- **Gripper Status:** Gripper device ID, position, object detection
- **Robot Status:** E-stop active, robot stopped, etc.
- **Connection Status:** disconnected | connecting | connected | error

### Visual Representation

- **Ghost URDF Robot** in 3D viewer (transparent, shows actual position)
- **Yellow/Lime/Purple Gizmo** shows hardware TCP pose

---

## 4. useTimelineStore

**Purpose:** Timeline editing and playback

**Location:** `app/lib/stores/timelineStore.ts`

### Responsibilities

- Manages timeline metadata (name, duration, motion mode)
- Stores keyframes for joint mode and cartesian mode
- Controls playback state (playing, paused, current time)
- Handles keyframe recording, editing, deletion
- Manages preview vs execute playback modes

### State Contents

- **Timeline Metadata:** Name, mode (joint/cartesian), duration
- **Joint Keyframes:** Array of {id, time, joint, value} for joint mode
- **Cartesian Keyframes:** Array of {id, time, axis, value} for cartesian mode
- **Playback State:** isPlaying, currentTime, startTime, loop, executeOnRobot

### Modes

- **Preview Mode:** Playback only updates visualization (no hardware commands)
- **Execute Mode:** Playback sends motion commands to physical robot

---

## 5. useRobotConfigStore

**Purpose:** Robot configuration settings that rarely change

**Location:** `app/lib/stores/robotConfigStore.ts`

### Responsibilities

- Stores TCP (Tool Center Point) offset from J6 flange
- Manages IK axis mask for selective axis solving
- Provides configuration loaded from backend config.yaml

### State Contents

- **TCP Offset:** {x, y, z} offset in millimeters from J6 reference frame
- **IK Axis Mask:** {X, Y, Z, RX, RY, RZ} boolean flags for IK solving

---

## Naming Conventions

### Variable Prefixes

Variables are prefixed to indicate which store they belong to:

| Prefix | Store | Meaning | Example |
|--------|-------|---------|---------|
| `input*` | inputStore | Raw user input | `inputJointAngles`, `inputCartesianPose` |
| `commanded*` | commandStore | Commanded state | `commandedJointAngles`, `commandedTcpPose` |
| `hardware*` | hardwareStore | Hardware feedback | `hardwareJointAngles`, `hardwareCartesianPose` |
| (no prefix) | timelineStore | Timeline data | `keyframes`, `playbackState` |
| (no prefix) | robotConfigStore | Configuration | `tcpOffset`, `ikAxisMask` |

### Store Usage Patterns

- **Reading State:** Subscribe to specific slices for optimal performance
- **Writing State:** Use store actions (setters) provided by each store
- **Cross-Store Updates:** Components coordinate updates across stores when needed
- **WebSocket Updates:** Only update hardwareStore (never directly modify hardware state from UI)

---

## Data Flow Diagrams

### Joint Mode Control Flow

```
1. User moves J1 slider to 45°
   ↓
2. Update inputStore.inputJointAngles.J1 = 45
   ↓
3. Component syncs to commandStore.commandedJointAngles.J1 = 45
   ↓
4. Target Robot URDF updates (reads commandedJointAngles)
   ↓
5. Forward kinematics calculates commandedTcpPose from URDF
   ↓
6. If liveControlEnabled: API sends commandedJointAngles to hardware
   ↓
7. WebSocket receives hardware feedback
   ↓
8. Update hardwareStore.hardwareJointAngles (actual values)
   ↓
9. Ghost Robot URDF updates (reads hardwareJointAngles)
   ↓
10. Forward kinematics calculates hardwareTcpPose from ghost URDF
```

### Cartesian Mode Control Flow

```
1. User moves X slider to 250mm
   ↓
2. Update inputStore.inputCartesianPose.X = 250
   ↓
3. Red RGB gizmo shows inputCartesianPose
   ↓
4. User clicks "Solve IK" button
   ↓
5. IK solver: inputCartesianPose → joint angles
   ↓
6. Update commandStore.commandedJointAngles = IK result
   ↓
7. (Continue as joint mode flow from step 4)
```

### Timeline Playback Flow

```
1. User clicks Play button
   ↓
2. Call timelineStore.play(executeOnRobot: false) // Preview mode
   ↓
3. usePlayback hook runs 60fps interpolation loop
   ↓
4. Each frame: interpolate keyframes → joint angles
   ↓
5. Update commandStore.commandedJointAngles with interpolated values
   ↓
6. Target robot visual follows playback smoothly
   ↓
7. Orange gizmo shows commanded TCP during playback
```

### Execute Playback Flow

```
1. User clicks "Execute" button (send icon)
   ↓
2. Pre-playback positioning: move robot to t=0 keyframe
   ↓
3. Poll hardwareStore.hardwareJointAngles until arrival
   ↓
4. Call timelineStore.play(executeOnRobot: true) // Execute mode
   ↓
5. usePlayback hook interpolates AND sends move commands
   ↓
6. On keyframe crossing: API sends move command with duration
   ↓
7. Hardware executes smooth motion between keyframes
   ↓
8. WebSocket streams hardwareJointAngles back to frontend
   ↓
9. Ghost robot follows actual hardware position
```

---

## Migration Guide

### Variable Name Mapping

Reference for migrating from old monolithic store to new 5-store architecture:

| Old Name (useTimelineStore) | New Store | New Name |
|----------------------------|-----------|----------|
| `currentJointAngles` | useInputStore → useCommandStore | `inputJointAngles` → `commandedJointAngles` |
| `currentCartesianPose` | useInputStore | `inputCartesianPose` |
| `actualJointAngles` | useHardwareStore | `hardwareJointAngles` |
| `actualCartesianPose` | useHardwareStore | `hardwareCartesianPose` |
| `targetTcpPosition` | useCommandStore | `commandedTcpPose` |
| `actualTcpPosition` | useHardwareStore | `hardwareTcpPose` |
| `showActualRobot` | useInputStore | `showHardwareRobot` |
| `actualFollowsTarget` | useCommandStore | `liveControlEnabled` |
| `targetFollowsActual` | useCommandStore | `teachModeEnabled` |
| `targetRobotRef` | useCommandStore | `targetRobotRef` |
| `actualRobotRef` | useHardwareStore | `hardwareRobotRef` |
| `tcpOffset` | useRobotConfigStore | `tcpOffset` |
| `ikAxisMask` | useRobotConfigStore | `ikAxisMask` |

### Component Migration Checklist

When migrating a component:

- [ ] Import new stores from `@/app/lib/stores`
- [ ] Update variable names to new naming convention
- [ ] Use appropriate store for each piece of state:
  - User input → inputStore
  - Commands to robot → commandStore
  - Hardware feedback → hardwareStore
  - Timeline data → timelineStore
  - Configuration → robotConfigStore
- [ ] In joint mode: update BOTH inputStore and commandStore simultaneously
- [ ] In cartesian mode: update inputStore first, commandStore after IK
- [ ] Test that component still works correctly
- [ ] Verify 3D visualization updates as expected
- [ ] Check browser console for errors

---

## Benefits of 5-Store Architecture

### 1. Clear Intent and Readability

The old monolithic store had ambiguous variable names like `currentJointAngles` - did this mean what the user typed, what we commanded, or what the robot is actually at?

The new architecture makes intent crystal clear through naming:
- `inputJointAngles` - what user typed
- `commandedJointAngles` - what we're telling robot to do
- `hardwareJointAngles` - what robot is actually at

### 2. Better Performance

**Granular Subscriptions:** Components only re-render when their specific slice changes
- Input changes don't trigger hardware feedback subscribers
- Timeline changes don't affect robot control subscribers
- Hardware updates don't trigger timeline re-renders

**Reduced Re-Renders:** Each store is focused, so fewer components subscribe to each store

### 3. Easier Testing and Debugging

**Independent Mocking:** Test timeline logic without robot hardware, test robot control without timeline
**Clear Data Flow:** Easier to trace bugs through the 5-layer architecture
**Isolated State:** Each domain (input, command, hardware, timeline, config) is independent

### 4. Scalability and Maintainability

**Easy to Extend:** Add new robot features to commandStore without touching input/hardware
**Easy to Add Sensors:** Add new hardware sensors to hardwareStore without touching commands
**Timeline Stays Focused:** Keyframe editing logic is isolated from robot control

### 5. No Circular Dependencies

The old store had dynamic imports inside Zustand actions, creating circular dependency risks. The new architecture eliminates this by having components orchestrate cross-store updates.

---

## Architecture Principles

### Principle 1: Single Responsibility

Each store has ONE job:
- inputStore: Track what user types
- commandStore: Track what we command
- hardwareStore: Track hardware reality
- timelineStore: Manage keyframes
- robotConfigStore: Store settings

### Principle 2: Unidirectional Data Flow

```
User Input → Input Store → Command Store → API → Hardware
                                              ↓
                                     Hardware Store (via WebSocket)
```

### Principle 3: Components Coordinate, Stores Don't

Stores never directly update other stores. Components read from one store and write to another, making the data flow explicit and traceable.

### Principle 4: WebSocket as Single Source of Truth for Hardware

Only WebSocket updates hardwareStore. UI never directly modifies hardware state.

### Principle 5: Timeline Drives Commanded State During Playback

During playback, the usePlayback hook interpolates keyframes and updates commandedJointAngles. This drives the visual and optionally sends commands to hardware.

---

## FAQ

**Q: Why separate input and commanded stores?**

A: In joint mode, they're usually synchronized. But in cartesian mode, `inputCartesianPose` is what the user typed (before IK), while `commandedJointAngles` is the result after IK solving. Separating them makes the data flow explicit and prevents confusion.

**Q: When should I use commanded vs hardware?**

A: Use `commanded` for the target robot visual and what you're sending to hardware. Use `hardware` for actual robot feedback from encoders/sensors. The ghost robot shows `hardware`, the colored robot shows `commanded`.

**Q: How do I sync input → commanded?**

A: In joint mode, components should update both stores simultaneously (input for UI state, commanded for robot state). In cartesian mode, only update `commanded` after IK solving succeeds.

**Q: What happens during playback?**

A: The usePlayback hook runs at 60fps, interpolating keyframes and updating `commandedJointAngles` each frame. The target robot visual follows playback. In execute mode, it also sends move commands to hardware.

**Q: Why do we need both hardwareCartesianPose and hardwareTcpPose?**

A: `hardwareCartesianPose` comes from backend FK (calculated on server). `hardwareTcpPose` is calculated in frontend from URDF for visualization consistency. We keep both for validation and debugging.

**Q: Can stores talk to each other?**

A: No. Stores are independent. Components read from one store and write to another, making data flow explicit.

---

## Implementation Status

✅ **Migration Complete** (as of 2025-11-10)

All components, hooks, and pages have been migrated to the new 5-store architecture:

- **Phase 1:** Fixed dynamic import anti-pattern in timelineStore
- **Phase 2:** Migrated 7 simple components
- **Phase 3:** Migrated 2 page components (app/page.tsx, app/control/page.tsx)
- **Phase 4:** Migrated 2 Timeline UI components
- **Phase 5:** Migrated 3 playback hooks (60fps loop - HIGH RISK)
- **Phase 6:** Deprecated old monolithic store

**Old Store Location:** `app/lib/deprecated/store.ts` (for reference only)

**New Stores Location:** `app/lib/stores/`
- `inputStore.ts`
- `commandStore.ts`
- `hardwareStore.ts`
- `timelineStore.ts`
- `robotConfigStore.ts`
- `index.ts` (re-exports all stores)

---

## Related Documentation

- **MIGRATION_STATUS.md** - Detailed migration tracking and phase breakdown
- **README.md** - Project overview and setup instructions
- **CLAUDE.md** - Project context for AI assistants
