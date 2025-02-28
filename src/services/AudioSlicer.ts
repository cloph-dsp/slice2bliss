import { v4 as uuidv4 } from 'uuid';
import { AudioSegment, AudioSegmentMetadata, AudioFormat } from '../types/audio';
import { detectAudioFormat, estimateBitDepth } from '../utils/audioFormatDetector';

export interface SliceOptions {
  bpm: number;
  division: string;
  totalSlices?: number;
  preserveTail?: boolean;
  sampleAccurate?: boolean;
}

export class AudioSlicer {
  private audioContext: AudioContext;
  
  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }
  
  /**
   * Slice audio buffer into segments based on musical timing
   */
  public sliceAudio(
    audioBuffer: AudioBuffer, 
    file: File,
    options: SliceOptions
  ): AudioSegment[] {
    const { bpm, division, totalSlices = 16, preserveTail = true, sampleAccurate = true } = options;
    
    // Calculate slice duration based on BPM and division
    const beatsPerSecond = bpm / 60;
    let divisionValue = this.getDivisionValue(division);
    const sliceDuration = (divisionValue / beatsPerSecond);
    
    // Detect audio format
    const format = detectAudioFormat(file);
    
    // Estimate bit depth
    const bitDepth = estimateBitDepth(audioBuffer);
    
    const segments: AudioSegment[] = [];
    const timestamp = Date.now();
    
    for (let i = 0; i < totalSlices; i++) {
      const startTime = i * sliceDuration;
      
      // Break if we've reached the end of the audio
      if (startTime >= audioBuffer.duration) {
        break;
      }
      
      // Calculate end time, respecting the audio buffer's duration
      const endTime = Math.min((i + 1) * sliceDuration, audioBuffer.duration);
      
      // Create a slice with sample-accurate boundaries
      const slice = this.createSlice(
        audioBuffer, 
        startTime, 
        endTime, 
        sampleAccurate
      );
      
      // Create metadata for the slice
      const metadata: AudioSegmentMetadata = {
        startTime,
        duration: endTime - startTime,
        format: format,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        bitDepth,
        timestamp,
        sliceIndex: i
      };
      
      // Create a unique ID for the segment
      const id = uuidv4();
      
      segments.push({
        id,
        buffer: slice,
        metadata
      });

      console.log(`Slice ${i}: startTime=${startTime}, endTime=${endTime}, sliceDuration=${sliceDuration}`);
    }
    
    console.log(`Created ${segments.length} audio segments with sample-accurate boundaries`);
    return segments;
  }
  
  /**
   * Create a precise slice of audio with sample-accurate boundaries
   */
  private createSlice(
    sourceBuffer: AudioBuffer, 
    startTime: number, 
    endTime: number,
    sampleAccurate: boolean
  ): AudioBuffer {
    // Calculate sample positions
    const sampleRate = sourceBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.ceil(endTime * sampleRate);
    const sliceLength = endSample - startSample;
    
    // Create a new buffer for the slice
    const sliceBuffer = this.audioContext.createBuffer(
      sourceBuffer.numberOfChannels,
      sliceLength,
      sampleRate
    );
    
    // Copy data from the source buffer to the slice buffer for each channel
    for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
      // Get the entire channel data
      const channelData = new Float32Array(sourceBuffer.length);
      sourceBuffer.copyFromChannel(channelData, channel);
      
      // Extract the slice data
      const sliceData = channelData.subarray(startSample, endSample);
      
      // Copy to the slice buffer
      sliceBuffer.copyToChannel(sliceData, channel);
      
      // Apply windowing if sample-accurate is enabled (to prevent clicks)
      if (sampleAccurate) {
        this.applyFades(sliceBuffer, channel, 0.005); // 5ms fade
      }
    }
    
    return sliceBuffer;
  }
  
  /**
   * Apply short fades to prevent clicks at segment boundaries
   */
  private applyFades(buffer: AudioBuffer, channel: number, fadeDuration: number): void {
    const data = new Float32Array(buffer.length);
    buffer.copyFromChannel(data, channel);
    
    const fadeSamples = Math.floor(fadeDuration * buffer.sampleRate);
    
    // Apply fade in
    for (let i = 0; i < Math.min(fadeSamples, data.length / 2); i++) {
      const gain = i / fadeSamples;
      data[i] *= gain;
    }
    
    // Apply fade out
    for (let i = 0; i < Math.min(fadeSamples, data.length / 2); i++) {
      const gain = i / fadeSamples;
      data[data.length - 1 - i] *= gain;
    }
    
    buffer.copyToChannel(data, channel);
  }
  
  /**
   * Convert division string to numerical value
   */
  private getDivisionValue(division: string): number {
    switch (division) {
      case '1/4': return 1;
      case '1/8': return 0.5;
      case '1/16': return 0.25;
      case '1/32': return 0.125;
      default: return 0.25; // Default to 1/16
    }
  }
}
