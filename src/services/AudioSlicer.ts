import { v4 as uuidv4 } from 'uuid';
import { AudioSegment, SliceOptions, AudioSegmentMetadata } from '../types/audio';
import { detectAudioFormat, estimateBitDepth } from '../utils/audioFormatDetector';

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
    let divisionValue = 1;
    
    switch (options.division) {
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
        divisionValue = 0.25; // default to 1/16
    }
    
    // Calculate time per slice in seconds
    const timePerSlice = divisionValue / beatsPerSecond;
    console.log(`Slicing audio with BPM: ${options.bpm}, division: ${options.division}, timePerSlice: ${timePerSlice}s`);
    
    // Calculate total number of slices
    // If totalSlices is specified, use that instead of calculating from duration
    const numberOfSlices = options.totalSlices || Math.floor(buffer.duration / timePerSlice);
    console.log(`Total number of slices: ${numberOfSlices} (duration: ${buffer.duration}s)`);
    
    // Detect format and technical details
    const format = detectAudioFormat(file);
    const bitDepth = estimateBitDepth(buffer);
    
    // Create segments
    for (let i = 0; i < numberOfSlices; i++) {
      // Calculate start and end times in seconds
      const startTime = i * timePerSlice;
      let endTime = (i + 1) * timePerSlice;
      
      // Don't exceed buffer duration
      if (endTime > buffer.duration) {
        endTime = buffer.duration;
      }
      
      // If preserveTail is true, include the last partial slice
      if (i === numberOfSlices - 1 && options.preserveTail && endTime < buffer.duration) {
        endTime = buffer.duration;
      }
      
      // Create a new buffer for this segment
      const duration = endTime - startTime;
      
      // Use sample-accurate slicing if enabled
      let segmentBuffer: AudioBuffer;
      if (options.sampleAccurate) {
        // Convert time to samples
        const startSample = Math.floor(startTime * buffer.sampleRate);
        const endSample = Math.floor(endTime * buffer.sampleRate);
        const sampleLength = endSample - startSample;
        
        segmentBuffer = this.audioContext.createBuffer(
          buffer.numberOfChannels,
          sampleLength,
          buffer.sampleRate
        );
        
        // Copy data from original buffer to segment buffer
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const channelData = new Float32Array(sampleLength);
          
          // Get original channel data
          const originalData = new Float32Array(buffer.length);
          buffer.copyFromChannel(originalData, channel);
          
          // Copy segment data with proper sample alignment
          for (let i = 0; i < sampleLength; i++) {
            channelData[i] = originalData[startSample + i];
          }
          
          segmentBuffer.copyToChannel(channelData, channel);
        }
      } else {
        // Use time-based slicing (less accurate but possibly more efficient)
        segmentBuffer = this.audioContext.createBuffer(
          buffer.numberOfChannels,
          Math.floor(duration * buffer.sampleRate),
          buffer.sampleRate
        );
        
        // Copy data from original buffer to segment buffer
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const channelData = new Float32Array(segmentBuffer.length);
          
          // Get original channel data
          const originalData = new Float32Array(buffer.length);
          buffer.copyFromChannel(originalData, channel);
          
          // Copy segment data
          const startSample = Math.floor(startTime * buffer.sampleRate);
          for (let i = 0; i < segmentBuffer.length; i++) {
            if (startSample + i < originalData.length) {
              channelData[i] = originalData[startSample + i];
            }
          }
          
          segmentBuffer.copyToChannel(channelData, channel);
        }
      }
      
      // Create metadata
      const metadata: AudioSegmentMetadata = {
        startTime,
        duration,
        format,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        bitDepth,
        timestamp: Date.now(),
        sliceIndex: i
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
}
