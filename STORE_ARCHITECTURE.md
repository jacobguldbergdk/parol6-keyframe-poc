# PAROL6 Frontend Store Architecture

## Overview

The frontend state is organized into 5 focused Zustand stores, each with a single responsibility:

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

### State

```typescript
{
  // Joint mode: Direct joint values from sliders
  inputJointAngles: { J1: 0, J2: 0, J3: 0, J4: 0, J5: 0, J6: 0 }

  // Cartesian mode: Slider values BEFORE IK is solved
  inputCartesianPose: { X: 0, Y: 0, Z: 300, RX: 0, RY: 0, RZ: 0 }

  // UI preferences
  selectedJoint: null | 'J1' | 'J2' | ...
  stepAngle: 1.0
  showTargetRobot: true
  showHardwareRobot: true
}
```

### Usage

```typescript
import { useInputStore } from '@/app/lib/stores';

// In JointSliders component
const inputAngles = useInputStore(s => s.inputJointAngles);
const setAngle = useInputStore(s => s.setInputJointAngle);

setAngle('J1', 45.0); // User moved J1 slider to 45°
```

### Visual Representation
- **Red/Green/Blue Gizmo** in 3D viewer shows `inputCartesianPose` (cartesian mode only)

---

## 2. useCommandStore

**Purpose:** Commanded robot state - what we're telling the robot to do

**Location:** `app/lib/stores/commandStore.ts`

### State

```typescript
{
  // Joint angles we're commanding (from input or IK result)
  commandedJointAngles: { J1: 0, J2: 0, ... }

  // Target robot TCP (calculated from URDF FK)
  commandedTcpPose: { X: 200, Y: 0, Z: 300, ... } | null

  // URDF robot reference
  targetRobotRef: URDFRobot | null

  // Motion parameters
  speed: 80  // 0-100%
  accel: 60  // 0-100%

  // Control modes (mutually exclusive)
  liveControlEnabled: false   // Send commands on change
  teachModeEnabled: false      // Copy from hardware

  // Joint homing status
  jointHomedStatus: { J1: false, J2: false, ... }
}
```

### Usage

```typescript
import { useCommandStore } from '@/app/lib/stores';

// Read commanded state
const commanded = useCommandStore(s => s.commandedJointAngles);

// After IK solve
useCommandStore.getState().setCommandedJointAngles(ikResult.joints);
```

### Visual Representation
- **Colored URDF Robot** in 3D viewer (target robot)
- **Orange/Cyan/Magenta Gizmo** shows `commandedTcpPose`

---

## 3. useHardwareStore

**Purpose:** Hardware feedback from physical robot

**Location:** `app/lib/stores/hardwareStore.ts`

### State

```typescript
{
  // Real joint angles from encoders
  hardwareJointAngles: { J1: 0, J2: 0, ... } | null

  // Real TCP from backend FK
  hardwareCartesianPose: { X: 200, Y: 0, Z: 300, ... } | null

  // Frontend-calculated TCP from URDF
  hardwareTcpPose: { X: 200, Y: 0, Z: 300, ... } | null

  // URDF robot reference for ghost
  hardwareRobotRef: URDFRobot | null

  // Hardware status
  ioStatus: { ... } | null
  gripperStatus: { ... } | null
  robotStatus: { is_stopped, estop_active, ... } | null
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
}
```

### Usage

```typescript
import { useHardwareStore } from '@/app/lib/stores';

// WebSocketConnector updates this
const setHardware = useHardwareStore(s => s.setHardwareJointAngles);
socket.on('joints', (data) => {
  setHardware({ J1: data[0], J2: data[1], ... });
});
```

### Visual Representation
- **Ghost URDF Robot** in 3D viewer (transparent, shows actual position)
- **Yellow/Lime/Purple Gizmo** shows `hardwareTcpPose`

---

## 4. useTimelineStore

**Purpose:** Timeline editing and playback

**Location:** `app/lib/stores/timelineStore.ts`

### State

```typescript
{
  timeline: {
    name: 'Untitled'
    mode: 'joint' | 'cartesian'
    keyframes: [{ id, time, joint, value }, ...]
    cartesianKeyframes: [{ id, time, axis, value }, ...]
    duration: 10.0
  }

  playbackState: {
    isPlaying: false
    currentTime: 0
    startTime: null
    loop: false
    executeOnRobot: false  // Preview vs Execute mode
  }
}
```

### Usage

```typescript
import { useTimelineStore } from '@/app/lib/stores';

// Add keyframe at current playhead time
const recordKeyframes = useTimelineStore(s => s.recordKeyframes);
const play = useTimelineStore(s => s.play);

play(false); // Preview mode
play(true);  // Execute mode (sends to robot)
```

---

## 5. useRobotConfigStore

**Purpose:** Robot configuration settings

**Location:** `app/lib/stores/robotConfigStore.ts`

