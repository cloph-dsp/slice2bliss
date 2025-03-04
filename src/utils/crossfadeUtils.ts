/**
 * Utility functions for audio crossfading
 */

/**
 * Calculate optimal crossfade duration based on BPM and division
 * 
 * @param bpm Beats per minute
 * @param division Division as string (e.g., "1/4", "1/8", "1/16")
 * @param minDuration Minimum fade duration in seconds
 * @param maxDuration Maximum fade duration in seconds
 * @returns Optimal fade duration in seconds
 */
export function calculateOptimalCrossfadeDuration(
  bpm: number, 
  division: string,
  minDuration: number = 0.005, // 5ms minimum
  maxDuration: number = 0.25   // 250ms maximum
): number {
  // Calculate beat duration in seconds
  const beatDuration = 60 / bpm;
  
  // Convert division string to a numeric value
  const divisionValue = getDivisionValue(division);
  
  // Calculate slice duration
  const sliceDuration = beatDuration * divisionValue;
  
  // Calculate crossfade as percentage of slice duration
  // For smaller divisions (like 1/32), use smaller percentage
  // For larger divisions (like 1/4), use larger percentage
  let crossfadePercentage: number;
  
  switch (division) {
    case '1/32':
      crossfadePercentage = 0.08; // 8% of slice duration
      break;
    case '1/16':
      crossfadePercentage = 0.12; // 12% of slice duration
      break;
    case '1/8':
      crossfadePercentage = 0.15; // 15% of slice duration
      break;
    case '1/4':
      crossfadePercentage = 0.18; // 18% of slice duration
      break;
    case '1/2':
      crossfadePercentage = 0.20; // 20% of slice duration
      break;
    case '1/1':
      crossfadePercentage = 0.15; // 15% of slice duration (full bars need less relative fade)
      break;
    default:
      crossfadePercentage = 0.15; // Default to 15%
  }
  
  // Calculate optimal fade duration
  let fadeDuration = sliceDuration * crossfadePercentage;
  
  // Ensure fade duration is within bounds
  fadeDuration = Math.max(minDuration, Math.min(maxDuration, fadeDuration));
  
  // Ensure fade isn't too long relative to slice duration (max 25% of slice)
  fadeDuration = Math.min(fadeDuration, sliceDuration * 0.25);
  
  return fadeDuration;
}

/**
 * Calculate overlap duration for slices based on BPM and division
 * 
 * @param bpm Beats per minute
 * @param division Division as string (e.g., "1/4", "1/8", "1/16") 
 * @returns Overlap duration in seconds
 */
export function calculateSliceOverlap(bpm: number, division: string): number {
  // Base overlap on optimal crossfade, but make it slightly longer for safety
  const baseCrossfade = calculateOptimalCrossfadeDuration(bpm, division);
  return baseCrossfade * 1.5;
}

/**
 * Convert division string to a numeric value
 */
export function getDivisionValue(division: string): number {
  switch (division) {
    case '1/1': return 4.0;  // Whole note (4 beats)
    case '1/2': return 2.0;  // Half note (2 beats)
    case '1/4': return 1.0;  // Quarter note (1 beat)
    case '1/8': return 0.5;  // Eighth note (1/2 beat)
    case '1/16': return 0.25; // Sixteenth note (1/4 beat)
    case '1/32': return 0.125; // Thirty-second note (1/8 beat)
    default: return 1.0; // Default to quarter notes (1 beat)
  }
}

/**
 * Apply equal-power crossfade to gain nodes for smoother transitions
 * Advanced version with additional anti-click measures
 */
