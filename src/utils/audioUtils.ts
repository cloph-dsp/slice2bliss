/**
 * Utilities for audio processing and visualization
 */

/**
 * Generate waveform data from an AudioBuffer
 * @param buffer The audio buffer to analyze
 * @param numPoints Number of data points to generate
 * @returns Array of normalized amplitude values (0-1)
 */
export function generateWaveformData(buffer: AudioBuffer, numPoints: number = 100): number[] {
  const channelData = buffer.getChannelData(0); // Use first channel
  const blockSize = Math.floor(channelData.length / numPoints);
  const waveform: number[] = [];
  
  for (let i = 0; i < numPoints; i++) {
    const startIndex = i * blockSize;
    const endIndex = Math.min(startIndex + blockSize, channelData.length);
    
    // Find max amplitude in this block
    let max = 0;
    for (let j = startIndex; j < endIndex; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    
    waveform.push(max);
  }
  
  return waveform;
}

/**
 * Generate a color gradient for waveform visualization based on frequency content
 * @param buffer Audio buffer to analyze
 * @returns Color string (hex or rgba)
 */
export function getAudioColorTone(buffer: AudioBuffer): string {
  // Simple implementation - could be enhanced with real frequency analysis
  // Analyze amplitude characteristics to guess audio type
  const channelData = buffer.getChannelData(0);
  
  // Calculate RMS (root mean square) amplitude
  let sum = 0;
  for (let i = 0; i < channelData.length; i++) {
    sum += channelData[i] * channelData[i];
  }
  const rms = Math.sqrt(sum / channelData.length);
  
  // Calculate peak-to-RMS ratio (crest factor)
  let peak = 0;
  for (let i = 0; i < channelData.length; i++) {
    const abs = Math.abs(channelData[i]);
    if (abs > peak) peak = abs;
  }
  const crestFactor = peak / rms;
  
  // Use characteristics to determine color - now all in yellow shades
  // Higher crest factor = more transients/percussive = brighter yellows
  // Lower crest factor = more sustained/tonal = deeper yellows
  
  if (crestFactor > 4) {
    // Very percussive sounds (drums, etc)
    return '#fef08a'; // yellow-200
  } else if (crestFactor > 3) {
    // Moderately percussive
    return '#fde047'; // yellow-300
  } else if (crestFactor > 2) {
    // Balanced sounds
    return '#facc15'; // yellow-400
  } else {
    // Sustained sounds (pads, etc)
    return '#eab308'; // yellow-500
  }
}

/**
 * Apply fade in/out to avoid clicks
 * @param buffer Audio buffer to modify
 * @param fadeInTime Fade in time in seconds
 * @param fadeOutTime Fade out time in seconds
 * @returns Modified buffer with fades applied
 */
export function applyFades(
  buffer: AudioBuffer, 
  fadeInTime: number = 0.01, 
  fadeOutTime: number = 0.01
): AudioBuffer {
  // Convert fade times to samples
  const fadeInSamples = Math.floor(fadeInTime * buffer.sampleRate);
  const fadeOutSamples = Math.floor(fadeOutTime * buffer.sampleRate);
  
  // Apply fades to each channel
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channelData = buffer.getChannelData(c);
    
    // Apply fade in
    for (let i = 0; i < fadeInSamples && i < channelData.length; i++) {
      const gain = i / fadeInSamples;
      channelData[i] *= gain;
    }
    
    // Apply fade out
    const fadeOutStart = channelData.length - fadeOutSamples;
    for (let i = fadeOutStart; i < channelData.length; i++) {
      const gain = (channelData.length - i) / fadeOutSamples;
      channelData[i] *= gain;
    }
  }
  
  return buffer;
}

/**
 * Calculate interval based on BPM, division, and transition playback rate
 */
export function calculateInterval(bpm: number, division: string, transitionPlaybackRate: number): number {
  const beatsPerSecond = bpm / 60;
  let divisionValue = 1;

  switch (division) {
    case '1/4':
      divisionValue = 1;
      break;
    case '1/8':
      divisionValue = 0.5;
      break;
    case '1/16':
      divisionValue = 0.25;
      break;
    case '1/32':
      divisionValue = 0.125;
      break;
    default:
      divisionValue = 0.25;
  }

  return (divisionValue / beatsPerSecond) * 1000 / transitionPlaybackRate;
}

/**
 * Safely disconnect and clean up audio nodes with zero-click prevention
 * @param nodes Array of AudioNodes to disconnect
 * @param audioContext AudioContext for scheduling
 * @param fadeOutDuration Optional fade duration before disconnect
 */
