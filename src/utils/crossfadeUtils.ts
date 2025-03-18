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
 * @param playbackRate Optional playback rate for speed-adjusted overlaps
 * @returns Overlap duration in seconds
 */
export function calculateSliceOverlap(
  bpm: number, 
  division: string, 
  playbackRate: number = 1.0
): number {
  // Base overlap on optimal crossfade, but make it slightly longer for safety
  const baseCrossfade = calculateOptimalCrossfadeDuration(bpm, division);
  
  // Apply speed-based adjustments
  if (playbackRate < 1.0) {
    // For slow speeds, use specialized calculation with longer overlaps
    return calculateSlowSpeedOverlap(baseCrossfade, playbackRate);
  }
  
  // For normal or faster speeds
  return baseCrossfade * 1.5;
}

/**
 * Calculate special overlap durations for slow playback rates
 * Using a non-linear scaling to provide more overlap at slower speeds
 */
function calculateSlowSpeedOverlap(baseDuration: number, playbackRate: number): number {
  // Ensure we're dealing with slow playback
  if (playbackRate >= 1.0) return baseDuration * 1.5;

  // Calculate how much to extend the overlap based on slowness
  // The slower the playback, the more overlap needed
  const slownessFactor = 1.0 / Math.max(0.05, playbackRate);
  
  // Apply non-linear scaling for extremely slow playback
  const scaleFactor = playbackRate < 0.25 ? 
                      3.0 + (0.25 - playbackRate) * 8.0 : // Very slow: much longer overlaps
                      playbackRate < 0.5 ? 
                      2.0 + (0.5 - playbackRate) * 4.0 :  // Moderately slow: longer overlaps
                      1.5 + (1.0 - playbackRate) * 1.0;   // Slightly slow: slightly longer overlaps
  
  // Apply non-linear scaling, capping at reasonable limits to avoid extreme overlaps
  const maxMultiplier = 8.0; // Don't let overlaps get too extreme
  const multiplier = Math.min(maxMultiplier, scaleFactor);
  
  return baseDuration * multiplier;
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
 * Find the nearest zero crossing in an audio buffer with enhanced precision
 * Selects the optimal zero crossing for minimal discontinuity
 */
export function findNearestZeroCrossing(
  buffer: AudioBuffer,
  position: number,
  windowSize: number = 200, // Increased window size for better search
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
  
  // Search window boundaries with safety margins
  const start = Math.max(1, samplePosition - windowSize);
  const end = Math.min(data.length - 2, samplePosition + windowSize);
  
  // Structure to track candidate zero crossings with quality metrics
  interface ZeroCrossing {
    position: number;
    distance: number;  // Distance from target position
    slope: number;     // Slope at crossing (lower is better)
    energy: number;    // Local energy around crossing (lower is better)
  }
  
  const candidates: ZeroCrossing[] = [];
  
  // Find zero crossings and calculate quality metrics
  for (let i = start; i < end; i++) {
    // Check for sign change, indicating zero crossing
    if ((data[i] >= 0 && data[i-1] < 0) || (data[i] <= 0 && data[i-1] > 0)) {
      // Calculate exact zero crossing position using linear interpolation
      const t = data[i-1] / (data[i-1] - data[i]);
      const exactPos = i - 1 + t;
      
      // Calculate slope (rate of change)
      const slope = Math.abs(data[i] - data[i-1]);
      
      // Calculate local energy in a small window (for stability assessment)
      let energy = 0;
      const windowRadius = 4;
      for (let j = -windowRadius; j <= windowRadius; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < data.length) {
          energy += data[idx] * data[idx];
        }
      }
      
      // Add to candidates
      candidates.push({
        position: exactPos,
        distance: Math.abs(exactPos - samplePosition),
        slope: slope,
        energy: energy
      });
    }
  }
  
  if (candidates.length === 0) {
    // No zero crossings found, return original position
    return position;
  }
  
  // Score candidates based on combined metrics
  // We want: close to target position, low slope, and low local energy
  let bestCandidate = candidates[0];
  let bestScore = Infinity;
  
  for (const candidate of candidates) {
    // Normalize distance to windowSize
    const distanceScore = candidate.distance / windowSize;
    // Normalize slope (typical max slope is around 2.0)
    const slopeScore = candidate.slope / 2.0;
    // Energy score (normalized to typical values)
    const energyScore = candidate.energy / 0.1;
    
    // Combined score with weights
    const score = 0.5 * distanceScore + 0.3 * slopeScore + 0.2 * energyScore;
    
    if (score < bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }
  
  // Convert sample position back to time
  return bestCandidate.position / buffer.sampleRate;
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

/**
 * Apply phase-aligned crossfade between audio slices with enhanced zero-crossing detection
 */
export function applyPhaseAlignedCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  currentBuffer: AudioBuffer | null,
  nextBuffer: AudioBuffer | null,
  fadeDuration: number,
  startTime?: number,
  transitionSpeed: number = 1.0
): void {
  // Basic crossfade as fallback if buffers aren't available
  if (!currentBuffer || !nextBuffer) {
    console.log("Phase-aligned crossfade: Missing buffer, using zero-click fallback");
    applyZeroClickCrossfade(currentGain, nextGain, audioContext, fadeDuration, startTime, transitionSpeed);
    return;
  }

  const now = startTime ?? audioContext.currentTime;
  
  // Analyze both buffers for spectral content and transients
  const currentHasTransients = detectTransients(currentBuffer);
  const nextHasTransients = detectTransients(nextBuffer);
  
  // Calculate phase correlation between end of current and start of next
  const correlationFactor = calculatePhaseCorrelation(currentBuffer, nextBuffer);
  
  // Analyze spectral content to optimize fade timing
  // This is especially important for slow playback rates
  const currentMetrics = analyzeSpectralContent(currentBuffer);
  const nextMetrics = analyzeSpectralContent(nextBuffer);
  
  // Combine metrics, giving more weight to the more challenging one
  const combinedMetrics: SpectralMetrics = {
    lowFrequencyEnergy: Math.max(currentMetrics.lowFrequencyEnergy, nextMetrics.lowFrequencyEnergy),
    bassTransitionScore: Math.max(currentMetrics.bassTransitionScore, nextMetrics.bassTransitionScore),
    spectralFlux: Math.max(currentMetrics.spectralFlux, nextMetrics.spectralFlux),
    recommendedFadeExtension: Math.max(
      currentMetrics.recommendedFadeExtension, 
      nextMetrics.recommendedFadeExtension
    )
  };
  
  // Apply spectral-based compensation to fade duration for slow speeds
  // (only for speeds < 1.0, as fast speeds don't need this compensation)
  const compensatedFadeDuration = transitionSpeed < 1.0 ?
    applySpectralFadeCompensation(fadeDuration, combinedMetrics, transitionSpeed) :
    fadeDuration;
  
  // Enhanced crossfade strategy selection based on content analysis
  if (correlationFactor < -0.5) {
    // Highly out-of-phase content needs special care
    console.log("Detected out-of-phase content, using specialized crossfade");
    applyUltraZeroClickCrossfade(
      currentGain, nextGain, audioContext, 
      compensatedFadeDuration * 1.5, // Extra time for out-of-phase content
      now, 
      transitionSpeed
    );
  }
  else if (nextHasTransients) {
    // Next slice has strong transients (like drum hits) - preserve attack
    console.log("Detected transients in next slice, using transient-preserving crossfade");
    
    // Even with transients, we apply some compensation at slow speeds
    const transientAwareDuration = transitionSpeed < 0.5 ?
      compensatedFadeDuration * 0.8 : // Some compensation for slow speeds with transients
      fadeDuration;
      
    applyTransientPreservingCrossfade(
      currentGain, nextGain, audioContext,
      transientAwareDuration,
      now, 
      transitionSpeed
    );
  }
  // Handle VERY slow speeds with special crossfade technique
  else if (transitionSpeed < 0.4) {
    // For very slow speeds, use specialized slow rate crossfade
    console.log(`Using spectral-compensated slow-rate crossfade at speed ${transitionSpeed}`);
    
    // Add bass-content compensation multiplier (already in compensatedFadeDuration)
    const bassAwareFadeDuration = combinedMetrics.lowFrequencyEnergy > 0.7 ?
      compensatedFadeDuration * 1.2 : // Extra time for very bass-heavy content at slow speeds
      compensatedFadeDuration;
      
    applySlowRateCrossfade(
      currentGain, nextGain, audioContext, 
      bassAwareFadeDuration,
      now, 
      transitionSpeed
    );
  }
  else {
    // Standard case - use adaptive crossfade with spectral compensation
    const adjustedDuration = transitionSpeed > 2 ? 
      fadeDuration * 1.2 : // Fast speed adjustment (no spectral compensation needed)
      compensatedFadeDuration;
      
    applyAdaptiveCrossfade(
      currentGain, nextGain, audioContext, 
      adjustedDuration, 
      now, 
      transitionSpeed
    );
  }
}

/**
 * Detect transients in audio buffer
 * @returns True if strong transients detected
 */
function detectTransients(buffer: AudioBuffer): boolean {
  // Get first channel data for analysis
  const data = buffer.getChannelData(0);
  
  // Analyze first 10% of the buffer for transients
  const sampleCount = Math.min(2048, Math.floor(data.length * 0.1));
  
  // Calculate RMS of the beginning segment
  let rmsSum = 0;
  for (let i = 0; i < sampleCount; i++) {
    rmsSum += data[i] * data[i];
  }
  const rms = Math.sqrt(rmsSum / sampleCount);
  
  // Calculate peak value
  let peak = 0;
  for (let i = 0; i < sampleCount; i++) {
    const abs = Math.abs(data[i]);
    if (abs > peak) peak = abs;
  }
  
  // Calculate crest factor (peak/RMS ratio)
  const crestFactor = peak / (rms || 0.000001); // Prevent division by zero
  
  // High crest factor indicates transients
  return crestFactor > 4.5;
}

/**
 * Apply crossfade optimized for preserving transients
 */
function applyTransientPreservingCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime: number,
  transitionSpeed: number
): void {
  // Fast fade out for current sound
  const currentFadeDuration = fadeDuration * 0.6;
  currentGain.gain.cancelScheduledValues(startTime);
  currentGain.gain.setValueAtTime(currentGain.gain.value, startTime);
  currentGain.gain.linearRampToValueAtTime(0, startTime + currentFadeDuration);
  
  // Quick fade in for next sound to preserve attack
  nextGain.gain.cancelScheduledValues(startTime);
  nextGain.gain.setValueAtTime(0, startTime);
  nextGain.gain.linearRampToValueAtTime(1, startTime + fadeDuration * 0.3);
}