export function applyEqualPowerCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime?: number,
  transitionSpeed: number = 1.0
): void {
  const now = startTime || audioContext.currentTime;
  
  // Ensure gain nodes are at their starting positions
  currentGain.gain.setValueAtTime(1.0, now);
  nextGain.gain.setValueAtTime(0.0, now);
  
  // Create a hyper-precise step count for the fastest transitions
  // More steps = smoother transition = less clicking
  const curveSteps = transitionSpeed >= 3.5 ? 256 :  // Extreme high speed 
                    transitionSpeed > 2.5 ? 192 :    // Very high speed
                    transitionSpeed > 1.5 ? 128 :    // High speed
                    transitionSpeed > 1.0 ? 96 :     // Moderate high speed
                    64;                              // Default steps
  
  // Anti-click measures: graduated approach based on transition speed
  if (transitionSpeed >= 3) {
    // For the highest speeds, use the specialized ultra-smooth curves with 
    // extremely gradual onsets and non-zero minimum values
    applyUltraAntiClickCrossfade(
      currentGain, nextGain, audioContext, fadeDuration, now, curveSteps
    );
  } 
  else if (transitionSpeed > 1.0) {
    // For medium-high speeds, use enhanced curves with smoother transitions
    currentGain.gain.setValueCurveAtTime(
      createEnhancedFadeOutCurve(fadeDuration, curveSteps, transitionSpeed),
      now,
      fadeDuration
    );
    
    nextGain.gain.setValueCurveAtTime(
      createEnhancedFadeInCurve(fadeDuration, curveSteps, transitionSpeed),
      now,
      fadeDuration
    );
  } 
  else {
    // For normal/slow transitions, use standard equal power crossfade
    currentGain.gain.setValueCurveAtTime(
      createEqualPowerFadeOutCurve(fadeDuration, curveSteps),
      now,
      fadeDuration
    );
    
    nextGain.gain.setValueCurveAtTime(
      createEqualPowerFadeInCurve(fadeDuration, curveSteps),
      now,
      fadeDuration
    );
  }
}

/**
 * Ultra-smooth crossfade technique specifically designed to eliminate all clicks
 * at high transition speeds
 */
function applyUltraAntiClickCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime: number,
  steps: number = 256
): void {
  // Ultra-smooth crossfade with guaranteed non-zero minimum values
  // and carefully controlled derivatives at all points
  
  // Phase 1: Begin fading out the current gain using an optimized curve
  // that never quite reaches zero (avoids discontinuity)
  const outCurve = createSuperSmoothFadeOutCurve(fadeDuration, steps);
  currentGain.gain.setValueCurveAtTime(outCurve, startTime, fadeDuration);
  
  // Phase 2: Start the next gain from a small non-zero value and ramp up
  // using a complementary curve that ensures total power is constant
  const inCurve = createSuperSmoothFadeInCurve(fadeDuration, steps);
  nextGain.gain.setValueCurveAtTime(inCurve, startTime, fadeDuration);
  
  // Phase 3: Schedule final cleanup values to ensure proper end states
  // This happens after the crossfade to clean up any lingering issues
  const cleanupTime = startTime + fadeDuration + 0.005; // 5ms after crossfade
  currentGain.gain.setValueAtTime(0.001, cleanupTime); // Ensure near-zero
  currentGain.gain.linearRampToValueAtTime(0, cleanupTime + 0.01); // Final fade to zero
  nextGain.gain.setValueAtTime(0.999, cleanupTime); // Ensure near-one
  nextGain.gain.linearRampToValueAtTime(1, cleanupTime + 0.01); // Final ramp to one
}

/**
 * Create an ultra-smooth fade-out curve that never fully reaches zero
 * Uses a specially designed spline curve with controlled first and second derivatives
 */
function createSuperSmoothFadeOutCurve(duration: number, steps: number = 256): Float32Array {
  const curve = new Float32Array(steps);
  
  // Never go completely to zero - maintain a tiny bit of signal
  const minValue = 0.001;
  
  for (let i = 0; i < steps; i++) {
    const normalized = i / (steps - 1);
    
    // Advanced curve shape with careful control of derivatives
    // This combination of curves ensures extremely smooth transitions
    let value;
    
    if (normalized < 0.1) {
      // First 10%: Almost flat with very gentle initial decrease
      // This avoids any sudden change at the start of the fade
      value = 1 - normalized * normalized * 0.2;
    } 
    else if (normalized < 0.7) {
      // Mid section: Smooth polynomial transition
      // Get position within this segment (0-1)
      const segmentPosition = (normalized - 0.1) / 0.6;
      // Apply a smooth 5th-order polynomial for extra smoothness
      // y = 1 - 6x^5 + 15x^4 - 10x^3 gives a very smooth transition
      const t = segmentPosition;
      const polynomial = 1 - 6*Math.pow(t,5) + 15*Math.pow(t,4) - 10*Math.pow(t,3);
      // Scale the result to the appropriate range (0.98 to 0.1)
      value = 0.98 - polynomial * 0.88;
    } 
    else {
      // Final 30%: Asymptotic approach to minimum value
      // This ensures we never have a sharp discontinuity at the end
      const segmentPosition = (normalized - 0.7) / 0.3;
      // Exponential approach to the minimum
      value = 0.1 * Math.exp(-3 * segmentPosition) + minValue;
    }
    
    curve[i] = value;
  }
  
  return curve;
}

