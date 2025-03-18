import { v4 as uuidv4 } from 'uuid';

export interface TimeStretchOptions {
  timeRatio: number; // Speed factor (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
  preservePitch: boolean; // Whether to keep original pitch
  quality: 'low' | 'medium' | 'high'; // Quality setting
}

/**
 * Service for time-stretching audio without changing pitch
 */
export class TimeStretcher {
  private audioContext: AudioContext;
  private grainSize: number;
  
  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.grainSize = 2048; // Default grain size, can be adjusted based on quality
  }
  
  /**
   * Apply time-stretching to an AudioBuffer without changing pitch
   */
  public processBuffer(
    buffer: AudioBuffer, 
    options: TimeStretchOptions
  ): Promise<AudioBuffer> {
    // Adjust grain size based on quality
    if (options.quality === 'low') {
      this.grainSize = 1024;
    } else if (options.quality === 'medium') {
      this.grainSize = 2048;
    } else {
      this.grainSize = 4096;
    }
    
    // If we're not preserving pitch or timeRatio is 1.0, return original buffer
    if (!options.preservePitch || Math.abs(options.timeRatio - 1.0) < 0.01) {
      return Promise.resolve(buffer);
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Calculate size of output buffer
        const outputLength = Math.floor(buffer.length / options.timeRatio);
        const outputBuffer = this.audioContext.createBuffer(
          buffer.numberOfChannels,
          outputLength,
          buffer.sampleRate
        );
        
        // Process each channel
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          this.stretchChannel(
            buffer.getChannelData(channel), 
            outputBuffer.getChannelData(channel), 
            options.timeRatio
          );
        }
        
        resolve(outputBuffer);
      } catch (error) {
        console.error("Time-stretching failed:", error);
        reject(error);
      }
    });
  }
  
  /**
   * Create a time-stretched version of an audio buffer for real-time playback
   * This returns source nodes that can be connected to the audio graph
   */
  public createTimeStretchedSource(
    buffer: AudioBuffer,
    timeRatio: number,
    preservePitch: boolean = true,
    quality: 'low' | 'medium' | 'high' = 'medium'
  ): AudioBufferSourceNode {
    // Always use the class's audioContext, not a new one
    const source = this.audioContext.createBufferSource();
    
    // For extremely slow rates, pre-process the buffer to minimize artifacts
    let processedBuffer = buffer;
    if (timeRatio < 0.3 && preservePitch) {
      // For very slow playback, apply additional anti-click processing
      processedBuffer = this.applyExtremeTimeStretchProcessing(buffer, timeRatio);
      console.log(`Applied extreme time-stretch processing for ratio: ${timeRatio}`);
    }
    
    source.buffer = processedBuffer;
    
    // Apply playback rate
    source.playbackRate.value = timeRatio;
    
    if (preservePitch) {
      // Use preservesPitch property if available
      if ('preservesPitch' in source) {
        (source as any).preservesPitch = true;
      }
    }
    
    // Add a unique ID for tracking
    (source as any).uniqueId = crypto.randomUUID ? crypto.randomUUID() : `ts-${Date.now()}`;
    
    return source;
  }
  
  /**
   * Process buffer for extreme time-stretching (very slow playback)
   * This applies specialized pre-processing to minimize artifacts
   */
  private applyExtremeTimeStretchProcessing(buffer: AudioBuffer, timeRatio: number): AudioBuffer {
    // Create a new buffer with the same properties
    const processedBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    
    // Process each channel
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = processedBuffer.getChannelData(channel);
      
      // Copy the data
      for (let i = 0; i < buffer.length; i++) {
        outputData[i] = inputData[i];
      }
      
      // Apply adaptive low-pass filtering for smoother transitions
      // Use more intense filtering for slower speeds
      const cutoffFactor = Math.max(0.1, Math.min(0.95, timeRatio * 2));
      this.applyAdaptiveLowPassFilter(outputData, cutoffFactor);
      
      // Apply zero-crossing aligned fade edges
      const edgeFadeSamples = Math.min(
        Math.floor(buffer.sampleRate * 0.08), // 80ms maximum (increased for slow speeds)
        Math.floor(buffer.length * 0.15)  // or 15% of total length
      );
      
      // Find optimal fade points using zero crossings for smoother transitions
      const fadeInEnd = this.findOptimalTransitionPoint(outputData, 0, edgeFadeSamples);
      const fadeOutStart = this.findOptimalTransitionPoint(
        outputData, 
        buffer.length - edgeFadeSamples,
        buffer.length - 1
      );
      
      // Apply smooth beginning with zero-crossing alignment
      for (let i = 0; i < fadeInEnd; i++) {
        // Use a combination of cubic and sine for ultra-smooth fade
        const factor = i / fadeInEnd;
        const gain = Math.pow(factor, 2) * (0.5 + 0.5 * Math.sin(factor * Math.PI - Math.PI/2));
        outputData[i] *= gain;
      }
      
      // Apply smooth ending with zero-crossing alignment
      for (let i = 0; i < buffer.length - fadeOutStart; i++) {
        const position = fadeOutStart + i;
        const factor = (buffer.length - fadeOutStart - i) / (buffer.length - fadeOutStart);
        // Use a combination of cubic and sine for ultra-smooth fade
        const gain = Math.pow(factor, 2) * (0.5 + 0.5 * Math.sin(factor * Math.PI - Math.PI/2));
        outputData[position] *= gain;
      }
    }
    
    return processedBuffer;
  }
  
  /**
   * Apply an adaptive low-pass filter with zero-phase distortion
   * @param data The audio data to filter
   * @param cutoffFactor Relative cutoff (0-1), lower values = more filtering
   */
  private applyAdaptiveLowPassFilter(data: Float32Array, cutoffFactor: number): void {
    // First forward pass
    const alpha = Math.max(0.01, Math.min(0.99, cutoffFactor));
    let lastSample = 0;
    const tempData = new Float32Array(data.length);
    
    // Forward pass with damping factor for low frequencies
    for (let i = 0; i < data.length; i++) {
      lastSample = alpha * data[i] + (1 - alpha) * lastSample;
      tempData[i] = lastSample;
    }
    
    // Reverse pass to eliminate phase distortion
    lastSample = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      lastSample = alpha * tempData[i] + (1 - alpha) * lastSample;
      data[i] = lastSample;
    }
  }
  
  /**
   * Find optimal transition point for fades using zero crossing and energy analysis
   */
  private findOptimalTransitionPoint(data: Float32Array, start: number, end: number): number {
    const window = 8; // Window size for energy calculation
    let bestPosition = start;
    let minEnergy = Infinity;
    
    // Find position with minimum energy around zero crossings
    for (let i = Math.max(window, start); i <= end - window; i++) {
      // Check for zero crossing
      if ((data[i] >= 0 && data[i-1] < 0) || (data[i] <= 0 && data[i-1] > 0)) {
        // Calculate energy in a small window around this point
        let energy = 0;
        for (let j = -window; j <= window; j++) {
          energy += data[i+j] * data[i+j];
        }
        
        if (energy < minEnergy) {
          minEnergy = energy;
          bestPosition = i;
        }
      }
    }
    
    return bestPosition;
  }
  
  /**
   * Apply a simple low-pass filter to smooth out audio data
   * @param data The audio data to filter
   * @param cutoff Relative cutoff (0-1), lower values = more filtering
   */
  private applyLowPassFilter(data: Float32Array, cutoff: number): void {
    // Simple one-pole low-pass filter
    const alpha = Math.max(0.01, Math.min(0.99, cutoff));
    let lastSample = 0;
    
    for (let i = 0; i < data.length; i++) {
      // y[n] = α * x[n] + (1 - α) * y[n-1]
      lastSample = alpha * data[i] + (1 - alpha) * lastSample;
      data[i] = lastSample;
    }
  }
  
  /**
   * Apply anti-click measures during buffer switching in time stretcher
   * Call this method when changing buffers or playback rates
   */
  protected applyAntiClickMeasures(
    oldSource: AudioBufferSourceNode | null,
    newSource: AudioBufferSourceNode,
    context: AudioContext
  ): void {
    const now = context.currentTime;
    
    if (oldSource) {
      // Create temporary gain node for the old source with enhanced fading
      const oldGain = context.createGain();
      oldSource.disconnect();
      oldSource.connect(oldGain);
      oldGain.connect(context.destination);
      
      // Multi-stage fade out for smoother transition
      oldGain.gain.setValueAtTime(1.0, now);
      oldGain.gain.setValueCurveAtTime(
        new Float32Array([1.0, 0.9, 0.7, 0.5, 0.3, 0.1, 0.05, 0.01, 0.001]), 
        now, 
        0.08
      );
      
      // Stop and clean up after fade
      setTimeout(() => {
        try { 
          oldSource.stop(); 
          oldGain.disconnect();
        } catch(e) { /* ignore */ }
      }, 100); // Extended timeout for smoother transition
    }
    
    // Start new source with multi-stage fade in
    const newGain = context.createGain();
    newSource.disconnect();
    newSource.connect(newGain);
    newGain.connect(context.destination);
    
    // Apply precise multi-stage fade in
    newGain.gain.setValueAtTime(0.0001, now);
    newGain.gain.setValueCurveAtTime(
      new Float32Array([0.0001, 0.01, 0.05, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0]), 
      now, 
      0.08
    );
    
    // Remove temporary gain node after fade
    setTimeout(() => {
      try {
        newSource.disconnect();
        newSource.connect(context.destination);
        newGain.disconnect();
      } catch(e) { /* ignore */ }
    }, 100); // Extended for smoother transition
  }
  
  /**
   * Process a single channel using overlap-add (simplified version)
   * This is a basic implementation of granular time-stretching
   */
  private stretchChannel(
    inputData: Float32Array,
    outputData: Float32Array,
    timeRatio: number
  ): void {
    const grainSize = this.grainSize;
    const overlap = 0.5; // 50% overlap for grains
    const hopSize = Math.floor(grainSize * (1 - overlap));
    const window = this.createHannWindow(grainSize);
    
    // Clear output buffer
    outputData.fill(0);
    
    // Calculate step size based on time ratio
    const stretchedHopSize = Math.floor(hopSize / timeRatio);
    
    // Process in grains
    for (let grainIndex = 0; grainIndex < inputData.length - grainSize; grainIndex += hopSize) {
      const outputIndex = Math.floor(grainIndex / timeRatio);
      
      // Skip if we're past the output buffer
      if (outputIndex >= outputData.length - grainSize) {
        break;
      }
      
      // Apply window and add to output
      for (let i = 0; i < grainSize; i++) {
        if (grainIndex + i < inputData.length && outputIndex + i < outputData.length) {
          outputData[outputIndex + i] += inputData[grainIndex + i] * window[i];
        }
      }
    }
    
    // Normalize output to prevent clipping
    const maxValue = this.findMaxAbsValue(outputData);
    if (maxValue > 0.95) {
      const normFactor = 0.95 / maxValue;
      for (let i = 0; i < outputData.length; i++) {
        outputData[i] *= normFactor;
      }
    }
  }
  
  /**
   * Create a Hann window function for smooth grain transitions
   */
  private createHannWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / size));
    }
    return window;
  }
  
  /**
   * Find the maximum absolute value in an array
   */
  private findMaxAbsValue(arr: Float32Array): number {
    let max = 0;
    for (let i = 0; i < arr.length; i++) {
      max = Math.max(max, Math.abs(arr[i]));
    }
    return max;
  }
}

// Create and export a singleton instance
let timeStretcher: TimeStretcher | null = null;

export function getTimeStretcher(audioContext: AudioContext): TimeStretcher {
  if (!timeStretcher || !(timeStretcher instanceof TimeStretcher)) {
    timeStretcher = new TimeStretcher(audioContext);
  }
  return timeStretcher;
}