/**
 * Apply adaptive crossfade based on speed and content
 */
function applyAdaptiveCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime: number,
  transitionSpeed: number
): void {
  const now = startTime;
  
  // Use different curve shapes and step counts based on transition speed
  const steps = transitionSpeed >= 3.0 ? 512 :
               transitionSpeed >= 2.0 ? 384 :
               transitionSpeed >= 1.0 ? 256 : 192;
               
  // Create specialized curves for this speed
  const fadeOutCurve = new Float32Array(steps);
  const fadeInCurve = new Float32Array(steps);
  
  // For high speeds, use asymmetric curves with careful attack/release shaping
  for (let i = 0; i < steps; i++) {
    const x = i / (steps - 1);
    
    // Enhanced equal-power crossfade with speed compensation
    if (transitionSpeed > 2.5) {
      // Ultra-smooth curves for very high speeds
      fadeOutCurve[i] = Math.cos(x * Math.PI / 2) * (1 - x * 0.2) + 0.001;
      fadeInCurve[i] = Math.sin(x * Math.PI / 2) * (0.8 + x * 0.2);
    } else {
      // Regular equal-power curves for normal speeds
      fadeOutCurve[i] = Math.cos(x * Math.PI / 2);
      fadeInCurve[i] = Math.sin(x * Math.PI / 2);
    }
  }
  
  // Apply curves with precise timing
  currentGain.gain.cancelScheduledValues(now);
  nextGain.gain.cancelScheduledValues(now);
  
  currentGain.gain.setValueCurveAtTime(fadeOutCurve, now, fadeDuration);
  nextGain.gain.setValueCurveAtTime(fadeInCurve, now, fadeDuration);
}

/**
 * Apply multi-band crossfade for highest quality transitions
 * Handles different frequency bands separately for cleaner transitions
 */
export function applyMultibandCrossfade(
  currentSourceNode: AudioBufferSourceNode,
  nextSourceNode: AudioBufferSourceNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime?: number,
  transitionSpeed: number = 1.0
): void {
  // Create filters for low, mid, and high bands
  const lowpassCurrent = audioContext.createBiquadFilter();
  const lowpassNext = audioContext.createBiquadFilter();
  const highpassCurrent = audioContext.createBiquadFilter();
  const highpassNext = audioContext.createBiquadFilter();
  const midCurrent = audioContext.createGain();
  const midNext = audioContext.createGain();
  
  // Configure filters
  lowpassCurrent.type = "lowpass";
  lowpassCurrent.frequency.value = 300;
  lowpassCurrent.Q.value = 0.7;
  
  lowpassNext.type = "lowpass";
  lowpassNext.frequency.value = 300;
  lowpassNext.Q.value = 0.7;
  
  highpassCurrent.type = "highpass";
  highpassCurrent.frequency.value = 5000;
  highpassCurrent.Q.value = 0.7;
  
  highpassNext.type = "highpass";
  highpassNext.frequency.value = 5000;
  highpassNext.Q.value = 0.7;
  
  // Create gain nodes for each band
  const lowCurrentGain = audioContext.createGain();
  const lowNextGain = audioContext.createGain();
  const midCurrentGain = audioContext.createGain();
  const midNextGain = audioContext.createGain();
  const highCurrentGain = audioContext.createGain();
  const highNextGain = audioContext.createGain();
  
  // Connect nodes - current source
  currentSourceNode.connect(lowpassCurrent);
  lowpassCurrent.connect(lowCurrentGain);
  
  currentSourceNode.connect(midCurrent);
  midCurrent.connect(midCurrentGain);
  
  currentSourceNode.connect(highpassCurrent);
  highpassCurrent.connect(highCurrentGain);
  
  // Connect nodes - next source
  nextSourceNode.connect(lowpassNext);
  lowpassNext.connect(lowNextGain);
  
  nextSourceNode.connect(midNext);
  midNext.connect(midNextGain);
  
  nextSourceNode.connect(highpassNext);
  highpassNext.connect(highNextGain);
  
  // Connect to destination
  const destination = audioContext.destination;
  lowCurrentGain.connect(destination);
  lowNextGain.connect(destination);
  midCurrentGain.connect(destination);
  midNextGain.connect(destination);
  highCurrentGain.connect(destination);
  highNextGain.connect(destination);
  
  // Apply different fade strategies per band
  // Low frequencies: slower fade
  applyEqualPowerCrossfade(lowCurrentGain, lowNextGain, audioContext, fadeDuration * 1.5, startTime);
  
  // Mid frequencies: standard fade
  applyZeroClickCrossfade(midCurrentGain, midNextGain, audioContext, fadeDuration, startTime, transitionSpeed);
  
  // High frequencies: faster fade
  applyPrecisionCrossfade(highCurrentGain, highNextGain, audioContext, fadeDuration * 0.7, startTime, transitionSpeed);
}

/**
 * Adaptive multi-band crossfade system that dynamically adjusts based on speed changes
 * Specifically designed to eliminate clicks during speed transitions
 */