export function safeDisconnectNodes(
  nodes: AudioNode[], 
  audioContext: AudioContext,
  fadeOutDuration: number = 0.01
): void {
  const now = audioContext.currentTime;
  
  nodes.forEach(node => {
    try {
      // For GainNodes, fade out before disconnecting
      if (node instanceof GainNode) {
        const currentGain = node.gain.value;
        
        // Only apply fade if not already at zero
        if (currentGain > 0.001) {
          // Cancel any scheduled changes
          node.gain.cancelScheduledValues(now);
          
          // Apply tiny fade to prevent clicks
          node.gain.setValueAtTime(currentGain, now);
          node.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutDuration);
          
          // Schedule disconnect after fade completes
          setTimeout(() => {
            try { node.disconnect(); } catch (e) { /* ignore */ }
          }, fadeOutDuration * 1000 + 10);
          return;
        }
      }

      // For non-gain nodes or zero-gain nodes, disconnect immediately
      node.disconnect();
    } catch (e) {
      // Ignore errors from nodes that are already disconnected
    }
  });
}

/**
 * Remove DC offset from audio buffer to prevent low-frequency clicks
 * @param buffer AudioBuffer to process
 * @returns New AudioBuffer with DC offset removed
 */
export function removeDCOffset(
  buffer: AudioBuffer, 
  audioContext: AudioContext
): AudioBuffer {
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const outputBuffer = audioContext.createBuffer(
    numberOfChannels, 
    length, 
    buffer.sampleRate
  );
  
  // Process each channel
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = outputBuffer.getChannelData(channel);
    
    // Calculate DC offset (average of all samples)
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += inputData[i];
    }
    const dcOffset = sum / length;
    
    // Apply high-pass filter to remove DC offset
    // Use 1-pole filter coefficient for gentle high-pass
    const filterCoeff = 0.995;
    let lastOutput = 0;
    
    for (let i = 0; i < length; i++) {
      // Apply filter: y[n] = filterCoeff * (y[n-1] + x[n] - x[n-1])
      lastOutput = filterCoeff * (lastOutput + inputData[i] - dcOffset);
      outputData[i] = lastOutput;
    }
  }
  
  return outputBuffer;
}

/**
 * Apply a window function to an audio buffer to eliminate edge discontinuities
 * @param buffer AudioBuffer to process
 * @param windowSize Size of the window in samples (applied at both ends)
 * @param windowType Type of window function to apply
 * @returns New AudioBuffer with window function applied
 */
export function applyWindowFunction(
  buffer: AudioBuffer,
  audioContext: AudioContext,
  windowSize: number = 128,
  windowType: 'hann' | 'hamming' | 'blackman' = 'hann'
): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  
  // Create window function
  const window = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i++) {
    const x = i / (windowSize - 1);
    
    switch (windowType) {
      case 'hann':
        window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * x));
        break;
      case 'hamming':
        window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * x);
        break;
      case 'blackman':
        window[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * x) + 0.08 * Math.cos(4 * Math.PI * x);
        break;
    }
  }
  
  // Create output buffer
  const output = audioContext.createBuffer(
    numChannels,
    length,
    buffer.sampleRate
  );
  
  // Apply window to each channel
  for (let channel = 0; channel < numChannels; channel++) {
    const inputData = buffer.getChannelData(channel);
    const outputData = output.getChannelData(channel);
    
    // Copy data
    for (let i = 0; i < length; i++) {
      outputData[i] = inputData[i];
    }
    
    // Apply window at start
    const startWindow = Math.min(windowSize, Math.floor(length * 0.1));
    for (let i = 0; i < startWindow; i++) {
      outputData[i] *= window[Math.floor(i * windowSize / startWindow)];
    }
    
    // Apply window at end
    const endWindow = Math.min(windowSize, Math.floor(length * 0.1));
    for (let i = 0; i < endWindow; i++) {
      const pos = length - endWindow + i;
      outputData[pos] *= window[Math.floor((windowSize - 1) * (1 - i / endWindow))];
    }
  }
  
  return output;
}

/**
 * Prepare audio buffer for zero-click playback with enhanced zero-crossing alignment
 */