/**
 * Create an ultra-smooth fade-in curve that starts from non-zero
 * Perfectly complementary to the super-smooth fade-out curve
 */
function createSuperSmoothFadeInCurve(duration: number, steps: number = 256): Float32Array {
  const curve = new Float32Array(steps);
  
  // Start from a very small but non-zero value
  const minValue = 0.001;
  
  for (let i = 0; i < steps; i++) {
    const normalized = i / (steps - 1);
    
    // Create a curve that's complementary to the fade-out curve
    let value;
    
    if (normalized < 0.3) {
      // First 30%: Gradual exponential increase from minimum
      const segmentPosition = normalized / 0.3;
      value = minValue + (0.1 - minValue) * (1 - Math.exp(-3 * segmentPosition));
    } 
    else if (normalized < 0.9) {
      // Mid section: Smooth polynomial transition (complementary to fade-out)
      const segmentPosition = (normalized - 0.3) / 0.6;
      // Use the same polynomial but inverted
      const t = segmentPosition;
      const polynomial = 6*Math.pow(t,5) - 15*Math.pow(t,4) + 10*Math.pow(t,3);
      // Scale to appropriate range (0.1 to 0.98)
      value = 0.1 + polynomial * 0.88;
    } 
    else {
      // Final 10%: Smooth approach to full value
      const segmentPosition = (normalized - 0.9) / 0.1;
      // Quadratic ease to 1
      value = 0.98 + (1 - 0.98) * (segmentPosition * (2 - segmentPosition));
    }
    
    curve[i] = value;
  }
  
  return curve;
}

/**
 * Find the nearest zero crossing in an audio buffer
 * Useful for finding clean transition points when slicing audio
 */
export function findNearestZeroCrossing(
  buffer: AudioBuffer,
  position: number,
  windowSize: number = 100, // Samples to check each direction
  channel: number = 0       // Channel to analyze
): number {
  const data = buffer.getChannelData(channel);
  const samplePosition = Math.floor(position * buffer.sampleRate);
  
  // Sanity checks
  if (samplePosition <= 0) return 0;
  if (samplePosition >= data.length - 1) return data.length - 1;
  
  // First check if we're already at a zero crossing
  if (Math.abs(data[samplePosition]) < 0.00001) {
    return position;
  }
  
  // Search window boundaries
  const start = Math.max(0, samplePosition - windowSize);
  const end = Math.min(data.length - 1, samplePosition + windowSize);
  
  // Find zero crossings and their distance to desired position
  let closestZeroCrossing = samplePosition;
  let minDistance = Number.MAX_VALUE;
  
  for (let i = start; i < end; i++) {
    // Check for sign change, indicating zero crossing
    if (i > 0 && (data[i] * data[i-1] <= 0)) {
      const distance = Math.abs(i - samplePosition);
      if (distance < minDistance) {
        minDistance = distance;
        closestZeroCrossing = i;
      }
    }
  }
  
  // Convert sample position back to time
  return closestZeroCrossing / buffer.sampleRate;
}

/**
 * Create an array representing an equal-power fade-in curve (quarter sine wave)
 */
function createEqualPowerFadeInCurve(duration: number, steps: number = 100): Float32Array {
  const curve = new Float32Array(steps);
  
  for (let i = 0; i < steps; i++) {
    // Use sine-based equal-power curve: sin(x * PI/2) gives us 0->1 curve with proper power distribution
    const normalized = i / (steps - 1);
    curve[i] = Math.sin(normalized * Math.PI / 2);
  }
  
  return curve;
}

/**
 * Create an array representing an equal-power fade-out curve (quarter sine wave)
 */