export function applyAdaptiveMultibandCrossfade(
  currentGain: GainNode, 
  nextGain: GainNode,
  audioContext: AudioContext,
  currentBuffer: AudioBuffer | null,
  nextBuffer: AudioBuffer | null,
  fadeDuration: number,
  startTime?: number,
  transitionSpeed: number = 1.0,
  recentSpeedChange: boolean = false
): void {
  // For null buffers, fallback to basic zero-click crossfade
  if (!currentBuffer || !nextBuffer) {
    console.log("Multi-band crossfade: Missing buffer, using zero-click fallback");
    applyZeroClickCrossfade(currentGain, nextGain, audioContext, fadeDuration, startTime, transitionSpeed);
    return;
  }
  
  const now = startTime || audioContext.currentTime;
  
  try {
    // Analyze spectral content if buffers are available
    let spectralMetrics: SpectralMetrics = {
      lowFrequencyEnergy: 0.5,
      bassTransitionScore: 0.5,
      spectralFlux: 0.5,
      recommendedFadeExtension: 1.0
    };
    
    // Flag to track playback speed categories
    const isVerySlowPlayback = transitionSpeed < 0.4;
    const isSlowPlayback = transitionSpeed < 0.7;
    
    // Only analyze for slow playback where it matters most
    if (transitionSpeed < 1.0 && currentBuffer && nextBuffer) {
      const currentMetrics = analyzeSpectralContent(currentBuffer);
      const nextMetrics = analyzeSpectralContent(nextBuffer);
      
      // Use the more challenging metrics
      spectralMetrics = {
        lowFrequencyEnergy: Math.max(currentMetrics.lowFrequencyEnergy, nextMetrics.lowFrequencyEnergy),
        bassTransitionScore: Math.max(currentMetrics.bassTransitionScore, nextMetrics.bassTransitionScore),
        spectralFlux: Math.max(currentMetrics.spectralFlux, nextMetrics.spectralFlux),
        recommendedFadeExtension: Math.max(
          currentMetrics.recommendedFadeExtension,
          nextMetrics.recommendedFadeExtension
        )
      };
    }
    
    // Apply spectral fade compensation for slow speeds
    const spectralCompensatedDuration = transitionSpeed < 1.0 ?
      applySpectralFadeCompensation(fadeDuration, spectralMetrics, transitionSpeed) :
      fadeDuration;
      
    // Use much longer fades for slow, bass-heavy content
    const isBassHeavy = spectralMetrics.lowFrequencyEnergy > 0.7;
    const bassMultiplier = isBassHeavy && transitionSpeed < 0.5 ? 1.3 : 1.0;
    
    // Handle extremely slow playback with unified approach instead of multi-band
    if (transitionSpeed < 0.25) {
      console.log(`Using unified slow-rate crossfade for extreme slow speed: ${transitionSpeed}x`);
      
      // Apply bass-aware compensation
      const slowCompensatedDuration = spectralCompensatedDuration * bassMultiplier;
      
      // Use slowest fade for bass-heavy content at slow speeds
      applySlowRateCrossfade(
        currentGain, nextGain, audioContext, 
        slowCompensatedDuration * (isBassHeavy ? 2.7 : 2.5),
        now,
        transitionSpeed
      );
      return;
    }
    
    // CRITICAL FIX: Use try/catch around filter network creation to handle potential errors
    try {
      // Create band-specific processing nodes with anti-resonance design
      const filterParams = calculateAntiResonanceFilterParameters(transitionSpeed);
      
      // Create filters for each band with specific alignments
      const { 
        currentBandFilters, 
        nextBandFilters,
        currentBandGains,
        nextBandGains
      } = createAntiResonanceFilterNetwork(audioContext, filterParams);
      
      // Connect current gain to filter network
      currentGain.connect(currentBandFilters.subBass);
      currentGain.connect(currentBandFilters.lowMid);
      currentGain.connect(currentBandFilters.midHigh);
      currentGain.connect(currentBandFilters.high);
      
      // Connect next gain to filter network
      nextGain.connect(nextBandFilters.subBass);
      nextGain.connect(nextBandFilters.lowMid);
      nextGain.connect(nextBandFilters.midHigh);
      nextGain.connect(nextBandFilters.high);
      
      // Connect band gains to main output
      const destination = audioContext.destination;
      
      // Connect all band gains to destination
      Object.values(currentBandGains).forEach(gain => gain.connect(destination));
      Object.values(nextBandGains).forEach(gain => gain.connect(destination));
      
      // Calculate fade durations for each band based on spectral content
      // Lower frequencies need longer fades to avoid clicks
      // Define the fade factors
      const subBassFadeFactor = recentSpeedChange ? 3.5 : 3.0;
      const lowFadeFactor = recentSpeedChange ? 2.5 : 2.0;
      const midFadeFactor = recentSpeedChange ? 1.8 : 1.5;
      const highFadeFactor = recentSpeedChange ? 1.2 : 1.0;
      
      // Add extra padding for extreme speeds
      const speedExtraFactor = transitionSpeed >= 3.0 ? 
                             (transitionSpeed - 2.0) * 0.5 + 1.0 : 
                             transitionSpeed >= 2.0 ? 
                             (transitionSpeed - 1.0) * 0.3 + 1.0 : 
                             1.0;
      
      // Calculate band-specific fade durations
      const slowRateFactor = isVerySlowPlayback ? 2.5 : (isSlowPlayback ? 1.8 : 1.0);
      
      // Apply spectral compensation to the slowRateFactor
      const compensatedSlowRateFactor = isSlowPlayback ? 
                                      slowRateFactor * spectralMetrics.recommendedFadeExtension * bassMultiplier : 
                                      slowRateFactor;
      
      // IMPORTANT: Add small timing offsets between band crossfades to avoid 
      // simultaneous Web Audio automations which can cause glitches
      const subBassFadeDuration = spectralCompensatedDuration * subBassFadeFactor * speedExtraFactor;
      const lowFadeDuration = spectralCompensatedDuration * lowFadeFactor * speedExtraFactor;
      const midFadeDuration = spectralCompensatedDuration * midFadeFactor * speedExtraFactor;
      const highFadeDuration = spectralCompensatedDuration * highFadeFactor * speedExtraFactor;
      
      // Stagger the band start times by tiny amounts to prevent overlap issues
      const subBassStartTime = now;
      const lowStartTime = now + 0.001; // 1ms offset
      const midStartTime = now + 0.002; // 2ms offset  
      const highStartTime = now + 0.003; // 3ms offset
      
      // Apply crossfades per band with error handling for each individual band
      try {
        // Sub-bass band
        if (isVerySlowPlayback) {
          applySlowRateCrossfade(
            currentBandGains.subBass, nextBandGains.subBass, audioContext,
            subBassFadeDuration, subBassStartTime, transitionSpeed
          );
        } else {
          applySimpleSmoothCrossfade(
            currentBandGains.subBass, nextBandGains.subBass, audioContext,
            subBassFadeDuration, subBassStartTime
          );
        }
      } catch (e) {
        console.warn("Sub-bass band crossfade failed, using fallback:", e);
        // Use local implementation of safe fallback if needed
        simpleFallbackCrossfade(
          currentBandGains.subBass, nextBandGains.subBass, audioContext, subBassFadeDuration
        );
      }
      
      // Apply other bands with similar error handling
      try {
        // Low-mid band
        applySimpleSmoothCrossfade(
          currentBandGains.lowMid, nextBandGains.lowMid, audioContext,
          lowFadeDuration, lowStartTime
        );
      } catch (e) {
        console.warn("Low-mid band crossfade failed, using fallback");
        simpleFallbackCrossfade(
          currentBandGains.lowMid, nextBandGains.lowMid, audioContext, lowFadeDuration
        );
      }
      
      try {
        // Mid-high band
        applySimpleSmoothCrossfade(
          currentBandGains.midHigh, nextBandGains.midHigh, audioContext,
          midFadeDuration, midStartTime
        );
      } catch (e) {
        console.warn("Mid-high band crossfade failed, using fallback");
        simpleFallbackCrossfade(
          currentBandGains.midHigh, nextBandGains.midHigh, audioContext, midFadeDuration
        );
      }
      
      try {
        // High band
        applySimpleSmoothCrossfade(
          currentBandGains.high, nextBandGains.high, audioContext,
          highFadeDuration, highStartTime
        );
      } catch (e) {
        console.warn("High band crossfade failed, using fallback");
        simpleFallbackCrossfade(
          currentBandGains.high, nextBandGains.high, audioContext, highFadeDuration
        );
      }
      
      // Cleanup resources after the longest fade is complete
      const maxFadeDuration = Math.max(
        subBassFadeDuration, lowFadeDuration, midFadeDuration, highFadeDuration
      );
      
      setTimeout(() => {
        try {
          // Disconnect all filters and gain nodes
          Object.values(currentBandFilters).forEach(filter => {
            try { filter.disconnect(); } catch (e) { /* Ignore */ }
          });
          
          Object.values(nextBandFilters).forEach(filter => {
            try { filter.disconnect(); } catch (e) { /* Ignore */ }
          });
          
          Object.values(currentBandGains).forEach(gain => {
            try { gain.disconnect(); } catch (e) { /* Ignore */ }
          });
          
          Object.values(nextBandGains).forEach(gain => {
            try { gain.disconnect(); } catch (e) { /* Ignore */ }
          });
        } catch (e) {
          // Ignore cleanup errors
        }
      }, (maxFadeDuration + 0.15) * 1000); // Added more buffer time
    } catch (error) {
      console.warn("Filter network creation failed, using fallback crossfade:", error);
      applyZeroClickCrossfade(currentGain, nextGain, audioContext, fadeDuration, now, transitionSpeed);
    }
  } catch (e) {
    console.error("Multi-band crossfade completely failed, using emergency fallback:", e);
    simpleFallbackCrossfade(currentGain, nextGain, audioContext, fadeDuration);
  }
}

/**
 * Simple fallback crossfade function used internally when other methods fail
 * This avoids having to import from audioUtils and creates a clean dependency structure
 */
function simpleFallbackCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number = 0.02
): void {
  try {
    const now = audioContext.currentTime;
    
    // Get current gain value with safety check
    const currentValue = typeof currentGain.gain.value === 'number' ? 
                       currentGain.gain.value : 1.0;
    
    // Cancel any scheduled values
    currentGain.gain.cancelScheduledValues(now);
    nextGain.gain.cancelScheduledValues(now);
    
    // Set current values
    currentGain.gain.setValueAtTime(currentValue, now);
    nextGain.gain.setValueAtTime(0.0001, now);
    
    // Apply simple crossfade
    currentGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
    nextGain.gain.linearRampToValueAtTime(1.0, now + fadeDuration);
    
    // Ensure proper end values
    setTimeout(() => {
      try {
        currentGain.gain.setValueAtTime(0, now + fadeDuration + 0.001);
        nextGain.gain.setValueAtTime(1, now + fadeDuration + 0.001);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }, (fadeDuration + 0.005) * 1000);
  } catch (e) {
    // Last resort: immediate switch if even the fallback fails
    console.error("Emergency fallback crossfade engaged:", e);
    try {
      currentGain.gain.value = 0;
      nextGain.gain.value = 1;
    } catch (finalError) {
      // Nothing more we can do
    }
  }
}

/**
 * A simple but smooth crossfade that avoids timing issues
 * This is a simplified version that's less likely to cause timing conflicts
 */
function applySimpleSmoothCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime: number
): void {
  // Cancel any scheduled events
  currentGain.gain.cancelScheduledValues(startTime);
  nextGain.gain.cancelScheduledValues(startTime);
  
  // Set initial values
  currentGain.gain.setValueAtTime(1, startTime);
  nextGain.gain.setValueAtTime(0, startTime);
  
  // Use a simple exponential approach for fade-out
  // This creates a natural-sounding fade with minimal risk of timing issues
  const timeConstant = fadeDuration * 0.33;
  currentGain.gain.setTargetAtTime(0.001, startTime, timeConstant);
  
  // Schedule final value for fade-out
  const finalTime = startTime + fadeDuration;
  currentGain.gain.setValueAtTime(0, finalTime + 0.01);
  
  // Use linearRampToValueAtTime for fade-in which has fewer timing conflicts than curves
  nextGain.gain.linearRampToValueAtTime(1, finalTime);
}