export function prepareBufferForPlayback(
  buffer: AudioBuffer,
  audioContext: AudioContext
): AudioBuffer {
  // Validate input to prevent errors
  if (!buffer || buffer.length === 0) {
    console.warn('Invalid buffer passed to prepareBufferForPlayback');
    return buffer; // Return original as fallback
  }

  try {
    // Create a new buffer with the same parameters
    const outputBuffer = audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    // Process each channel
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = outputBuffer.getChannelData(channel);
      
      // Copy data
      for (let i = 0; i < buffer.length; i++) {
        outputData[i] = inputData[i];
      }
      
      // Find optimal fade boundaries using zero-crossing detection
      const fadeInEnd = findOptimalZeroCrossingPoint(outputData, 0, Math.min(buffer.sampleRate * 0.003, buffer.length * 0.01));
      const fadeOutStart = findOptimalZeroCrossingPoint(outputData, buffer.length - Math.min(buffer.sampleRate * 0.005, buffer.length * 0.01), buffer.length - 1);
      
      // Apply precise fade-in with zero-crossing alignment
      for (let i = 0; i < fadeInEnd; i++) {
        // Enhanced curve: mix of equal-power and cubic for smoother transition
        const t = i / fadeInEnd;
        const gain = Math.sin(t * Math.PI/2) * (0.5 + 0.5 * t * t);
        outputData[i] *= gain;
      }
      
      // Apply precise fade-out with zero-crossing alignment
      const fadeOutLength = buffer.length - fadeOutStart;
      for (let i = 0; i < fadeOutLength; i++) {
        const pos = fadeOutStart + i;
        if (pos >= 0 && pos < buffer.length) { // Safety check
          const t = (fadeOutLength - i) / fadeOutLength;
          const gain = Math.sin(t * Math.PI/2) * (0.5 + 0.5 * t * t);
          outputData[pos] *= gain;
        }
      }
    }
    
    return outputBuffer;
  } catch (error) {
    console.error("Error in prepareBufferForPlayback:", error);
    // Return the original buffer as fallback if anything fails
    return buffer;
  }
}

/**
 * Find optimal zero-crossing point for fade transitions
 * Uses advanced algorithm to find the best point for clean transitions
 */
function findOptimalZeroCrossingPoint(data: Float32Array, start: number, end: number): number {
  // Find all zero crossings in the range
  const zeroCrossings: number[] = [];
  for (let i = Math.max(1, Math.floor(start)); i < Math.min(data.length, Math.ceil(end)); i++) {
    if ((data[i] >= 0 && data[i-1] < 0) || (data[i] <= 0 && data[i-1] > 0)) {
      // Calculate precise fractional crossing point using linear interpolation
      const t = data[i-1] / (data[i-1] - data[i]);
      const exactCrossing = i - 1 + t;
      zeroCrossings.push(i);
    }
  }
  
  if (zeroCrossings.length === 0) {
    // No zero crossings found, return middle point
    return Math.floor((start + end) / 2);
  }
  
  // Find zero crossing with lowest slope (rate of change)
  // This gives the "cleanest" crossing with minimal energy
  let bestCrossing = zeroCrossings[0];
  let lowestSlope = Infinity;
  
  for (const crossing of zeroCrossings) {
    if (crossing > 0 && crossing < data.length - 1) {
      const slope = Math.abs(data[crossing + 1] - data[crossing - 1]) / 2;
      if (slope < lowestSlope) {
        lowestSlope = slope;
        bestCrossing = crossing;
      }
    }
  }
  
  return bestCrossing;
}

/**
 * Ensure audio context is running (crucial for mobile)
 */
export async function ensureAudioContextRunning(context: AudioContext): Promise<boolean> {
  if (context.state === 'running') return true;
  
  try {
    if (context.state === 'suspended') {
      await context.resume();
      console.log("Audio context resumed successfully");
      return await new Promise(resolve => {
        setTimeout(() => {
          resolve(context.state === 'running');
        }, 0);
      });
    } else if (context.state === 'closed') {
      console.error("Audio context is closed and cannot be resumed");
      return false;
    }
  } catch (error) {
    console.error("Error resuming audio context:", error);
    return false;
  }
  
  return context.state === 'running';
}

/**
 * Ensure audio node belongs to the given context
 * @param node AudioNode to verify
 * @param context Expected AudioContext
 * @returns true if node belongs to context, false otherwise
 */
export function verifyAudioNodeContext(
  node: AudioNode, 
  context: AudioContext
): boolean {
  // Modern browsers expose the context property on AudioNodes
  if ('context' in node) {
    return (node as any).context === context;
  }
  
  // Fallback method: try a test connection
  try {
    const testNode = context.createGain();
    (node as AudioNode).connect(testNode);
    (node as AudioNode).disconnect(testNode);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'InvalidAccessError') {
      return false;
    }
    // Other error, not related to context mismatch
    return true;
  }
}

/**
 * Apply a safe crossfade between two gain nodes with error handling
 * This is a utility function for when direct crossfade methods fail
 */
export function applySafeFallbackCrossfade(
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
