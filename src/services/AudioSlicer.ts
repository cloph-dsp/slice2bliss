import { v4 as uuidv4 } from 'uuid';
import { AudioSegment, AudioSegmentMetadata } from '../types/audio';
import { detectAudioFormat, estimateBitDepth } from '../utils/audioFormatDetector';
import { applyFades } from '../utils/audioUtils';

export interface SliceOptions {
  bpm: number;
  division: string;
  totalSlices?: number;
  sampleAccurate?: boolean;
  preserveTail?: boolean;
}

export class AudioSlicer {
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

    /**
   * Slice audio buffer into segments based on musical timing
   */
    public sliceAudio(audioBuffer: AudioBuffer, file: File, options: { bpm: number; division: string; totalSlices?: number; sampleAccurate?: boolean; preserveTail?: boolean; }): AudioSegment[] {
        const { bpm, division, totalSlices = 16, sampleAccurate, preserveTail } = options;

        // Calculate slice duration based on BPM and division
        const beatsPerSecond = bpm / 60;
        const divisionValue = this.getDivisionValue(division);
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
            let endTime = Math.min((i + 1) * sliceDuration, audioBuffer.duration);

            // If preserveTail is true, extend the last slice to include the remaining audio
            if (preserveTail && i === totalSlices - 1) {
                endTime = audioBuffer.duration;
            }

            // Create a slice with sample-accurate boundaries
            const slice = this.createSlice(audioBuffer, startTime, endTime, sampleAccurate ?? false);

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
        }

        console.log(`Created ${segments.length} audio segments`);
        return segments;
    }

    /**
   * Create a precise slice of audio with sample-accurate boundaries
   */
    private createSlice(sourceBuffer: AudioBuffer, startTime: number, endTime: number, sampleAccurate: boolean): AudioBuffer {
        // Calculate sample positions
        const sampleRate = sourceBuffer.sampleRate;
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.ceil(endTime * sampleRate);
        const sliceLength = endSample - startSample;

        // Create a new buffer for the slice
        const sliceBuffer = this.audioContext.createBuffer(sourceBuffer.numberOfChannels, sliceLength, sampleRate);

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
                applyFades(sliceBuffer, channel, 0.005); // 5ms fade
            }
        }

        return sliceBuffer;
    }

    /**
    * Convert division string to numerical value
    */
    private getDivisionValue(division: string): number {
        switch (division) {
            case '1/4':
                return 1;
            case '1/8':
                return 0.5;
            case '1/16':
                return 0.25;
            case '1/32':
                return 0.125;
            default:
                return 0.25; // Default to 1/16
        }
    }
}
