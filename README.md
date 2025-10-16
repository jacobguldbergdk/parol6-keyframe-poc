# PAROL6 Timeline Editor

> **A powerful keyframe-based motion editor for the PAROL6 robotic arm**
> Featuring dual motion modes (joint space + cartesian space), browser-based inverse kinematics, and real-time 3D visualization

![Version](https://img.shields.io/badge/version-2.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-14.2-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Overview

The PAROL6 Timeline Editor is a Next.js-based web application that provides an intuitive interface for programming robot movements using a professional timeline-based approach. It features **dual motion modes** for maximum flexibility: direct joint control and cartesian space programming with full 6-DOF inverse kinematics.

### Key Features

✅ **Dual Motion Modes**
- **Joint Space**: Direct control of 6 joint angles (J1-J6)
- **Cartesian Space**: Position & orientation control (X,Y,Z,RX,RY,RZ) with automatic IK

✅ **Browser-Based Inverse Kinematics**
- Full 6-DOF IK solver (position + orientation)
- Damped least squares numerical solver
- Real-time IK computation during playback
- Configurable IK axis masking (position-only, full 6-DOF, etc.)

✅ **Professional Timeline Interface**
- Canvas-based timeline with 6 independent tracks
- Draggable keyframes for easy editing
- Per-joint/per-axis interpolation
- 60fps smooth playback

✅ **Real-Time 3D Visualization**
- URDF-based robot model rendering
- React Three Fiber + Three.js
- Accurate forward kinematics from URDF
- Visual TCP offset adjustment
- Target pose vs. actual pose visualization

✅ **Flexible TCP Configuration**
- User-adjustable TCP offset from J6 flange
- Supports different end-effector tools
- Real-time visualization of TCP position

✅ **Export/Import Timelines**
- JSON-based timeline format
- Preserves motion mode (joint/cartesian)
- Portable between sessions

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript 5.6 |
| **Styling** | Tailwind CSS + shadcn/ui |
| **3D Graphics** | Three.js + React Three Fiber |
| **Robot Model** | urdf-loader |
| **Timeline** | animation-timeline-js |
| **State Management** | Zustand |
| **Icons** | Lucide React |

---

## Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **npm** 10.x or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/jacobguldbergdk/parol6-keyframe-poc.git
cd parol6-keyframe-poc

# Install dependencies
npm install
```

### Running the Application

```bash
# Development mode with hot reload
npm run dev
```

The application will start at **http://localhost:3000**

### Building for Production

```bash
# Build optimized production bundle
npm run build

# Start production server
npm start
```

---

## Usage Guide

### 1. Choose Motion Mode

Toggle between **Joint Space** and **Cartesian Space** modes in the header:

- **Joint Space**: Control each joint angle directly (J1-J6)
- **Cartesian Space**: Control TCP position (X,Y,Z) and orientation (RX,RY,RZ)

### 2. Set Desired Pose

**Joint Space Mode:**
- Use the 6 joint angle sliders (J1-J6) to position the robot
- Real-time 3D visualization updates as you move sliders

**Cartesian Space Mode:**
- Use the 6 cartesian sliders (X,Y,Z,RX,RY,RZ) to set target TCP pose
- Click "Compute IK" to solve for joint angles
- Robot moves to match target pose if IK succeeds

### 3. Record Keyframes

- Position robot at desired pose
- Click **"Record Keyframes"** button
- 6 keyframes are created (one per joint/axis) at current timeline position
- Keyframes appear on the timeline tracks

### 4. Edit Timeline

- **Drag keyframes** horizontally to change timing
- **Select keyframes** by clicking
- **Delete selected** with the delete button
- Timeline shows 6 tracks (J1-J6 or X,Y,Z,RX,RY,RZ)

### 5. Playback

- **Play**: Smooth interpolation between keyframes at 60fps
- **Pause**: Stop playback, maintain current position
- **Stop**: Reset to beginning (t=0)

### 6. Save & Load

- **Export**: Download timeline as JSON file
- **Import**: Load previously saved timeline

---

## Architecture

### Keyframe-Based Model

The editor uses a **per-joint/per-axis keyframe system** (not waypoints):

- **Keyframe**: Single value for one joint/axis at one time (e.g., "J3 = 45° at 2.5s")
- **Waypoint**: Complete robot pose at one time - NOT used
- Recording creates **6 independent keyframes** at the current time
- Each joint/axis interpolates independently

### Inverse Kinematics (IK)

Browser-based numerical IK solver:
- **Algorithm**: Damped Least Squares (Levenberg-Marquardt style)
- **DOF**: Full 6-DOF (position + orientation)
- **Convergence**: Iterative with position/orientation tolerances
- **Axis Masking**: Configurable (solve position-only, full 6-DOF, etc.)
- **Status Feedback**: Success/failure indicators with iteration count

### Forward Kinematics (FK)

Accurate FK from URDF model:
- Reads robot geometry directly from URDF file
- Computes TCP position through full kinematic chain
- Supports user-defined TCP offset
- Real-time updates during motion

### Motion Modes

| Mode | Input | Keyframes | IK Required | Use Case |
|------|-------|-----------|-------------|----------|
| **Joint Space** | 6 joint angles | Per-joint values | No | Direct joint control, joint-space trajectories |
| **Cartesian Space** | X,Y,Z,RX,RY,RZ | Per-axis values | Yes (during playback) | Task-space programming, position/orientation control |

---

## Project Structure

```
parol-timeline-poc/
├── app/
│   ├── components/              # React components
│   │   ├── RobotViewer.tsx      # 3D URDF visualization
│   │   ├── Timeline.tsx         # Timeline editor
│   │   ├── JointSliders.tsx     # Joint space controls
│   │   ├── CartesianSliders.tsx # Cartesian space controls + IK
│   │   ├── PlaybackControls.tsx # Play/Pause/Stop/Record
│   │   ├── TCPOffsetControls.tsx # TCP offset adjustment
│   │   ├── ActualTCPVisualizer.tsx # Visualize actual TCP pose
│   │   └── TargetPoseVisualizer.tsx # Visualize target pose
│   ├── hooks/
│   │   ├── usePlayback.ts       # 60fps playback loop
│   │   └── useScrubbing.ts      # Scrubber control
│   ├── lib/
│   │   ├── types.ts             # TypeScript interfaces
│   │   ├── constants.ts         # Joint limits, DH params, config
│   │   ├── store.ts             # Zustand state management
│   │   ├── kinematics.ts        # FK/IK algorithms
│   │   └── interpolation.ts     # Linear interpolation
│   ├── page.tsx                 # Main application page
│   ├── layout.tsx               # Root layout
│   └── globals.css              # Global styles
├── public/
│   └── urdf/
│       ├── PAROL6.urdf          # Robot model definition
│       └── meshes/              # STL mesh files
├── components/                   # shadcn/ui components
├── lib/                         # shadcn/ui utilities
├── ecosystem.config.js          # PM2 configuration (optional)
├── next.config.js               # Next.js configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Dependencies
```

---

## Configuration

### Joint Limits (PAROL6)

| Joint | Min | Max |
|-------|-----|-----|
| **J1** | -123.05° | 123.05° |
| **J2** | -145.01° | -3.38° |
| **J3** | 107.87° | 287.87° |
| **J4** | -105.47° | 105.47° |
| **J5** | -90° | 90° |
| **J6** | 0° | 360° |

### Default TCP Offset

- **X**: 47 mm
- **Y**: 0 mm
- **Z**: -62 mm

Adjustable via TCP Offset Controls in the UI.

### IK Solver Configuration

Located in `app/lib/constants.ts`:

```typescript
export const IK_DAMPING_FACTOR = 0.1;  // Lambda for damped least squares
export const IK_MAX_STEP_SIZE = 5.0;   // Max joint angle change per iteration (degrees)
```

---

## Timeline Export Format

Timelines are saved as JSON:

```json
{
  "name": "My Timeline",
  "mode": "cartesian",
  "keyframes": [
    { "id": "abc123", "time": 1.5, "joint": "J1", "value": 45.0 }
  ],
  "cartesianKeyframes": [
    { "id": "def456", "time": 2.0, "axis": "X", "value": 200.0 }
  ],
  "duration": 10.0,
  "fps": 60
}
```

---

## Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build optimized production bundle |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

### PM2 Process Management (Optional)

For production deployment:

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# View logs
pm2 logs parol-timeline

# Monitor
pm2 monit

# Restart
pm2 restart parol-timeline

# Stop
pm2 stop parol-timeline

# Auto-start on system boot
pm2 startup
pm2 save
```

---

## Known Limitations

1. **Simplified Kinematics**: FK/IK use geometric approximations for speed
2. **Linear Interpolation**: No cubic splines or parabolic blending yet
3. **No Velocity Limits**: Interpolation doesn't enforce dynamic constraints
4. **Frontend Only**: No hardware integration (pure simulation)

---

## Future Enhancements

### Interpolation Improvements
- Cubic/quintic spline interpolation
- Parabolic blending at keyframes
- Velocity and acceleration profiles
- Configurable interpolation per segment

### Timeline UI
- Multi-select keyframes
- Copy/paste keyframes
- Undo/redo system
- Timeline zoom and pan
- Velocity graph overlay

### Advanced IK
- Multiple IK solutions (elbow up/down)
- Collision detection
- Joint limit avoidance
- Singularity handling

### Hardware Integration (Optional)
- Serial communication with PAROL6
- Real-time position feedback
- Safety limits and E-stop
- Dry-run mode before execution

---

## Troubleshooting

### URDF Model Not Loading
- Verify URDF file exists at `/public/urdf/PAROL6.urdf`
- Check browser console for errors
- Ensure STL mesh files are in `/public/urdf/meshes/`

### IK Not Converging
- Target may be outside robot workspace
- Try position-only IK first (disable orientation axes)
- Check IK status messages for specific errors
- Increase max iterations in `kinematics.ts`

### Timeline Not Rendering
- Clear browser cache and reload
- Check console for `animation-timeline-js` errors
- Verify container div has proper dimensions

### Port Already in Use
```bash
# Use different port
PORT=3001 npm run dev
```

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see LICENSE file for details.

---

## References

- [PAROL6 Robot](https://github.com/PCrnjak/PAROL6-Desktop-robot-arm) - Open-source 6-axis robot arm
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber/) - React renderer for Three.js
- [animation-timeline-js](https://github.com/ievgennaida/animation-timeline-js) - Timeline control library
- [Next.js Documentation](https://nextjs.org/docs) - React framework
- [Zustand](https://github.com/pmndrs/zustand) - State management

---

**Live Demo:** Access the application at http://localhost:3000 after running `npm run dev`

**Made with** ❤️ **for the robotics community**