### State

```typescript
{
  // TCP offset from J6 flange (mm)
  tcpOffset: { x: 47, y: 0, z: -62 }

  // IK axis mask
  ikAxisMask: { X: true, Y: true, Z: true, RX: true, RY: true, RZ: true }
}
```

### Usage

```typescript
import { useRobotConfigStore } from '@/app/lib/stores';

const tcpOffset = useRobotConfigStore(s => s.tcpOffset);
const setOffset = useRobotConfigStore(s => s.setTcpOffset);

setOffset('z', -65); // Adjust tool length
```

---

## Data Flow Examples

### Joint Mode Control Flow

```
1. User moves J1 slider to 45°
   ↓
2. useInputStore.setInputJointAngle('J1', 45)
   ↓
3. Component syncs: useCommandStore.setCommandedJointAngle('J1', 45)
   ↓
4. Target Robot URDF updates (reads commandedJointAngles)
   ↓
5. TargetTCPVisualizer calculates commandedTcpPose from URDF
   ↓
6. If liveControlEnabled: API call sends commandedJointAngles to hardware
   ↓
7. WebSocket receives hardware feedback
   ↓
8. useHardwareStore.setHardwareJointAngles(actual values)
   ↓
9. Ghost Robot URDF updates (reads hardwareJointAngles)
   ↓
10. ActualTCPVisualizer calculates hardwareTcpPose from URDF
```

### Cartesian Mode Control Flow

```
1. User moves X slider to 250mm
   ↓
2. useInputStore.setInputCartesianValue('X', 250)
   ↓
3. Red gizmo shows inputCartesianPose
   ↓
4. User clicks "Solve IK" button
   ↓
5. IK solver: inputCartesianPose → joint angles
   ↓
6. useCommandStore.setCommandedJointAngles(ikResult.joints)
   ↓
7. (Continue as joint mode flow from step 4)
```

### Timeline Playback Flow

```
1. User clicks Play button
   ↓
2. useTimelineStore.play(false) // Preview mode
   ↓
3. usePlayback hook interpolates keyframes
   ↓
4. Updates useCommandStore.commandedJointAngles every frame
   ↓
5. Target robot visual follows playback
   ↓
6. Orange gizmo shows commanded TCP during playback
```

---

## Migration from Old Store

### Variable Name Mapping

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

---

## Component Migration Checklist

When migrating a component:

- [ ] Import new stores from `@/app/lib/stores`
- [ ] Update variable names to new convention
- [ ] Use appropriate store for each piece of state
- [ ] Test that component still works
- [ ] Check for console errors
- [ ] Verify 3D visualization updates correctly

---

## Benefits of New Architecture

### 1. **Clear Intent**
```typescript
// OLD (confusing)
const current = useTimelineStore(s => s.currentJointAngles);  // Target or actual?

// NEW (clear)
const commanded = useCommandStore(s => s.commandedJointAngles);  // What we command
const hardware = useHardwareStore(s => s.hardwareJointAngles);   // What is real
```

### 2. **Better Performance**
- Input changes don't trigger hardware feedback re-renders
- Timeline changes don't affect robot state subscribers
- More granular subscriptions = fewer re-renders

### 3. **Easier Testing**
- Mock individual stores independently
- Test timeline logic without robot hardware
- Test robot control without timeline

### 4. **Scalability**
- Easy to add new robot features to commandStore
- Easy to add new hardware sensors to hardwareStore
- Timeline remains focused on keyframe editing

---

## FAQ

**Q: Why separate input and commanded stores?**

A: In joint mode, they're usually the same. But in cartesian mode, `inputCartesianPose` is what the user typed (before IK), while `commandedJointAngles` is the result of IK solving. Separating them makes the data flow crystal clear.

**Q: When should I use `commanded` vs `hardware`?**

A: Use `commanded` for the target robot visual and what you're sending to hardware. Use `hardware` for actual robot feedback from encoders/sensors. The ghost robot shows `hardware`, the colored robot shows `commanded`.

**Q: Can I still access the old store during migration?**

A: Yes! The old `app/lib/store.ts` still exists for backward compatibility. Migrate components one at a time. Once all components are migrated, we'll remove the old store.

**Q: How do I sync input → commanded?**

A: In joint mode, components should set both simultaneously. In cartesian mode, only set `commanded` after IK solving succeeds. See data flow examples above.

---

## Next Steps

1. ✅ Create new stores (DONE)
2. ⏳ Migrate visualization components (TargetTCPVisualizer, ActualTCPVisualizer)
3. ⏳ Migrate WebSocket connector
4. ⏳ Migrate input components (sliders, keyboard controls)
5. ⏳ Migrate RobotViewer
6. ⏳ Test all core features
7. ⏳ Remove old store

See implementation plan in git commit messages for detailed migration strategy.