/**
 * Create a network of filters with anti-resonance design to ensure smooth
 * frequency response at crossover points
 */
function createAntiResonanceFilterNetwork(
  audioContext: AudioContext, 
  params: AntiResonanceFilterParameters
): {
  currentBandFilters: BandFilterSet,
  nextBandFilters: BandFilterSet, 
  currentBandGains: BandGainSet, 
  nextBandGains: BandGainSet
} {
  // Create filter objects
  const currentFilters: BandFilterSet = {
    subBass: audioContext.createBiquadFilter(),
    lowMid: audioContext.createBiquadFilter(),
    midHigh: audioContext.createBiquadFilter(),
    high: audioContext.createBiquadFilter(),
  };
  
  const nextFilters: BandFilterSet = {
    subBass: audioContext.createBiquadFilter(),
    lowMid: audioContext.createBiquadFilter(),
    midHigh: audioContext.createBiquadFilter(),
    high: audioContext.createBiquadFilter(),
  };
  
  // Create gain nodes for each band
  const currentGains: BandGainSet = {
    subBass: audioContext.createGain(),
    lowMid: audioContext.createGain(),
    midHigh: audioContext.createGain(),
    high: audioContext.createGain(),
  };
  
  const nextGains: BandGainSet = {
    subBass: audioContext.createGain(),
    lowMid: audioContext.createGain(),
    midHigh: audioContext.createGain(),
    high: audioContext.createGain(),
  };
  
  // Configure low-pass filter for sub-bass (LR4-inspired alignment)
  configureFilterPair(
    currentFilters.subBass, 
    nextFilters.subBass, 
    "lowpass", 
    params.subBassCutoff,
    params.subBassQ
  );
  
  // Configure band-pass for low-mid range using overlapping filters
  // This creates a Linkwitz-Riley inspired response for smoother crossovers
  const lowMidLowpass = audioContext.createBiquadFilter();
  const nextLowMidLowpass = audioContext.createBiquadFilter();
  const lowMidHighpass = audioContext.createBiquadFilter();
  const nextLowMidHighpass = audioContext.createBiquadFilter();
  
  // Configure low-mid band with staggered crossover
  configureFilterPair(
    lowMidLowpass, 
    nextLowMidLowpass, 
    "lowpass", 
    params.lowMidHighCutoff,
    params.lowMidQ
  );
  
  configureFilterPair(
    lowMidHighpass, 
    nextLowMidHighpass, 
    "highpass", 
    params.lowMidLowCutoff,
    params.lowMidQ
  );
  
  // Configure band-pass for mid-high range using overlapping filters
  const midHighLowpass = audioContext.createBiquadFilter();
  const nextMidHighLowpass = audioContext.createBiquadFilter();
  const midHighHighpass = audioContext.createBiquadFilter();
  const nextMidHighHighpass = audioContext.createBiquadFilter();
  
  configureFilterPair(
    midHighLowpass, 
    nextMidHighLowpass, 
    "lowpass", 
    params.midHighHighCutoff,
    params.midHighQ
  );
  
  configureFilterPair(
    midHighHighpass, 
    nextMidHighHighpass, 
    "highpass", 
    params.midHighLowCutoff,
    params.midHighQ
  );
  
  // Configure high-pass filter for high band
  configureFilterPair(
    currentFilters.high, 
    nextFilters.high, 
    "highpass", 
    params.highCutoff,
    params.highQ
  );
  
  // Create the band-pass filter chains by connecting in series
  // For current source
  currentFilters.lowMid.connect(lowMidLowpass);
  lowMidLowpass.connect(lowMidHighpass);
  
  // Add allpass phase compensation filters at crossover points if needed
  if (params.usePhaseCompensation) {
    // Add phase compensation at each crossover point
    const currentLowMidPhaseCompensator = createPhaseCompensator(audioContext, 
      params.lowMidLowCutoff, params.phaseCompensationQ);
    lowMidHighpass.connect(currentLowMidPhaseCompensator);
    currentLowMidPhaseCompensator.connect(currentGains.lowMid);
    
    const currentMidHighPhaseCompensator = createPhaseCompensator(audioContext, 
      params.midHighLowCutoff, params.phaseCompensationQ);
    midHighHighpass.connect(currentMidHighPhaseCompensator);
    currentMidHighPhaseCompensator.connect(currentGains.midHigh);
    
    // Next source phase compensation
    const nextLowMidPhaseCompensator = createPhaseCompensator(audioContext, 
      params.lowMidLowCutoff, params.phaseCompensationQ);
    nextLowMidHighpass.connect(nextLowMidPhaseCompensator);
    nextLowMidPhaseCompensator.connect(nextGains.lowMid);
    
    const nextMidHighPhaseCompensator = createPhaseCompensator(audioContext, 
      params.midHighLowCutoff, params.phaseCompensationQ);
    nextMidHighHighpass.connect(nextMidHighPhaseCompensator);
    nextMidHighPhaseCompensator.connect(nextGains.midHigh);
  } else {
    // Standard connections without phase compensation
    lowMidHighpass.connect(currentGains.lowMid);
    midHighHighpass.connect(currentGains.midHigh);
    nextLowMidHighpass.connect(nextGains.lowMid);
    nextMidHighHighpass.connect(nextGains.midHigh);
  }
  
  currentFilters.midHigh.connect(midHighLowpass);
  midHighLowpass.connect(midHighHighpass);
  
  // For next source
  nextFilters.lowMid.connect(nextLowMidLowpass);
  nextLowMidLowpass.connect(nextLowMidHighpass);
  
  nextFilters.midHigh.connect(nextMidHighLowpass);
  nextMidHighLowpass.connect(nextMidHighHighpass);
  
  // Connect direct filters to their respective gain nodes
  currentFilters.subBass.connect(currentGains.subBass);
  currentFilters.high.connect(currentGains.high);
  
  nextFilters.subBass.connect(nextGains.subBass);
  nextFilters.high.connect(nextGains.high);
  
  return {
    currentBandFilters: currentFilters,
    nextBandFilters: nextFilters,
    currentBandGains: currentGains,
    nextBandGains: nextGains
  };
}

/**
 * Configure a pair of filters with identical parameters
 */
function configureFilterPair(
  filter1: BiquadFilterNode,
  filter2: BiquadFilterNode,
  type: BiquadFilterType,
  frequency: number,
  Q: number
): void {
  filter1.type = filter2.type = type;
  filter1.frequency.value = filter2.frequency.value = frequency;
  filter1.Q.value = filter2.Q.value = Q;
}

/**
 * Calculate optimal filter parameters for anti-resonance design
 * based on playback speed
 */