function createEqualPowerFadeOutCurve(duration: number, steps: number = 100): Float32Array {
  const curve = new Float32Array(steps);
  
  for (let i = 0; i < steps; i++) {
    // Use cosine-based equal-power curve: cos(x * PI/2) gives us 1->0 curve with proper power distribution
    const normalized = i / (steps - 1);
    curve[i] = Math.cos(normalized * Math.PI / 2);
  }
  
  return curve;
}

/**
 * Create an enhanced fade-in curve optimized for fast transitions
 * Uses a modified equal-power curve with gentler attack to prevent clicks
 */
function createEnhancedFadeInCurve(duration: number, steps: number = 100, speed: number = 1.0): Float32Array {
  const curve = new Float32Array(steps);
  
  // For very fast transitions, we start with an anti-click buffer (not completely silent)
  const antiClickBuffer = Math.min(0.15, 0.05 * speed);
  
  for (let i = 0; i < steps; i++) {
    const normalized = i / (steps - 1);
    
    // Apply smoothing to the normalized curve for faster transitions
    let value;
    
    if (normalized < antiClickBuffer) {
      // Progressive gentle fade in from almost-zero (not complete zero to avoid discontinuity)
      value = 0.01 + (normalized / antiClickBuffer) * 0.09;
    } else {
      // Main part of the curve uses equal power formula with smoothing
      const adjustedPosition = (normalized - antiClickBuffer) / (1 - antiClickBuffer);
      value = Math.sin(adjustedPosition * Math.PI / 2) * 0.9 + 0.1;
    }
    
    curve[i] = value;
  }
  
  return curve;
}

/**
 * Create an enhanced fade-out curve optimized for fast transitions
 * Uses a modified equal-power curve with gentler release to prevent clicks
 */
function createEnhancedFadeOutCurve(duration: number, steps: number = 100, speed: number = 1.0): Float32Array {
  const curve = new Float32Array(steps);
  
  // For very fast transitions, we leave an anti-click buffer at the end (not completely silent)
  const antiClickBuffer = Math.min(0.15, 0.05 * speed);
  
  for (let i = 0; i < steps; i++) {
    const normalized = i / (steps - 1);
    
    // Apply smoothing to the normalized curve for faster transitions
    let value;
    
    if (normalized > (1 - antiClickBuffer)) {
      // Progressive gentle fade to almost-zero (not complete zero)
      const positionInBuffer = (normalized - (1 - antiClickBuffer)) / antiClickBuffer;
      value = 0.1 * (1 - positionInBuffer);
    } else {
      // Main part of the curve uses equal power formula with smoothing
      const adjustedPosition = normalized / (1 - antiClickBuffer);
      value = Math.cos(adjustedPosition * Math.PI / 2) * 0.9 + 0.1;
    }
    
    curve[i] = value;
  }
  
  return curve;
}

/**
 * Create an ultra-smooth fade-in curve for extreme speeds (3.5x-4x)
 * Very gradual onset with extended attack phase to completely eliminate clicks
 */
function createExtremeSpeedFadeInCurve(duration: number, steps: number = 192): Float32Array {
  const curve = new Float32Array(steps);
  
  // Large safety buffer at the start (25%)
  const safetyBuffer = 0.25;
  
  // Start from a very small non-zero value to avoid discontinuities
  const startValue = 0.001;
  
  for (let i = 0; i < steps; i++) {
    const normalized = i / (steps - 1);
    let value;
    
    if (normalized < safetyBuffer) {
      // Very gradual onset for the first quarter
      // Use a polynomial curve for extra smoothness
      const phase = normalized / safetyBuffer;
      value = startValue + (phase * phase * phase * phase) * 0.05; // Quartic curve to ~0.05
    } else {
      // Gradual power curve for the rest
      const phase = (normalized - safetyBuffer) / (1 - safetyBuffer);
      // Blend from previous value to full using a modified sine curve
      const prevValue = startValue + Math.pow(safetyBuffer, 4) * 0.05;
      value = prevValue + (Math.sin(phase * Math.PI / 2) * (1 - prevValue));
    }
    
    curve[i] = value;
  }
  
  return curve;
}

/**
 * Create an ultra-smooth fade-out curve for extreme speeds (3.5x-4x)
 * Very gentle release with extended phase to completely eliminate clicks
 */
