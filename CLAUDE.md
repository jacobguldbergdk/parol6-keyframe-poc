# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PAROL6 Timeline Animation Editor - A Next.js-based timeline waypoint editor for the PAROL6 robotic arm, featuring 3D robot visualization, interactive timeline editing, and dual motion modes (joint space and cartesian space).

## Commands

### Development
```bash
# Start development server (runs on port 3000)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

### PM2 Process Management
```bash
# Start with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs parol-timeline

# Restart
pm2 restart parol-timeline

# Stop
pm2 stop parol-timeline
```

## Architecture

### State Management (Zustand)

The application uses a single Zustand store (`app/lib/store.ts`) as the central state container:

- **Motion Modes**: Supports two modes - `joint` (direct joint angle control) and `cartesian` (XYZ position + orientation with IK)
- **Keyframe Model**: Uses independent per-joint/per-axis keyframes, NOT waypoints. Each keyframe controls one joint or one cartesian axis at one specific time
- **Timeline Data**: Maintains separate keyframe arrays for joint mode (`keyframes: Keyframe[]`) and cartesian mode (`cartesianKeyframes: CartesianKeyframe[]`)
- **Current State**: Tracks `currentJointAngles`, `currentCartesianPose`, and `playbackState`

### Keyframe vs Waypoint Architecture

**IMPORTANT**: This project uses a keyframe-based model, not waypoints:

- **Keyframe**: Single value for one joint/axis at one time (e.g., "J3 = 45° at 2.5s")
- **Waypoint**: Complete robot pose (all 6 joints) at one time - NOT USED HERE
- Recording creates 6 separate keyframes (one per joint/axis) at the current time
- Timeline tracks show independent keyframes per joint/axis
- Interpolation happens per-joint/per-axis independently

### Kinematics System

Located in `app/lib/kinematics.ts`:

**Forward Kinematics (FK)**:
- Converts joint angles (degrees) to cartesian pose (X,Y,Z in mm, RX,RY,RZ in degrees)
- Uses simplified approximation based on PAROL6 DH parameters
- **Limitation**: Only J1-J3 significantly affect TCP position; J4-J6 (wrist joints) are simplified
- NOTE: Full DH transformation matrix chain should be implemented for production

**Inverse Kinematics (IK)**:
- Converts cartesian target pose to joint angles
- Uses simplified geometric approach (not full robotics toolkit solver)
- Returns `IKResult` with success status and detailed error information:
  - `out_of_reach`: Target beyond workspace limits
  - `singular`: Singular configuration (undefined elbow angle)
  - `invalid_input`: Invalid pose input
- **Limitation**: Simplified approximation; production should use PAROL6 Python API with roboticstoolbox

### Interpolation System

Located in `app/lib/interpolation.ts`:

- **Joint Mode**: Linear interpolation per-joint between keyframes (`getJointAnglesAtTime`)
- **Cartesian Mode**: Linear interpolation per-axis between cartesian keyframes (`getCartesianPoseAtTime`)
- Each joint/axis interpolates independently based on its own keyframes
- Before first keyframe: holds initial value
- After last keyframe: holds final value

### Playback System

The playback hook (`app/hooks/usePlayback.ts`) runs at 60fps when playing:

1. **Joint Mode**: Interpolates joint angles directly from keyframes
2. **Cartesian Mode**: Interpolates cartesian pose, then runs IK to compute joint angles
3. Updates robot visualization in real-time
4. Stops automatically when reaching timeline duration

### 3D Visualization

- Uses React Three Fiber (`@react-three/fiber`) and Three.js
- URDF robot model loaded from `public/urdf/PAROL6.urdf`
- Mesh files in `public/urdf/meshes/*.STL`
- **Important**: URDF mesh paths use relative paths (`./meshes/`) not `package://`

### Timeline Component

- Uses `animation-timeline-js` library for canvas-based timeline
- Shows 6 tracks for joint mode (J1-J6) or 6 tracks for cartesian mode (X,Y,Z,RX,RY,RZ)
- Keyframes are draggable and editable
- Scrubber control for manual time navigation
- Playhead follows during playback

### Motion Modes

The application supports two motion control paradigms:

1. **Joint Space Mode** (`mode: 'joint'`):
   - Direct control of 6 joint angles (J1-J6)
   - Keyframes store joint angles in degrees
   - No IK required during playback

2. **Cartesian Space Mode** (`mode: 'cartesian'`):
   - Control of TCP position (X,Y,Z mm) and orientation (RX,RY,RZ degrees)
   - Keyframes store cartesian coordinates
   - Requires IK during playback to compute joint angles
   - IK may fail if target is unreachable

## Key Files and Their Roles

### Core Logic
- `app/lib/types.ts` - TypeScript interfaces for keyframes, poses, joint angles, timeline
- `app/lib/store.ts` - Zustand state management (motion modes, keyframes, playback)
- `app/lib/constants.ts` - Joint limits, DH parameters, default values
- `app/lib/kinematics.ts` - Forward and inverse kinematics (FK/IK)
- `app/lib/interpolation.ts` - Per-joint/per-axis linear interpolation

### React Hooks
- `app/hooks/usePlayback.ts` - 60fps playback loop with interpolation
- `app/hooks/useScrubbing.ts` - Scrubber control (robot follows playhead when paused)

### Components
- `app/components/RobotViewer.tsx` - 3D URDF visualization with React Three Fiber
- `app/components/Timeline.tsx` - animation-timeline-js wrapper for keyframe editing
- `app/components/JointSliders.tsx` - Manual joint angle input (6 sliders)
- `app/components/CartesianSliders.tsx` - Manual cartesian pose input (6 sliders for X,Y,Z,RX,RY,RZ)
- `app/components/PlaybackControls.tsx` - Play/Pause/Stop/Record buttons
- `app/components/TCPOffsetControls.tsx` - Adjustable TCP offset from J6 frame
- `app/components/ActualTCPVisualizer.tsx` - Visualizes actual TCP position in 3D
- `app/components/TargetPoseVisualizer.tsx` - Visualizes target cartesian pose in 3D

### Configuration
- `next.config.js` - Webpack config for URDF file loading
- `ecosystem.config.js` - PM2 process manager configuration
- `tsconfig.json` - TypeScript config with path aliases (`@/*`)

## Important Implementation Details

### Joint Limits (from PAROL6_ROBOT.py)
- J1: -123.05° to 123.05°
- J2: -145.01° to -3.38°
- J3: 107.87° to 287.87°
- J4: -105.47° to 105.47°
- J5: -90° to 90°
- J6: 0° to 360°

### Coordinate Systems
- Joint angles: degrees (input/output)
- Cartesian position: millimeters (X, Y, Z)
- Cartesian orientation: degrees (RX, RY, RZ - Euler angles)
- Internal calculations: radians (converted as needed)

### TCP Offset
- User-adjustable offset from J6 reference frame
- Default: x=47mm, y=0mm, z=-62mm
- Affects cartesian mode calculations and visualization
- Stored in Zustand store (`tcpOffset`)

### Timeline Export/Import Format
JSON format with structure:
```json
{
  "name": "Timeline Name",
  "mode": "joint" | "cartesian",
  "keyframes": [
    { "id": "uuid", "time": 2.5, "joint": "J3", "value": 45.0 }
  ],
  "cartesianKeyframes": [
    { "id": "uuid", "time": 1.0, "axis": "X", "value": 150.0 }
  ],
  "duration": 10,
  "fps": 60
}
```

## Common Development Tasks

### Adding a New Interpolation Method
1. Implement function in `app/lib/interpolation.ts`
2. Update `usePlayback` hook to use new interpolation
3. Consider adding UI toggle for interpolation method

### Modifying Joint Limits
1. Update `JOINT_LIMITS` in `app/lib/constants.ts`
2. Verify sliders respect new limits in `JointSliders.tsx`
3. Update IK workspace calculations if needed

### Improving Kinematics Accuracy
1. Implement full DH transformation matrices in `app/lib/kinematics.ts`
2. Consider integrating with PAROL6 Python API for production-grade IK
3. Add proper rotation matrix calculations for wrist orientation

### Adding Timeline Effects
1. Modify interpolation functions in `app/lib/interpolation.ts`
2. Add easing functions (ease-in, ease-out, cubic, etc.)
3. Consider per-keyframe easing configuration

## Known Limitations

1. **Simplified Kinematics**: FK/IK use geometric approximations, not full DH chain
2. **Linear Interpolation Only**: No support for cubic/quintic splines or parabolic blending
3. **No Velocity/Acceleration Limits**: Interpolation doesn't respect dynamic constraints
4. **Wrist Position Approximation**: J4-J6 don't properly affect TCP position in FK
5. **Frontend-Only**: No backend integration with real PAROL6 hardware

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **3D**: Three.js + React Three Fiber + urdf-loader
- **Timeline**: animation-timeline-js (canvas-based)
- **State**: Zustand
- **Process Manager**: PM2

## Debugging Tips

- Enable verbose logging in `usePlayback.ts` to track interpolation
- Check browser console for IK failures (red warnings)
- Use React DevTools to inspect Zustand store state
- Verify URDF mesh paths if robot doesn't appear
- Check PM2 logs: `pm2 logs parol-timeline`