function calculateAntiResonanceFilterParameters(playbackSpeed: number): AntiResonanceFilterParameters {
  // Base parameters for reference (at 1.0x speed)
  const baseParams: AntiResonanceFilterParameters = {
    // Sub-bass band (low-pass)
    subBassCutoff: 80,
    subBassQ: 0.5, // Butterworth-like response
    
    // Low-mid band (band-pass with staggered crossover)
    lowMidLowCutoff: 70,  // Slight overlap with sub-bass for smoother transition
    lowMidHighCutoff: 700,
    lowMidQ: 0.5,
    
    // Mid-high band (band-pass with staggered crossover)
    midHighLowCutoff: 600, // Slight overlap with low-mid for smoother transition
    midHighHighCutoff: 4200,
    midHighQ: 0.5,
    
    // High band (high-pass)
    highCutoff: 4000,
    highQ: 0.5,
    
    // Phase compensation (new parameters)
    usePhaseCompensation: false,
    phaseCompensationQ: 0.5
  };
  
  // Fast playback (>1.0x): Adjust crossover points higher
  if (playbackSpeed > 1.0) {
    // Calculate scaling factors - more extreme at higher speeds 
    const speedFactor = Math.min(2.0, 1.0 + (playbackSpeed - 1.0) * 0.4);
    
    // For high speeds, we're less concerned with phase issues at crossover points,
    // and more concerned with preserving transients - use steeper slopes (higher Q)
    const qScaleFactor = Math.min(1.5, 1.0 + (playbackSpeed - 1.0) * 0.2);
    
    return {
      // Scale all cutoffs proportionally to preserve relative spacing
      subBassCutoff: baseParams.subBassCutoff * speedFactor,
      subBassQ: baseParams.subBassQ * qScaleFactor,
      
      lowMidLowCutoff: baseParams.lowMidLowCutoff * speedFactor,
      lowMidHighCutoff: baseParams.lowMidHighCutoff * speedFactor,
      lowMidQ: baseParams.lowMidQ * qScaleFactor,
      
      midHighLowCutoff: baseParams.midHighLowCutoff * speedFactor,
      midHighHighCutoff: baseParams.midHighHighCutoff * speedFactor,
      midHighQ: baseParams.midHighQ * qScaleFactor,
      
      highCutoff: baseParams.highCutoff * speedFactor,
      highQ: baseParams.highQ * qScaleFactor,
      
      // No phase compensation needed for fast speeds
      usePhaseCompensation: false,
      phaseCompensationQ: 0.5
    };
  } 
  // Slow playback (<1.0x): Use gentler slopes and widened overlaps
  else if (playbackSpeed < 1.0) {
    // The slower the playback, the more phase-sensitive we become
    // Use gentler slopes (lower Q) and increase band overlap
    const isVerySlowPlayback = playbackSpeed < 0.4;
    const isSlowPlayback = playbackSpeed < 0.7;
    
    // Calculate how far below normal speed we are - used for scaling
    const slownessFactor = Math.max(0.4, playbackSpeed);
    
    // Scale Q values down for slower speeds (gentler slopes)
    // More aggressive reduction at very slow speeds
    const qReductionFactor = isVerySlowPlayback ? 0.3 : 
                            (isSlowPlayback ? 0.5 : 0.7);
    
    // Calculate crossover frequency scaling
    const frequencyScaleFactor = Math.pow(slownessFactor, 0.5); // Non-linear scaling
    
    // Calculate overlap increase for slower speeds
    // Slower playback gets more overlap between bands for smoother transitions
    const overlapFactor = isVerySlowPlayback ? 1.4 : 
                         (isSlowPlayback ? 1.2 : 1.1);
    
    // Calculate scaled parameters with increased overlap
    const scaledSubBassCutoff = baseParams.subBassCutoff * frequencyScaleFactor;
    const scaledLowMidHighCutoff = baseParams.lowMidHighCutoff * frequencyScaleFactor;
    const scaledMidHighLowCutoff = baseParams.midHighLowCutoff * frequencyScaleFactor;
    const scaledHighCutoff = baseParams.highCutoff * frequencyScaleFactor;
    
    return {
      // Reduce cutoff frequencies, widen overlaps
      subBassCutoff: scaledSubBassCutoff,
      subBassQ: baseParams.subBassQ * qReductionFactor,
      
      // Lower cutoff is reduced further to increase overlap with sub-bass
      lowMidLowCutoff: scaledSubBassCutoff / overlapFactor,
      lowMidHighCutoff: scaledLowMidHighCutoff,
      lowMidQ: baseParams.lowMidQ * qReductionFactor,
      
      // Lower cutoff is reduced to increase overlap with low-mid
      midHighLowCutoff: scaledMidHighLowCutoff / overlapFactor,
      midHighHighCutoff: scaledHighCutoff * overlapFactor,
      midHighQ: baseParams.midHighQ * qReductionFactor,
      
      // High cutoff is reduced to match the mid-high upper cutoff
      highCutoff: scaledHighCutoff,
      highQ: baseParams.highQ * qReductionFactor,
      
      // Enable phase compensation for slow speeds to eliminate phase issues at crossover points
      usePhaseCompensation: true,
      phaseCompensationQ: isVerySlowPlayback ? 0.3 : 0.5
    };
  } 
  // Normal speed (1.0x): Use reference parameters with slight anti-resonance adjustments
  else {
    // For normal speed, use the Linkwitz-Riley inspired parameters with slight phase compensation
    return {
      ...baseParams,
      usePhaseCompensation: true,
      phaseCompensationQ: 0.7
    };
  }
}

/**
 * Interface defining filter parameters with anti-resonance design
 */
interface AntiResonanceFilterParameters {
  // Sub-bass band
  subBassCutoff: number;
  subBassQ: number;
  
  // Low-mid band (uses staggered crossover)
  lowMidLowCutoff: number;  // Lower crossover point
  lowMidHighCutoff: number; // Upper crossover point
  lowMidQ: number;
  
  // Mid-high band (uses staggered crossover)
  midHighLowCutoff: number;  // Lower crossover point
  midHighHighCutoff: number; // Upper crossover point
  midHighQ: number;
  
  // High band
  highCutoff: number;
  highQ: number;
  
  // Phase compensation parameters (new)
  usePhaseCompensation: boolean;
  phaseCompensationQ: number;
}

/**
 * Type for holding a set of filters for different frequency bands
 */
interface BandFilterSet {
  subBass: BiquadFilterNode;
  lowMid: BiquadFilterNode;
  midHigh: BiquadFilterNode;
  high: BiquadFilterNode;
}

/**
 * Type for holding a set of gain nodes for different frequency bands
 */
interface BandGainSet {
  subBass: GainNode;
  lowMid: GainNode;
  midHigh: GainNode;
  high: GainNode;
}

/**
 * Create a phase compensator using an allpass filter
 * Helps reduce phase distortion at crossover points
 */
function createPhaseCompensator(
  audioContext: AudioContext,
  frequency: number,
  Q: number
): BiquadFilterNode {
  const allpass = audioContext.createBiquadFilter();
  allpass.type = "allpass";
  allpass.frequency.value = frequency;
  allpass.Q.value = Q;
  return allpass;
}

/**
 * Apply an ultra-smooth crossfade with hyperbolic tangent shaping
 * for guaranteed mathematical continuity
 */
function applyUltraSmoothCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime: number,
  steps: number = 256
): void {
  try {
    // Create curves with hyperbolic tangent transitions
    const fadeOutCurve = new Float32Array(steps);
    const fadeInCurve = new Float32Array(steps);
    
    // Scaling factor for tanh steepness - lower = smoother
    const steepness = 1.7; 
    
    // Calculate minimum value based on steps
    const minValue = steps >= 1024 ? 0.0025 : steps >= 512 ? 0.002 : 0.001;
    
    // Calculate if we need dithering
    const needsDithering = steps >= 512;
    
    for (let i = 0; i < steps; i++) {
      const x = i / (steps - 1);
      
      // Use tanh to create a sigmoid curve with guaranteed smoothness
      const tanhPosition = steepness * (2 * x - 1);
      
      // Fade out: 1.0 -> minValue (never quite reaching 0)
      fadeOutCurve[i] = 0.5 * (1 - Math.tanh(tanhPosition)) * (1 - minValue) + minValue;
      
      // Fade in: minValue -> 1.0 (never starting from exact 0)
      fadeInCurve[i] = 0.5 * (1 + Math.tanh(tanhPosition)) * (1 - minValue) + minValue;
    }
    
    // Apply pre-smoothing to curve endpoints
    smoothCurveEndpoints(fadeOutCurve, fadeInCurve);
    
    // Apply dithering for higher resolution curves
    if (needsDithering) {
      applyAdaptiveDithering(fadeOutCurve, 0.0001, 'triangular');
      applyAdaptiveDithering(fadeInCurve, 0.0001, 'triangular');
    }
    
    // CRITICAL FIX: Ensure we cancel ALL previous automations with a safety margin
    // to prevent the "overlap" errors from the Web Audio API
    const safeStartTime = startTime + 0.005; // Add small safety offset
    
    currentGain.gain.cancelScheduledValues(startTime);
    nextGain.gain.cancelScheduledValues(startTime);
    
    // Set initial values explicitly to avoid jumps
    currentGain.gain.setValueAtTime(fadeOutCurve[0], safeStartTime - 0.001);
    nextGain.gain.setValueAtTime(fadeInCurve[0], safeStartTime - 0.001);
    
    // Apply the curves with adjusted timing to prevent overlap
    currentGain.gain.setValueCurveAtTime(fadeOutCurve, safeStartTime, fadeDuration);
    nextGain.gain.setValueCurveAtTime(fadeInCurve, safeStartTime, fadeDuration);
    
    // Ensure end states with carefully calculated timing
    const endTime = safeStartTime + fadeDuration + 0.005;
    
    // Use setTimeout to ensure these happen only after the curve is complete
    setTimeout(() => {
      try {
        currentGain.gain.cancelScheduledValues(endTime - 0.001);
        nextGain.gain.cancelScheduledValues(endTime - 0.001);
        currentGain.gain.setValueAtTime(0, endTime);
        nextGain.gain.setValueAtTime(1, endTime);
      } catch(e) {
        // Ignore - node might have been disconnected
      }
    }, (fadeDuration + 0.01) * 1000);
  } catch (error) {
    console.warn("Ultra-smooth crossfade failed, using basic crossfade:", error);
    // Use simplest possible crossfade as fallback
    try {
      currentGain.gain.cancelScheduledValues(startTime);
      nextGain.gain.cancelScheduledValues(startTime);
      currentGain.gain.setValueAtTime(1, startTime);
      nextGain.gain.setValueAtTime(0, startTime);
      currentGain.gain.linearRampToValueAtTime(0, startTime + fadeDuration);
      nextGain.gain.linearRampToValueAtTime(1, startTime + fadeDuration);
    } catch(e) {
      // Last resort - immediate switch
      currentGain.gain.value = 0;
      nextGain.gain.value = 1;
    }
  }
}

/**
 * Smooth the endpoints of crossfade curves to ensure absolute continuity
 */