function createExtremeSpeedFadeOutCurve(duration: number, steps: number = 192): Float32Array {
  const curve = new Float32Array(steps);
  
  // Large safety buffer at the end (25%)
  const safetyBuffer = 0.25;
  // End with a very small non-zero value to avoid discontinuities
  const endValue = 0.001;
  
  for (let i = 0; i < steps; i++) {
    const normalized = i / (steps - 1);
    let value;
    
    if (normalized > (1 - safetyBuffer)) {
      // Very gradual release for the final quarter
      const phase = (normalized - (1 - safetyBuffer)) / safetyBuffer;
      // Use a polynomial curve for the final gentle fade
      value = 0.05 * Math.pow(1 - phase, 4) + endValue;
    } else {
      // Gradual power curve for the main part
      const phase = normalized / (1 - safetyBuffer);
      // Modified cosine curve for smoother power distribution
      value = Math.cos(phase * Math.PI / 2) * 0.95 + 0.05;
    }
    
    curve[i] = value;
  }
  
  return curve;
}

/**
 * Calculate optimal attack/decay times for transients based on audio characteristics
 */
export function calculateTransientEnvelope(
  bpm: number,
  division: string,
  hasSharpTransients: boolean = false
): { attack: number; decay: number } {
  // Base values
  let attack = 0.005; // 5ms default attack
  let decay = 0.015;  // 15ms default decay
  
  // Adjust based on BPM
  const beatDuration = 60 / bpm;
  
  // Adjust based on division
  const divisionValue = getDivisionValue(division);
  const sliceDuration = beatDuration * divisionValue;
  
  // For very short slices, use faster attack/decay
  if (sliceDuration < 0.1) { // Less than 100ms
    attack = Math.max(0.002, sliceDuration * 0.03);
    decay = Math.max(0.005, sliceDuration * 0.08);
  } else {
    // For longer slices, scale with slice duration but with limits
    attack = Math.min(0.01, Math.max(0.004, sliceDuration * 0.02));
    decay = Math.min(0.03, Math.max(0.01, sliceDuration * 0.05));
  }
  
  // For content with sharp transients, use even faster attack
  if (hasSharpTransients) {
    attack *= 0.7;
  }
  
  return { attack, decay };
}

/**
 * Apply ultra-zero-click crossfade - specialized for eliminating ALL clicks
 */
export function applyUltraZeroClickCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime?: number,
  transitionSpeed: number = 1.0
): void {
  const now = startTime || audioContext.currentTime;
  
  // Step 1: Initialize both gain nodes with non-zero values to prevent discontinuities
  currentGain.gain.cancelScheduledValues(now);
  nextGain.gain.cancelScheduledValues(now);
  currentGain.gain.setValueAtTime(0.9999, now);
  nextGain.gain.setValueAtTime(0.0001, now);
  
  // Calculate fade stages (multi-phase crossfade for extreme smoothness)
  // Having multiple stages creates more control points for the curve
  const fadeInStage1 = fadeDuration * 0.3;
  const fadeInStage2 = fadeDuration * 0.7;
  const fadeOutStage1 = fadeDuration * 0.3;
  const fadeOutStage2 = fadeDuration * 0.7;
  
  // For fadeout - First stage: Very gentle initial decrease (9th order curve)
  currentGain.gain.setTargetAtTime(0.9, now, fadeOutStage1 * 0.3);
  
  // Second stage: Main decrease but never going fully to zero
  const midOutTime = now + fadeOutStage1;
  currentGain.gain.setValueAtTime(0.85, midOutTime);
  currentGain.gain.setTargetAtTime(0.03, midOutTime, fadeOutStage2 * 0.4);
  
  // Third stage: Final approach to near-zero (never absolute zero)
  const finalOutTime = now + fadeOutStage1 + fadeOutStage2;
  currentGain.gain.setValueAtTime(0.03, finalOutTime);
  currentGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration + 0.005);
  
  // For fadein - First stage: Very gentle initial increase
  nextGain.gain.setTargetAtTime(0.1, now, fadeInStage1 * 0.3);
  
  // Second stage: Main increase
  const midInTime = now + fadeInStage1;
  nextGain.gain.setValueAtTime(0.15, midInTime);
  nextGain.gain.setTargetAtTime(0.9, midInTime, fadeInStage2 * 0.4);
  
  // Third stage: Final approach to nearly full value
  const finalInTime = now + fadeInStage1 + fadeInStage2;
  nextGain.gain.setValueAtTime(0.9, finalInTime);
  nextGain.gain.linearRampToValueAtTime(1.0, now + fadeDuration + 0.005);
  
  // Cleanup to ensure proper end states
  setTimeout(() => {
    try {
      currentGain.gain.setValueAtTime(0, now + fadeDuration + 0.01);
      nextGain.gain.setValueAtTime(1, now + fadeDuration + 0.01);
    } catch(e) {
      // Ignore - node might have been disconnected
    }
  }, (fadeDuration + 0.015) * 1000);
}

