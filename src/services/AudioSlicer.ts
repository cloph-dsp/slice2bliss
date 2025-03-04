import { v4 as uuidv4 } from 'uuid';
import { AudioSegment, SliceOptions, AudioSegmentMetadata } from '../types/audio';
import { detectAudioFormat, estimateBitDepth } from '../utils/audioFormatDetector';
import { applyFades } from '../utils/audioUtils';
import { calculateSliceOverlap, getDivisionValue, findNearestZeroCrossing } from '../utils/crossfadeUtils';

/**
 * Service for slicing audio into segments based on BPM and time divisions
 */
export class AudioSlicer {
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }
  
  /**
   * Slice audio buffer into segments based on BPM and division
   */
  public sliceAudio(
    buffer: AudioBuffer, 
    file: File, 
    options: SliceOptions = { bpm: 120, division: '1/16' }
  ): AudioSegment[] {
    const segments: AudioSegment[] = [];
    
    // Calculate time for each slice based on BPM and division
    const beatsPerSecond = options.bpm / 60;
    const divisionValue = getDivisionValue(options.division);
    
    // Calculate time per slice in seconds
    const timePerSlice = divisionValue / beatsPerSecond;
    console.log(`Slicing audio with BPM: ${options.bpm}, division: ${options.division}, timePerSlice: ${timePerSlice}s`);
    
    // Calculate overlap duration to ensure smooth transitions
    const overlapDuration = calculateSliceOverlap(options.bpm, options.division);
    
    // Calculate total number of slices
    // If totalSlices is specified, use that instead of calculating from duration
    const numberOfSlices = options.totalSlices || Math.floor(buffer.duration / timePerSlice);
    console.log(`Total number of slices: ${numberOfSlices} (duration: ${buffer.duration}s)`);
    console.log(`Using overlap of ${overlapDuration}s for smooth transitions`);
    
    // Detect format and technical details
    const format = detectAudioFormat(file);
    const bitDepth = estimateBitDepth(buffer);
    
    // Create segments
    for (let i = 0; i < numberOfSlices; i++) {
      // Calculate start and end times in seconds
      const sliceStartTime = i * timePerSlice;
      const sliceEndTime = (i + 1) * timePerSlice;
      
      // Calculate extended boundaries with overlap
      let startTime = Math.max(0, sliceStartTime - overlapDuration);
      let endTime = Math.min(buffer.duration, sliceEndTime + overlapDuration);
      
      // Special case for first slice - only extend to the right
      if (i === 0) {
        startTime = 0;
      }
      
      // Special case for last slice - extend to the end of the buffer
      if (i === numberOfSlices - 1 && options.preserveTail) {
        endTime = buffer.duration;
      }
      
      // Calculate actual duration of this slice including overlaps
      const duration = endTime - startTime;
      
      // Create a new buffer for this segment
      const segmentBuffer = this.createSegmentBuffer(buffer, startTime, endTime, options.sampleAccurate || false);
      
      // Store the original slice boundaries for precise playback timing
      const originalBoundaries = {
        sliceStartTime,
        sliceEndTime,
        originalDuration: sliceEndTime - sliceStartTime
      };
      
      // Create metadata
      const metadata: AudioSegmentMetadata = {
        startTime,
        duration,
        format,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        bitDepth,
        timestamp: Date.now(),
        sliceIndex: i,
        // Add original boundaries info to metadata
        originalBoundaries,
        // Add overlap info
        overlapDuration
      };
      
      // Create segment
      const segment: AudioSegment = {
        id: uuidv4(),
        buffer: segmentBuffer,
        metadata
      };
      
      segments.push(segment);
    }
    
    return segments;
  }
  
  /**
   * Create a segment buffer with precise start and end times
   * Enhanced with zero-crossing detection and anti-click measures
   */
  private createSegmentBuffer(
    sourceBuffer: AudioBuffer, 
    startTime: number, 
    endTime: number, 
    sampleAccurate: boolean
  ): AudioBuffer {
    // Find optimal zero-crossing points to minimize discontinuities
    let adjustedStartTime = startTime;
    let adjustedEndTime = endTime;
    
    if (sampleAccurate) {
      // Extended window size for better zero-crossing detection (5ms)
      const zeroWindowSize = Math.floor(sourceBuffer.sampleRate * 0.005);
      
      // Find ideal starting point
      adjustedStartTime = findNearestZeroCrossing(
        sourceBuffer,
        startTime,
        zeroWindowSize,
        0
      );
      
      // Find ideal ending point
      adjustedEndTime = findNearestZeroCrossing(
        sourceBuffer,
        endTime,
        zeroWindowSize,
        0
      );
      
      // Verify adjustments are reasonable
      if (adjustedEndTime - adjustedStartTime < 0.9 * (endTime - startTime)) {
        adjustedStartTime = startTime;
        adjustedEndTime = endTime;
      }
    }
    
    // Calculate the required buffer size
    const duration = adjustedEndTime - adjustedStartTime;
    const sampleLength = Math.floor(duration * sourceBuffer.sampleRate);
    
    // Create a new buffer for the segment
    const segmentBuffer = this.audioContext.createBuffer(
      sourceBuffer.numberOfChannels,
      sampleLength,
      sourceBuffer.sampleRate
    );
    
    // Copy data using the appropriate technique
    if (sampleAccurate) {
      const startSample = Math.floor(adjustedStartTime * sourceBuffer.sampleRate);
      
      for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
        const channelData = new Float32Array(sampleLength);
        const originalData = new Float32Array(sourceBuffer.length);
        sourceBuffer.copyFromChannel(originalData, channel);
        
        // Apply boundary anti-click measures on every channel
        
        // 1. Copy main data with sample-accurate alignment
        for (let i = 0; i < sampleLength; i++) {
          if (startSample + i < originalData.length) {
            channelData[i] = originalData[startSample + i];
          }
        }
        
        // 2. Advanced DC offset correction
        const fadeLength = Math.min(500, Math.floor(sampleLength * 0.1));
        let dcOffset = 0;
        
        // Calculate average DC offset across the whole segment for accuracy
        for (let i = 0; i < sampleLength; i++) {
          dcOffset += channelData[i];
        }
        dcOffset /= sampleLength;
        
        // Only correct if significant offset exists
        if (Math.abs(dcOffset) > 0.0005) {
          // Apply graduated DC correction to avoid discontinuities
          for (let i = 0; i < fadeLength; i++) {
            const factor = i / fadeLength;
            
            // Fade in correction at start
            channelData[i] -= dcOffset * factor;
            
            // Fade out correction at end if enough samples
            if (i < fadeLength && i < sampleLength - fadeLength) {
              const endIndex = sampleLength - i - 1;
              const endFactor = i / fadeLength;
              channelData[endIndex] -= dcOffset * endFactor;
            }
          }
          
          // Full correction in the middle section
          for (let i = fadeLength; i < sampleLength - fadeLength; i++) {
            channelData[i] -= dcOffset;
          }
        }
        
        // 3. Apply gentle envelope shaping at boundaries (anti-click insurance)
        const edgeSamples = Math.min(32, Math.floor(sampleLength * 0.01));
        
        // Apply micro-fades at start and end to eliminate any potential clicks
        for (let i = 0; i < edgeSamples; i++) {
          const factor = i / edgeSamples;
          const smoothFactor = factor * factor * (3 - 2 * factor); // Improved smoothstep
          
          // Start (fade in)
          channelData[i] *= smoothFactor;
          
          // End (fade out) if we have enough samples
          if (sampleLength > edgeSamples * 2) {
            const endIndex = sampleLength - i - 1;
            const endFactor = i / edgeSamples;
            const endSmoothFactor = endFactor * endFactor * (3 - 2 * endFactor);
            channelData[endIndex] *= endSmoothFactor;
          }
        }
        
        segmentBuffer.copyToChannel(channelData, channel);
      }
    } else {
      // Optimized version for non-sample-accurate mode
      const startSample = Math.floor(adjustedStartTime * sourceBuffer.sampleRate);
      
      for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
        const channelData = new Float32Array(sampleLength);
        const originalData = new Float32Array(sourceBuffer.length);
        sourceBuffer.copyFromChannel(originalData, channel);
        
        // Copy main data
        for (let i = 0; i < sampleLength; i++) {
          if (startSample + i < originalData.length) {
            channelData[i] = originalData[startSample + i];
          }
        }
        
        // Apply minimal boundary protection to prevent clicks
        const edgeSamples = Math.min(16, Math.floor(sampleLength * 0.005));
        
        // Only apply if we have enough samples
        if (sampleLength > edgeSamples * 2) {
          // Apply very small micro-fades at edges
          for (let i = 0; i < edgeSamples; i++) {
            const factor = i / edgeSamples;
            channelData[i] *= factor;
            channelData[sampleLength - i - 1] *= factor;
          }
        }
        
        segmentBuffer.copyToChannel(channelData, channel);
      }
    }
    
    return segmentBuffer;
  }
}