function smoothCurveEndpoints(fadeOutCurve: Float32Array, fadeInCurve: Float32Array): void {
  const steps = fadeOutCurve.length;
  if (steps < 4) return; // Need at least 4 points for smoothing
  
  // Apply a gentle cubic spline smoothing at the endpoints
  // This ensures continuous second derivatives at critical points
  
  // Smooth the start of the fade-out (first 2-3% of points)
  const startSmoothCount = Math.floor(steps * 0.03);
  for (let i = 0; i < startSmoothCount; i++) {
    const t = i / startSmoothCount;
    // Cubic ease-in curve
    const smoothFactor = t * t * (3 - 2 * t);
    // Blend between original value and first non-smoothed value
    fadeOutCurve[i] = fadeOutCurve[i] * smoothFactor + fadeOutCurve[0] * (1 - smoothFactor);
  }
  
  // Smooth the end of the fade-out (last 2-3% of points)
  const endSmoothCount = Math.floor(steps * 0.03);
  for (let i = 0; i < endSmoothCount; i++) {
    const idx = steps - 1 - i;
    const t = i / endSmoothCount;
    const smoothFactor = t * t * (3 - 2 * t);
    fadeOutCurve[idx] = fadeOutCurve[idx] * smoothFactor + fadeOutCurve[steps - 1] * (1 - smoothFactor);
  }
  
  // Apply the same smoothing to fade-in curve
  for (let i = 0; i < startSmoothCount; i++) {
    const t = i / startSmoothCount;
    const smoothFactor = t * t * (3 - 2 * t);
    fadeInCurve[i] = fadeInCurve[i] * smoothFactor + fadeInCurve[0] * (1 - smoothFactor);
  }
  
  for (let i = 0; i < endSmoothCount; i++) {
    const idx = steps - 1 - i;
    const t = i / endSmoothCount;
    const smoothFactor = t * t * (3 - 2 * t);
    fadeInCurve[idx] = fadeInCurve[idx] * smoothFactor + fadeInCurve[steps - 1] * (1 - smoothFactor);
  }
}

/**
 * Apply a specialized crossfade optimized for extremely slow playback rates
 * This is specifically designed to eliminate clicks when time-stretching is aggressive
 */
export function applySlowRateCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime?: number,
  playbackRate: number = 0.5
): void {
  try {
    const now = startTime || audioContext.currentTime;
    
    // Add extra safety margin to prevent automation conflicts
    const safetyMargin = 0.0025; // 2.5ms safety margin
    const safeNow = now + safetyMargin;
    
    // Scale fade delay portion based on playback rate - slower rates need more separation
    const fadeInDelayPortion = playbackRate < 0.25 ? 0.25 : 
                              playbackRate < 0.5 ? 0.2 : 0.15;
    
    // Create curves for slow playback
    const curveResolution = playbackRate < 0.25 ? 2048 : 1024;
    const minValue = playbackRate < 0.25 ? 0.007 : 0.005;
    
    // Generate dithered fade curves
    const { fadeOut: fadeOutCurve, fadeIn: fadeInCurve } = createDitheredFadeCurves(
      curveResolution, playbackRate, minValue
    );
    
    // Calculate safe fade in timing with extra padding between events
    const fadeInStartTime = safeNow + (fadeDuration * fadeInDelayPortion) + safetyMargin;
    const adjustedFadeInDuration = fadeDuration * (1 - fadeInDelayPortion) - safetyMargin * 2;
    
    // CRITICAL FIX: Cancel all scheduled values with ample buffer time
    currentGain.gain.cancelScheduledValues(safeNow - 0.01);
    nextGain.gain.cancelScheduledValues(fadeInStartTime - 0.01);
    
    // Set initial values explicitly
    currentGain.gain.setValueAtTime(1, safeNow - 0.001);
    nextGain.gain.setValueAtTime(0, fadeInStartTime - 0.001);
    
    // Apply the curves with retry logic
    try {
      // Try to apply high-resolution curves first
      currentGain.gain.setValueCurveAtTime(fadeOutCurve, safeNow, fadeDuration);
      nextGain.gain.setValueCurveAtTime(fadeInCurve, fadeInStartTime, adjustedFadeInDuration);
    } catch (e) {
      // Fall back to standard resolution curves
      console.warn("High-res curves failed, using simpler crossfade", e);
      
      // Use simple linear ramps as fallback
      currentGain.gain.cancelScheduledValues(safeNow);
      nextGain.gain.cancelScheduledValues(fadeInStartTime);
      
      currentGain.gain.setValueAtTime(1, safeNow);
      currentGain.gain.linearRampToValueAtTime(0, safeNow + fadeDuration);
      
      nextGain.gain.setValueAtTime(0, fadeInStartTime);
      nextGain.gain.linearRampToValueAtTime(1, fadeInStartTime + adjustedFadeInDuration);
    }
    
    // Ensure final states are correctly set with longer safety margin
    const safetyMarginEnd = playbackRate < 0.25 ? 0.08 : 
                           playbackRate < 0.5 ? 0.06 : 0.04;
    
    const finalCleanupTime = Math.max(
      safeNow + fadeDuration + safetyMarginEnd,
      fadeInStartTime + adjustedFadeInDuration + safetyMarginEnd
    );
    
    // Schedule final cleanup to ensure proper gain values
    setTimeout(() => {
      try {
        currentGain.gain.setValueAtTime(0, finalCleanupTime);
        nextGain.gain.setValueAtTime(1, finalCleanupTime);
      } catch (e) {
        // Ignore errors if nodes have been disconnected
      }
    }, (finalCleanupTime - now) * 1000 + 10); // Convert to milliseconds + 10ms safety
  } catch (error) {
    console.error("Error in applySlowRateCrossfade, using emergency fallback:", error);
    
    // Emergency fallback - immediate transition with minimal fade
    try {
      const now = startTime || audioContext.currentTime;
      currentGain.gain.cancelScheduledValues(now);
      nextGain.gain.cancelScheduledValues(now);
      
      currentGain.gain.setValueAtTime(currentGain.gain.value || 1, now);
      nextGain.gain.setValueAtTime(0, now);
      
      currentGain.gain.linearRampToValueAtTime(0, now + 0.05);
      nextGain.gain.linearRampToValueAtTime(1, now + 0.1);
    } catch (e) {
      // Last resort - direct value setting
      try {
        currentGain.gain.value = 0;
        nextGain.gain.value = 1;
      } catch (finalError) {
        // Nothing more we can do
        console.error("Complete crossfade failure:", finalError);
      }
    }
  }
}

/**
 * Calculate phase correlation between end of first buffer and start of second buffer
 * @param buffer1 First buffer in the sequence
 * @param buffer2 Second buffer in the sequence
 * @returns Correlation factor between -1 (completely out of phase) and 1 (perfectly in phase)
 */
function calculatePhaseCorrelation(buffer1: AudioBuffer, buffer2: AudioBuffer): number {
  // Use first channel for analysis
  const channel1 = buffer1.getChannelData(0);
  const channel2 = buffer2.getChannelData(0);
  
  // Get end of first buffer and start of second buffer
  // Use a sample window of about 20ms (or less if buffers are too small)
  const sampleRate = buffer1.sampleRate;
  const windowSize = Math.min(
    Math.floor(sampleRate * 0.02), // 20ms
    Math.floor(channel1.length * 0.1), // 10% of buffer1
    Math.floor(channel2.length * 0.1)  // 10% of buffer2
  );
  
  // Ensure we have enough samples for meaningful analysis
  if (windowSize < 32) {
    return 0; // Return neutral correlation if buffers are too small
  }
  
  // Get end of buffer1
  const endSamples = channel1.slice(channel1.length - windowSize);
  
  // Get start of buffer2
  const startSamples = channel2.slice(0, windowSize);
  
  // Calculate correlation
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < windowSize; i++) {
    dotProduct += endSamples[i] * startSamples[i];
    mag1 += endSamples[i] * endSamples[i];
    mag2 += startSamples[i] * startSamples[i];
  }
  
  // Normalize correlation coefficient to range [-1, 1]
  const magnitudeProduct = Math.sqrt(mag1 * mag2);
  
  // Avoid division by zero
  if (magnitudeProduct < 0.000001) {
    return 0;
  }
  
  const correlation = dotProduct / magnitudeProduct;
  
  // Ensure result is within valid range
  return Math.max(-1, Math.min(1, correlation));
}

/**
 * Apply a spectral-aware crossfade that shapes frequency transitions
 * for maximum smoothness based on psychoacoustic principles
 */
