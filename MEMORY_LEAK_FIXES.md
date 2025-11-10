# Memory Leak Diagnosis and Fixes

## Issue: STATUS_ACCESS_VIOLATION Browser Crashes

The browser crashes with STATUS_ACCESS_VIOLATION after the site has been open for some time. This indicates memory access violations, typically caused by memory leaks in WebGL/Three.js.

## Root Causes Found

### 1. **NEW OBJECTS CREATED EVERY FRAME** (CRITICAL)
**Location:** TargetTCPVisualizer.tsx, ActualTCPVisualizer.tsx (lines 97-108)

**Problem:**
```typescript
useFrame(() => {
  // These create NEW objects 60 times per second!
  const l6WorldPosition = new THREE.Vector3();
  const l6WorldQuaternion = new THREE.Quaternion();
  const localOffset = new THREE.Vector3(...);
  // ...
});
```

**Impact:**
- 3 Vector3 + 1 Quaternion per frame
- 2 visualizers × 4 objects × 60fps = **480 objects/second**
- **28,800 objects/minute**
- **1,728,000 objects/hour**

These objects accumulate in memory until garbage collection, but with such high allocation rate, the GC can't keep up, leading to memory exhaustion and crashes.

**Fix:** Reuse objects by storing them as refs outside useFrame.

### 2. **ArrowHelper Disposal**
**Location:** All visualizer components

**Problem:** ArrowHelpers contain geometries and materials that need explicit disposal.

**Current Code:**
```typescript
return () => {
  if (xArrowRef.current) groupRef.current?.remove(xArrowRef.current);
  // Missing: xArrowRef.current.dispose()
};
```

**Fix:** Call `.dispose()` on ArrowHelpers to free GPU memory.

### 3. **Potential setState in useFrame Loop**
**Location:** All visualizers

**Problem:** `useCommandStore.setState()` called in useFrame could trigger React re-renders at 60fps.

**Mitigation:** Already using `tcpPosesAreDifferent()` to avoid unnecessary updates, but should monitor.

### 4. **WebGL Context Loss Not Handled**
**Problem:** No recovery mechanism if WebGL context is lost.

**Fix:** Add context loss/restore event handlers.

## Fixes Implemented

### 1. Object Reuse in TCP Visualizers
- Store Vector3/Quaternion as refs
- Reuse same objects every frame
- Use `.set()` and `.copy()` instead of `new`

### 2. Proper Resource Disposal
- Call `.dispose()` on geometries
- Call `.dispose()` on materials
- Call `.dispose()` on ArrowHelpers

### 3. Memory Monitoring Component
- Track heap usage
- Monitor Three.js objects
- Detect WebGL context loss
- Alert on high memory usage

## Testing Procedure

1. **Enable Memory Monitor:**
   - Add `<MemoryMonitor />` to Canvas
   - Open Chrome DevTools → Performance → Memory

2. **Run Load Test:**
   - Let page run for 30+ minutes
   - Move robot continuously
   - Watch heap usage in monitor

3. **Check for Leaks:**
   - Heap should stabilize after initial load
   - Geometries/textures count should NOT continuously increase
   - If heap grows linearly → leak exists

4. **Take Heap Snapshots:**
   ```
   Chrome DevTools → Memory → Take Heap Snapshot
   Run for 10 minutes
   Take another snapshot
   Compare → Look for "Detached" objects
   ```

## Expected Behavior After Fixes

- **Memory usage:** Stable, oscillating with GC cycles
- **Heap growth:** None or minimal over time
- **Three.js objects:** Constant count
- **No crashes:** Can run indefinitely

## Additional Recommendations

1. **Reduce useFrame rate for non-visual updates:**
   - Use `useFrame((state, delta) => { ... }, 2)` for 30fps instead of 60fps

2. **Throttle WebSocket updates:**
   - Already configurable in WebSocket manager (rate_hz)

3. **Use Chrome flags for debugging:**
   ```bash
   google-chrome --enable-precise-memory-info --js-flags="--expose-gc"
   ```

4. **Monitor in production:**
   - Add Sentry or similar for crash reporting
   - Track memory usage over time