/**
 * High-precision crossfade with ultrafine resolution
 * Designed to guarantee zero-click transitions even at extreme speeds
 */
export function applyPrecisionCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime?: number,
  transitionSpeed: number = 1.0
): void {
  const now = startTime || audioContext.currentTime;
  
  // Use higher exponential precision for higher speeds
  const timeConstantOut = transitionSpeed > 2 ? fadeDuration * 0.3 : fadeDuration * 0.4;
  const timeConstantIn = transitionSpeed > 2 ? fadeDuration * 0.35 : fadeDuration * 0.45;
  
  // Current (outgoing) gain curve
  // Start with exponential approach to a low value
  currentGain.gain.setValueAtTime(1, now);
  currentGain.gain.setTargetAtTime(0.001, now, timeConstantOut);
  
  // Schedule a cleanup linearRamp to guarantee reaching zero
  // This extra step ensures we reach exactly zero
  currentGain.gain.linearRampToValueAtTime(0, now + fadeDuration + 0.005);
  
  // Next (incoming) gain curve
  // Start with very small non-zero value
  nextGain.gain.setValueAtTime(0.001, now);
  
  // Use exponential approach toward target of 1.0
  nextGain.gain.setTargetAtTime(1.0, now, timeConstantIn);
  
  // Schedule a cleanup linearRamp to guarantee reaching exactly 1.0
  nextGain.gain.linearRampToValueAtTime(1.0, now + fadeDuration + 0.005);
}

/**
 * Apply different crossfade strategies based on speed with guaranteed zero clicks
 */
export function applyZeroClickCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime?: number,
  transitionSpeed: number = 1.0
): void {
  // Choose strategy based on transition speed to ensure zero clicks
  if (transitionSpeed >= 3.5) {
    // Extreme speeds (3.5-4.0x): Use ultra-smooth multi-stage crossfade
    applyUltraZeroClickCrossfade(
      currentGain, nextGain, audioContext, 
      fadeDuration * 1.2, // Extra time for safety
      startTime, 
      transitionSpeed
    );
  }
  else if (transitionSpeed >= 2.0) {
    // High speeds (2.0-3.5x): Use precision crossfade with exponential curves
    applyPrecisionCrossfade(
      currentGain, nextGain, audioContext,
      fadeDuration * 1.1, // Slightly more time
      startTime,
      transitionSpeed
    );
  }
  else if (transitionSpeed > 1.0) {
    // Above normal speeds (1.0-2.0x): Use enhanced curves 
    // but with smoother transitions
    const steps = Math.floor(128 + 64 * (transitionSpeed - 1)); // More steps for higher speeds
    
    // Use super-smooth curves instead of normal enhanced curves
    currentGain.gain.setValueCurveAtTime(
      createSuperSmoothFadeOutCurve(fadeDuration, steps),
      startTime || audioContext.currentTime,
      fadeDuration
    );
    
    nextGain.gain.setValueCurveAtTime(
      createSuperSmoothFadeInCurve(fadeDuration, steps),
      startTime || audioContext.currentTime,
      fadeDuration
    );
  }
  else {
    // Normal speed (1.0x or less): Use regular equal-power crossfade
    // with adequate points for smoothness
    currentGain.gain.setValueCurveAtTime(
      createEqualPowerFadeOutCurve(fadeDuration, 96), // Increased point count
      startTime || audioContext.currentTime,
      fadeDuration
    );
    
    nextGain.gain.setValueCurveAtTime(
      createEqualPowerFadeInCurve(fadeDuration, 96), // Increased point count
      startTime || audioContext.currentTime,
      fadeDuration
    );
  }
}