function applySpectrallySmoothCrossfade(
  currentGain: GainNode,
  nextGain: GainNode,
  audioContext: AudioContext,
  fadeDuration: number,
  startTime: number,
  transitionSpeed: number = 1.0
): void {
  // For very high speeds, use a perceptually-tuned crossfade curve
  // that especially minimizes high-frequency discontinuities
  const now = startTime;
  
  // Increase curve resolution for slow speeds
  const curvePoints = transitionSpeed < 0.25 ? 2048 :  // Ultra-high resolution for extremely slow 
                     transitionSpeed < 0.5 ? 1024 :    // Very high resolution for very slow
                     transitionSpeed < 0.7 ? 768 :     // High resolution for moderately slow
                     transitionSpeed > 3.0 ? 512 :     // Medium-high for fast
                     transitionSpeed > 2.0 ? 384 :     // Medium for moderately fast
                     transitionSpeed > 1.0 ? 256 : 384; // Medium for normal speeds
                     
  const outCurve = new Float32Array(curvePoints);
  const inCurve = new Float32Array(curvePoints);
  
  // Non-zero minimum to prevent complete silence (discontinuity)
  // Increased minimum value for slower speeds to prevent quantization artifacts
  const minValue = transitionSpeed < 0.25 ? 0.006 :   // Much higher min value for extremely slow
                  transitionSpeed < 0.5 ? 0.004 :     // Higher min value for very slow
                  transitionSpeed < 0.7 ? 0.003 :     // Moderate min value for somewhat slow
                  transitionSpeed > 3.0 ? 0.003 : 0.002;  // Standard min values
  
  // Generate base curves for the transition
  for (let i = 0; i < curvePoints; i++) {
    const t = i / (curvePoints - 1);
    
    if (transitionSpeed > 2.5) {
      // For extreme speeds, use a specialized perceptual curve
      // with a modified erf (error function) shape
      // This curve has a subtle early rolloff and extended tail
      
      // Approximate erf function using tanh approximation
      const erfApprox = (x: number) => Math.tanh(1.4 * x);
      
      // OUT: Modified erf for smooth fade-out
      outCurve[i] = (1 - erfApprox(3 * t - 1.4)) * (1 - minValue) + minValue;
      
      // IN: Complementary modified erf for fade-in
      inCurve[i] = erfApprox(3 * t - 1.6) * (1 - minValue) + minValue;
    } else if (transitionSpeed < 0.5) {
      // For very slow speeds, use higher-order polynomial blending for extreme smoothness
      const smoothX = t*t*t*t * (t * (t * (35 - 84*t) + 70) - 20); // 7th order for extremely smooth
      
      // OUT: Ultra-smooth fade-out with higher minimum value
      outCurve[i] = (1 - smoothX) * (1 - minValue) + minValue;
      
      // IN: Ultra-smooth fade-in with complementary curve
      inCurve[i] = smoothX * (1 - minValue) + minValue;
    } else {
      // For moderate speeds, use a modified cosine function
      // which is perceptually balanced
      outCurve[i] = Math.cos(t * Math.PI / 2) * (1 - minValue) + minValue;
      inCurve[i] = Math.sin(t * Math.PI / 2) * (1 - minValue) + minValue;
    }
  }
  
  // Apply additional endpoint smoothing for guaranteed continuity
  smoothCurveEndpoints(outCurve, inCurve);
  
  // Apply dithering based on playback speed
  // This is critical for slow speeds where quantization errors become very audible
  if (transitionSpeed < 0.25) {
    // Heavy perceptually shaped dithering for extremely slow speeds
    applyAdaptiveDithering(outCurve, 0.00025, 'shaped');
    applyAdaptiveDithering(inCurve, 0.00025, 'shaped');
  } else if (transitionSpeed < 0.5) {
    // Moderate shaped dithering for very slow speeds
    applyAdaptiveDithering(outCurve, 0.0002, 'shaped');
    applyAdaptiveDithering(inCurve, 0.0002, 'shaped');
  } else if (transitionSpeed < 1.0) {
    // Light triangular dithering for moderately slow speeds
    applyAdaptiveDithering(outCurve, 0.00015, 'triangular');
    applyAdaptiveDithering(inCurve, 0.00015, 'triangular');
  }
  // No explicit dithering for normal/fast speeds where it's less critical
  
  // Set initial values to avoid discontinuities
  currentGain.gain.cancelScheduledValues(now);
  nextGain.gain.cancelScheduledValues(now);
  currentGain.gain.setValueAtTime(outCurve[0], now);
  nextGain.gain.setValueAtTime(inCurve[0], now);
  
  // Apply the curves
  currentGain.gain.setValueCurveAtTime(outCurve, now, fadeDuration);
  nextGain.gain.setValueCurveAtTime(inCurve, now, fadeDuration);
  
  // Ensure end states
  const endTime = now + fadeDuration + 0.005;
  currentGain.gain.setValueAtTime(0, endTime);
  nextGain.gain.setValueAtTime(1, endTime);
}

/**
 * Generate dithering noise with specified characteristics
 * This creates noise that helps break up quantization artifacts in quiet passages
 * 
 * @param length Number of samples to generate
 * @param amplitude Maximum amplitude of dither noise
 * @param type Type of dither to generate (triangular is typically best quality)
 * @returns Float32Array containing dither noise
 */
function generateDither(
  length: number, 
  amplitude: number = 0.0001, 
  type: 'triangular' | 'rectangular' | 'shaped' = 'triangular'
): Float32Array {
  const dither = new Float32Array(length);
  
  switch (type) {
    case 'triangular':
      // Triangular PDF dithering (sum of two uniform distributions)
      // This provides better noise shaping than simple rectangular dither
      for (let i = 0; i < length; i++) {
        dither[i] = amplitude * ((Math.random() + Math.random()) - 1);
      }
      break;
      
    case 'rectangular':
      // Rectangular PDF dithering (simplest form, but less effective)
      for (let i = 0; i < length; i++) {
        dither[i] = amplitude * (Math.random() * 2 - 1);
      }
      break;
      
    case 'shaped':
      // Psychoacoustically shaped dither - more noise where ears are less sensitive
      // First generate basis triangular dither
      for (let i = 0; i < length; i++) {
        dither[i] = amplitude * ((Math.random() + Math.random()) - 1);
      }
      
      // Apply a subtle high-pass characteristic to the dither
      // This works by borrowing slightly from neighboring samples to create
      // a first-order high-pass filter effect, concentrating dither energy
      // in less audible high frequencies
      const shapedDither = new Float32Array(length);
      shapedDither[0] = dither[0];
      
      for (let i = 1; i < length; i++) {
        // Simple noise shaping filter: y[n] = x[n] - 0.5*x[n-1]
        shapedDither[i] = dither[i] - 0.5 * dither[i-1];
      }
      
      // Normalize shaped dither to stay within original amplitude bounds
      const maxAmp = shapedDither.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
      const scaleFactor = amplitude / maxAmp;
      
      for (let i = 0; i < length; i++) {
        dither[i] = shapedDither[i] * scaleFactor;
      }
      break;
  }
  
  return dither;
}

/**
 * Apply dithering to a gain curve with adaptively increased amplitude in low-level regions
 * 
 * @param curve The gain curve to apply dithering to
 * @param baseAmplitude The basic dithering amplitude
 * @param type Type of dithering to use
 */
function applyAdaptiveDithering(
  curve: Float32Array, 
  baseAmplitude: number = 0.0001,
  type: 'triangular' | 'rectangular' | 'shaped' = 'triangular'
): void {
  const length = curve.length;
  const dither = generateDither(length, baseAmplitude, type);
  
  // Apply dither with adaptive scaling - more dither at lower levels
  for (let i = 0; i < length; i++) {
    // Scale dither inversely with signal level
    // Stronger dither at low levels, weaker dither at high levels
    const level = curve[i];
    
    // Apply more dither below -60dB (0.001) where quantization is most problematic
    const ditherAmplitude = level < 0.001 ? 2.0 : 
                           level < 0.01 ? 1.5 :
                           level < 0.1 ? 1.0 : 0.5;
    
    curve[i] += dither[i] * ditherAmplitude;
  }
}

/**
 * Create ultra-dithered fade curves optimized for slow playback rates
 * This uses heavy dithering to eliminate all quantization artifacts
 */
function createDitheredFadeCurves(
  steps: number = 1024, 
  playbackRate: number = 1.0,
  minValue: number = 0.002
): { fadeOut: Float32Array, fadeIn: Float32Array } {
  // Calculate appropriate dither amplitude based on playback rate
  // Slower rates need stronger dithering
  const ditherAmplitude = playbackRate < 0.25 ? 0.00025 : 
                         playbackRate < 0.5 ? 0.00020 : 
                         playbackRate < 0.75 ? 0.00015 : 0.0001;
  
  const ditherType = playbackRate < 0.5 ? 'shaped' : 'triangular';
                        
  const fadeOut = new Float32Array(steps);
  const fadeIn = new Float32Array(steps);
  
  // Create base curves first
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    
    // Use 7th-order polynomial for extra smooth transitions
    const smoothT = t*t*t*t * (t * (t * (35 - 84*t) + 70) - 20);
    
    // Create curves that never reach absolute zero
    fadeOut[i] = (1 - smoothT) * (1 - minValue) + minValue;
    fadeIn[i] = smoothT * (1 - minValue) + minValue;
  }
  
  // Apply smoothing to critical endpoints
  smoothCurveEndpoints(fadeOut, fadeIn);
  
  // Apply heavy dithering for very slow playback
  if (playbackRate < 0.5) {
    applyAdaptiveDithering(fadeOut, ditherAmplitude, ditherType);
    applyAdaptiveDithering(fadeIn, ditherAmplitude, ditherType);
  }
  // Apply lighter dithering for normal speeds
  else {
    applyAdaptiveDithering(fadeOut, ditherAmplitude, 'triangular');
    applyAdaptiveDithering(fadeIn, ditherAmplitude, 'triangular');
  }
  
  return { fadeOut, fadeIn };
}

/**
 * Spectral content analysis for fade duration adjustment
 * Analyzes audio buffers to determine optimal fade characteristics
 */

/**
 * Analyze audio buffer for spectral content to determine optimal fade characteristics
 * Returns metrics about frequency bands that impact crossfade quality
 * 
 * @param buffer Audio buffer to analyze
 * @param sampleCount Number of samples to analyze (from both start and end)
 * @returns Spectral metrics used for fade time adjustments
 */
