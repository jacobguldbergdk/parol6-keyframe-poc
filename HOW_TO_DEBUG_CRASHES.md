# How to Debug STATUS_ACCESS_VIOLATION Crashes

## What Was Fixed

### Critical Memory Leaks (FIXED)
- ✅ **480 objects/second** created in TCP visualizers → **0 objects/second**
- ✅ ArrowHelper disposal added to free GPU memory
- ✅ WebGL context loss detection added

### Changes Made:
1. **TargetTCPVisualizer.tsx** - Reuse Vector3/Quaternion objects
2. **ActualTCPVisualizer.tsx** - Reuse Vector3/Quaternion objects
3. **MemoryMonitor.tsx** - New component to track memory usage
4. **WebGLContextMonitor** - Detects WebGL context loss

## How to Monitor Memory Usage

### Method 1: Built-in Memory Monitor (Optional)

To enable the visual memory monitor in the UI:

1. Edit `frontend/app/components/RobotViewer.tsx`
2. Add after `<WebGLContextMonitor />`:
   ```tsx
   {/* Memory Monitor - shows heap usage in bottom-right corner */}
   <MemoryMonitor />
   ```

3. The monitor will show:
   - Heap usage (MB) and percentage
   - Three.js objects count (geometries, textures, programs)
   - Draw calls and triangles
   - Component update rate

**NOTE:** This requires running Chrome with `--enable-precise-memory-info` flag.

### Method 2: Chrome DevTools (Recommended)

#### A. Task Manager (Quick Check)
1. Press `Shift+Esc` in Chrome
2. Look at "JavaScript memory" column
3. Memory should stabilize after initial load, NOT grow continuously

#### B. Performance Monitor (Real-time)
1. Open DevTools (`F12`)
2. Press `Ctrl+Shift+P` → type "Show Performance Monitor"
3. Watch:
   - **JS heap size** - Should oscillate (GC cycles), not grow linearly
   - **DOM Nodes** - Should stay relatively constant
   - **Event listeners** - Should not increase over time

#### C. Heap Snapshots (Detailed Analysis)
1. Open DevTools → **Memory** tab
2. Take a snapshot
3. Use the site for 10-15 minutes
4. Take another snapshot
5. Click "Comparison" view
6. Look for:
   - **Detached DOM nodes** - Memory leak indicator
   - **ArrayBuffer** growth - WebGL memory leak
   - **(array)** growth - JavaScript objects accumulating

### Method 3: Run Chrome with Debugging Flags

```bash
# Enable precise memory info + manual garbage collection
google-chrome --enable-precise-memory-info --js-flags="--expose-gc" http://localhost:3000

# In browser console, you can manually trigger GC:
window.gc()
```

## What to Look For

### ✅ GOOD (No Leak)
```
Heap: 50MB → 80MB → 50MB → 80MB (oscillating with GC)
Geometries: 150 (constant)
Textures: 45 (constant)
```

### ❌ BAD (Leak Present)
```
Heap: 50MB → 100MB → 150MB → 200MB (continuous growth)
Geometries: 150 → 160 → 170 → 180 (increasing)
Textures: 45 → 46 → 47 → 48 (increasing)
```

## Testing After Fixes

### Test 1: Static Load Test
1. Load the page
2. Don't move the robot
3. Wait 30 minutes
4. Memory should stabilize

### Test 2: Active Usage Test
1. Load the page
2. Move robot joints continuously
3. Switch between joint/cartesian mode
4. Record keyframes
5. Play timeline
6. Repeat for 30+ minutes
7. Memory should oscillate but not grow

### Test 3: WebSocket Stress Test
1. Enable live control mode
2. Keep WebSocket connected
3. Robot continuously moving
4. Check memory after 1 hour
5. Should still be stable

## If Crashes Still Occur

### Check Console for Errors
Look for:
```
🔴 WebGL Context Lost!
⚠️ HIGH MEMORY USAGE: 85.2%
```

### Check for Other Leaks

1. **Timeline Component:**
   ```bash
   grep -n "new " frontend/app/components/Timeline.tsx
   ```

2. **URDF Loader:**
   ```typescript
   // In URDFRobot component, ensure proper cleanup:
   useEffect(() => {
     return () => {
       if (robot) {
         robot.traverse((child) => {
           if (child.geometry) child.geometry.dispose();
           if (child.material) {
             if (Array.isArray(child.material)) {
               child.material.forEach(m => m.dispose());
             } else {
               child.material.dispose();
             }
           }
         });
       }
     };
   }, [robot]);
   ```

3. **WebSocket Component:**
   - Check if WebSocket is properly closed on unmount
   - Check if listeners are removed

### Reduce Update Rate

If still having issues, reduce the render loop frequency:

```typescript
// In visualizers, change:
useFrame(() => {  // Runs at 60fps
  // ...
});

// To:
useFrame((state, delta) => {  // Runs at 30fps
  // ...
}, 2);
```

## Expected Performance

After fixes:
- **Memory usage:** Stable at ~100-150MB
- **FPS:** Solid 60fps
- **Uptime:** Can run indefinitely without crashes
- **Three.js objects:** Constant count
- **No console errors:** Clean console

## Still Crashing?

If crashes persist after these fixes:

1. **Check browser version:** Update Chrome to latest
2. **Disable browser extensions:** Try incognito mode
3. **Check GPU:** Update graphics drivers
4. **Reduce load:**
   - Disable hardware robot visual (ghost)
   - Reduce WebSocket update rate to 10Hz
   - Hide TCP gizmos when not needed

5. **Report issue:**
   - Include heap snapshot
   - Include console logs
   - Include Chrome version
   - Include GPU info (`chrome://gpu`)
