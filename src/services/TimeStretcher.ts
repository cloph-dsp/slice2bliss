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
    // Simple source for when pitch preservation isn't needed or ratio is ~1.0
    if (!preservePitch || Math.abs(timeRatio - 1.0) < 0.01) {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = timeRatio;
      return source;
    }
    
    // For more advanced stretching, we'll use a granular approach with overlapping grains
    // Create the source node that will be returned
    const source = this.audioContext.createBufferSource();
    
    // Adjust grain parameters based on quality
    let grainSize = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
    let overlap = quality === 'high' ? 0.75 : quality === 'medium' ? 0.5 : 0.25;
    
    // This implementation uses the Web Audio API's built-in playbackRate with 
    // detune compensation - a simplified approach for demonstration.
    // For production, consider implementing a true granular synthesis or phase vocoder.
    source.buffer = buffer;
    source.playbackRate.value = timeRatio;
    
    // Apply pitch compensation using detune
    // detune is in cents (100 cents = 1 semitone)
    const pitchCompensation = -1200 * Math.log2(timeRatio);
    source.detune.value = pitchCompensation;
    
    // For a real implementation, we'd create a custom AudioWorklet 
    // that performs proper granular time-stretching here.
    
    // Add uniqueID for tracking this source
    (source as any).uniqueId = uuidv4();
    
    return source;
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