function analyzeSpectralContent(
  buffer: AudioBuffer | null,
  sampleCount: number = 4096
): SpectralMetrics {
  // Default metrics for empty or null buffers
  const defaultMetrics: SpectralMetrics = {
    lowFrequencyEnergy: 0.5,     // Medium energy by default
    bassTransitionScore: 0.5,    // Medium transition complexity
    spectralFlux: 0.5,           // Medium spectral change
    recommendedFadeExtension: 1.0 // No extension by default
  };
  
  if (!buffer || buffer.length === 0) {
    return defaultMetrics;
  }
  
  // Get samples from the first channel
  const data = buffer.getChannelData(0);
  
  // Limit sample count to buffer size
  sampleCount = Math.min(sampleCount, Math.floor(data.length / 2));
  if (sampleCount < 256) {
    return defaultMetrics; // Not enough samples for meaningful analysis
  }
  
  // Create arrays for start and end samples (where crossfades will happen)
  const startSamples = new Float32Array(sampleCount);
  const endSamples = new Float32Array(sampleCount);
  
  // Copy samples from start and end of buffer
  for (let i = 0; i < sampleCount; i++) {
    startSamples[i] = data[i];
    endSamples[i] = data[data.length - sampleCount + i];
  }
  
  // Calculate RMS energy in different frequency bands
  // This is a simplified spectral analysis without FFT
  
  // For low frequencies: apply a crude low-pass filter by averaging
  // (This approximates energy below ~100Hz)
  const lowPassWindowSize = 32;
  let lowFreqEnergyStart = 0;
  let lowFreqEnergyEnd = 0;
  
  for (let i = lowPassWindowSize; i < sampleCount; i++) {
    // Calculate moving average for crude low-pass filter
    let startSum = 0;
    let endSum = 0;
    
    for (let j = 0; j < lowPassWindowSize; j++) {
      startSum += startSamples[i - j];
      endSum += endSamples[i - j];
    }
    
    const startAvg = startSum / lowPassWindowSize;
    const endAvg = endSum / lowPassWindowSize;
    
    // Accumulate energy (squared amplitude)
    lowFreqEnergyStart += startAvg * startAvg;
    lowFreqEnergyEnd += endAvg * endAvg;
  }
  
  // Normalize low frequency energy
  lowFreqEnergyStart = Math.sqrt(lowFreqEnergyStart / (sampleCount - lowPassWindowSize));
  lowFreqEnergyEnd = Math.sqrt(lowFreqEnergyEnd / (sampleCount - lowPassWindowSize));
  
  // Calculate overall RMS for normalization
  let totalEnergyStart = 0;
  let totalEnergyEnd = 0;
  
  for (let i = 0; i < sampleCount; i++) {
    totalEnergyStart += startSamples[i] * startSamples[i];
    totalEnergyEnd += endSamples[i] * endSamples[i];
  }
  
  totalEnergyStart = Math.sqrt(totalEnergyStart / sampleCount);
  totalEnergyEnd = Math.sqrt(totalEnergyEnd / sampleCount);
  
  // Calculate normalized low frequency ratio
  // (This indicates how bass-heavy the content is)
  const lowFreqRatioStart = totalEnergyStart > 0 ? 
                          lowFreqEnergyStart / totalEnergyStart : 0;
  const lowFreqRatioEnd = totalEnergyEnd > 0 ? 
                        lowFreqEnergyEnd / totalEnergyEnd : 0;
  
  // Calculate spectral flux (change in spectrum over time)
  // Higher values mean more complex spectral transitions
  let spectralDifference = 0;
  const frameSize = 128;
  const framesToAnalyze = Math.floor(sampleCount / frameSize) - 1;
  
  for (let frame = 0; frame < framesToAnalyze; frame++) {
    let currentFrameEnergy = 0;
    let nextFrameEnergy = 0;
    
    for (let i = 0; i < frameSize; i++) {
      const idx = frame * frameSize + i;
      currentFrameEnergy += endSamples[idx] * endSamples[idx];
      nextFrameEnergy += startSamples[idx] * startSamples[idx];
    }
    
    // Accumulate absolute difference between frame energies
    spectralDifference += Math.abs(
      Math.sqrt(nextFrameEnergy) - Math.sqrt(currentFrameEnergy)
    );
  }
  
  // Normalize spectral flux
  const spectralFlux = framesToAnalyze > 0 ? 
                      Math.min(1.0, spectralDifference / framesToAnalyze) : 0.5;
  
  // Combined bass energy (average of start and end)
  const lowFrequencyEnergy = (lowFreqRatioStart + lowFreqRatioEnd) / 2;
  
  // Bass transition score - difference between start and end bass content
  // Higher values indicate more dramatic changes in bass content
  const bassTransitionScore = Math.abs(lowFreqRatioEnd - lowFreqRatioStart);
  
  // Calculate recommended fade extension based on metrics
  // More extension for higher bass energy and more complex transitions
  const recommendedFadeExtension = calculateFadeTimeCompensation(
    lowFrequencyEnergy, bassTransitionScore, spectralFlux
  );
  
  return {
    lowFrequencyEnergy,
    bassTransitionScore,
    spectralFlux,
    recommendedFadeExtension
  };
}

/**
 * Calculate appropriate fade time compensation factor based on spectral metrics
 */
function calculateFadeTimeCompensation(
  lowFreqEnergy: number,
  bassTransition: number,
  spectralFlux: number
): number {
  // Base extension starts at 1.0 (no extension)
  let extension = 1.0;
  
  // Low frequency energy has most significant impact
  // More bass = longer fades needed
  if (lowFreqEnergy > 0.8) {
    extension += 0.5; // Major extension for very bass-heavy content
  } else if (lowFreqEnergy > 0.6) {
    extension += 0.3; // Moderate extension for bass-heavy content
  } else if (lowFreqEnergy > 0.4) {
    extension += 0.15; // Slight extension for moderate bass content
  }
  
  // Bass transition (change in bass energy) also impacts fade needs
  // More transition complexity = longer fades
  if (bassTransition > 0.6) {
    extension += 0.3; // Significant extension for dramatic bass changes
  } else if (bassTransition > 0.3) {
    extension += 0.15; // Moderate extension
  }
  
  // Spectral flux (overall spectral change rate) has a smaller effect
  if (spectralFlux > 0.7) {
    extension += 0.2; // Noticeable extension for complex spectral changes
  } else if (spectralFlux > 0.4) {
    extension += 0.1; // Minor extension
  }
  
  return extension;
}

/**
 * Interface for spectral metrics used in fade time compensation
 */
interface SpectralMetrics {
  // Ratio of low frequency to total energy (0-1)
  // Higher values indicate more bass-heavy content
  lowFrequencyEnergy: number;
  
  // Measure of how much bass content changes (0-1)
  // Higher values indicate more complex bass transitions
  bassTransitionScore: number;
  
  // Measure of spectral change over time (0-1)
  // Higher values indicate more variation in spectral content
  spectralFlux: number;
  
  // Recommended factor to extend fade duration
  // Based on the other metrics (1.0 = no extension)
  recommendedFadeExtension: number;
}

/**
 * Apply fade time compensation based on spectral content and playback speed
 * Returns adjusted fade duration
 */
function applySpectralFadeCompensation(
  baseFadeDuration: number,
  metrics: SpectralMetrics,
  playbackSpeed: number = 1.0
): number {
  // Base extension from spectral metrics
  let speedFactor = 1.0;
  
  // Apply more aggressive compensation for slower speeds
  if (playbackSpeed < 0.25) {
    speedFactor = 2.0; // Extreme compensation for very slow speeds
  } else if (playbackSpeed < 0.5) {
    speedFactor = 1.5; // Significant compensation for slow speeds
  } else if (playbackSpeed < 0.75) {
    speedFactor = 1.2; // Moderate compensation for somewhat slow speeds
  }
  
  // Calculate total compensation
  // More compensation for slow playback of bass-heavy content
  const totalCompensation = metrics.recommendedFadeExtension * speedFactor;
  
  // Apply compensation, ensuring reasonable bounds
  const maxCompensation = 3.0; // Cap at 3x original duration
  const compensation = Math.min(maxCompensation, totalCompensation);
  
  return baseFadeDuration * compensation;
}

/**
 * Helper function to safely schedule automation events without overlapping
 * This helps prevent the "overlaps automation event" errors
 */
function safelyScheduleAutomation(
  param: AudioParam,
  method: string,
  startTime: number,
  ...args: any[]
): boolean {
  try {
    // First cancel any scheduled values
    param.cancelScheduledValues(startTime - 0.001);
    
    // Apply the requested method
    switch (method) {
      case 'setValueAtTime':
        param.setValueAtTime(args[0], startTime);
        break;
      case 'linearRampToValueAtTime':
        param.linearRampToValueAtTime(args[0], startTime);
        break;
      case 'exponentialRampToValueAtTime':
        // Ensure value is not zero for exponential ramps
        param.exponentialRampToValueAtTime(Math.max(0.0001, args[0]), startTime);
        break;
      case 'setTargetAtTime':
        param.setTargetAtTime(args[0], startTime, args[1]);
        break;
      case 'setValueCurveAtTime':
        param.setValueCurveAtTime(args[0], startTime, args[1]);
        break;
      default:
        console.warn(`Unknown automation method: ${method}`);
        return false;
    }
    return true;
  } catch (error) {
    console.warn(`Failed to schedule ${method} at time ${startTime}:`, error);
    return false;
  }
}
