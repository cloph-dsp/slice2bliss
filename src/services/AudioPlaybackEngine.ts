import {
  AudioQualityMetrics,
  AudioSegment,
  PlaybackOptions,
  SchedulerConfig,
  SliceOptions,
  StretchMode,
} from '../types/audio';
import { AudioCache } from './AudioCache';
import { TimeStretcher, getTimeStretcher } from './TimeStretcher';
import { calculateOptimalCrossfadeDuration } from '../utils/crossfadeUtils';
import { calculateInterval, prepareBufferForPlayback } from '../utils/audioUtils';
import { PlaybackScheduler } from './PlaybackScheduler';

export interface AudioSlice {
  buffer: AudioBuffer;
  metadata: {
    startTime: number;
    duration: number;
    index: number;
    // Add new metadata fields
    originalBoundaries?: {
      sliceStartTime: number;
      sliceEndTime: number;
      originalDuration: number;
    };
    overlapDuration?: number;
  };
  id: string;
}

export class AudioPlaybackEngine {
  private audioContext: AudioContext;
  private cache: AudioCache;
  private activeSourceNodes: Map<string, AudioBufferSourceNode>;
  private gainNodes: Map<string, GainNode>;
  private masterGainNode: GainNode;
  private recordingDestination: MediaStreamAudioDestinationNode | null;
  private activeSourceNode: AudioBufferSourceNode | null = null;
  private activeGainNode: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private slices: AudioSlice[] = [];
  private activeSliceIndex: number = -1;
  private timeStretcher: TimeStretcher;
  private stretchingQuality: 'low' | 'medium' | 'high' = 'medium';
  private stretchMode: StretchMode = 'auto';
  private smoothnessBias = 0.7;
  private lastPlayedTime: number = 0;
  private currentFadeParams: {fadeInDuration: number, fadeOutDuration: number} | null = null;
  private lastPlaybackRate: number = 1.0;
  private playingUIVisible: boolean = true;
  private scheduler: PlaybackScheduler;
  private randomPlaybackConfig: {
    playbackRate: number;
    bpm: number;
    division: string;
    transitionSpeed: number;
  } = {
    playbackRate: 1,
    bpm: 120,
    division: '1/4',
    transitionSpeed: 1,
  };
  private qualityMetrics: AudioQualityMetrics = {
    peakDb: -96,
    rmsDb: -96,
    clipCount: 0,
    schedulerDriftMs: 0,
    contextState: 'suspended',
    hqCacheHitRate: 0,
    hqFallbackCount: 0,
    currentFadeMs: 0,
    currentOverlapMs: 0,
    stretchMode: 'auto',
  };
  private hqCacheHits = 0;
  private hqCacheMisses = 0;
  private lastRandomSliceIndex = -1;
  private recentRandomHistory: number[] = [];

  constructor(
    audioContext: AudioContext,
    destination: AudioNode,
    recordingDestination: MediaStreamAudioDestinationNode | null = null,
    cacheSize: number = 32
  ) {
    this.audioContext = audioContext;
    this.cache = new AudioCache(cacheSize);
    this.activeSourceNodes = new Map();
    this.gainNodes = new Map();

    // Create master gain node
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.gain.value = 1.0;
    this.masterGainNode.connect(destination);

    this.recordingDestination = recordingDestination;
    this.timeStretcher = getTimeStretcher(audioContext);
    this.scheduler = new PlaybackScheduler(audioContext);
  }

  /**
   * Set time-stretching quality
   */
  public setStretchingQuality(quality: 'low' | 'medium' | 'high'): void {
    this.stretchingQuality = quality;
    this.timeStretcher.setQuality(quality);
  }

  public setStretchMode(mode: StretchMode): void {
    this.stretchMode = mode;
    this.qualityMetrics.stretchMode = mode;
  }

  public setSmoothnessBias(value: number): void {
    this.smoothnessBias = Math.max(0, Math.min(1, value));
  }

  /**
   * Get audio context used by the engine
   */
  public getAudioContext(): AudioContext {
    return this.audioContext;
  }

  /**
   * Prepare audio file for BPM detection or slicing
   */
  public async prepareAudioForAnalysis(file: File): Promise<AudioBuffer> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      console.log(`Prepared audio for analysis: ${audioBuffer.duration.toFixed(2)}s,
                  ${audioBuffer.numberOfChannels} channels,
                  ${audioBuffer.sampleRate}Hz`);
      return audioBuffer;
    } catch (error) {
      console.error('Error preparing audio for analysis:', error);
      throw error;
    }
  }

  /**
   * Extract relevant features from audio for analysis
   */
  public extractAudioFeatures(buffer: AudioBuffer): {
    duration: number;
    sampleRate: number;
    channels: number;
    peakAmplitude: number;
    averageAmplitude: number;
  } {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const duration = buffer.duration;
    let peakAmplitude = 0;
    let totalAmplitude = 0;
    let sampleCount = 0;

    // Analyze each channel
    for (let channel = 0; channel < channels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < channelData.length; i++) {
        const absValue = Math.abs(channelData[i]);
        if (absValue > peakAmplitude) {
          peakAmplitude = absValue;
        }
        totalAmplitude += absValue;
        sampleCount++;
      }
    }

    const averageAmplitude = totalAmplitude / sampleCount;

    return {
      duration,
      sampleRate,
      channels,
      peakAmplitude,
      averageAmplitude
    };
  }

  /**
   * Play an audio segment with options and enhanced error handling
   */
  public async playSegment(
    segment: AudioSegment,
    options: PlaybackOptions = {}
  ): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => undefined);
    }

    const segmentId = segment.id;
    const previousGainNode = this.activeGainNode;

    if (!segment.buffer || segment.buffer.length === 0) {
      throw new Error('Invalid audio buffer');
    }

    this.cache.set(segment);

        const playbackRate = Math.max(0.5, Math.min(2, options.playbackRate || 1.0));
        const transitionSpeed = options.transitionSpeed || 1.0;
        const bpm = options.bpm || 120;
        const division = options.division || '1/4';
        const startTime = options.startTime !== undefined ? options.startTime : 0;
        const endTime = options.endTime !== undefined ? options.endTime : segment.buffer.duration;
        const offset = Math.max(0, Math.min(startTime, segment.buffer.duration));
        const playDuration = Math.min(endTime - startTime, segment.buffer.duration - offset);
        const boundedPlayDuration = Math.max(0.001, playDuration > 0 ? playDuration : (segment.buffer.duration - offset));
        const now = this.audioContext.currentTime;
        const scheduledStartTime = options.scheduledStartTime ?? now + 0.012;
        const startAt = Math.max(now + 0.001, scheduledStartTime);

        const clampedBuffer = this.applyHeadroomClamp(segment.buffer);
        const preparedBuffer = prepareBufferForPlayback(clampedBuffer, this.audioContext);
        const requestedStretchMode = options.stretchMode || this.stretchMode;
        const resolvedStretchMode = this.timeStretcher.resolveStretchMode(requestedStretchMode, playbackRate);

        let source: AudioBufferSourceNode | null = null;
        let sourceOffset = offset;
        let sourceDuration = boundedPlayDuration;
        let hqMissedDeadline = false;

        if (Math.abs(playbackRate - 1.0) <= 0.001) {
          source = this.timeStretcher.createNativeSource(preparedBuffer, 1, true);
        } else if (resolvedStretchMode === 'native') {
          source = this.timeStretcher.createNativeSource(preparedBuffer, playbackRate, true);
        } else {
          const msUntilStart = Math.max(1, (startAt - this.audioContext.currentTime) * 1000 - 2);
          try {
            const hqBuffer = await Promise.race([
              this.timeStretcher.getHQBuffer(segmentId, preparedBuffer, playbackRate, this.stretchingQuality),
              new Promise<AudioBuffer>((_, rejectTimeout) => {
                window.setTimeout(() => rejectTimeout(new Error('hq-timeout')), msUntilStart);
              }),
            ]);
            this.hqCacheHits += 1;
            source = this.timeStretcher.createNativeSource(hqBuffer, 1, false);
            sourceOffset = offset / playbackRate;
            sourceDuration = boundedPlayDuration / playbackRate;
          } catch {
            this.hqCacheMisses += 1;
            this.qualityMetrics.hqFallbackCount = (this.qualityMetrics.hqFallbackCount || 0) + 1;
            hqMissedDeadline = true;
            source = this.timeStretcher.createNativeSource(preparedBuffer, playbackRate, true);
          }
        }

    if (!source) {
      throw new Error('Unable to create audio source');
    }

        const intervalSeconds = calculateInterval(
          bpm,
          division,
          transitionSpeed,
          playbackRate
        ) / 1000;
        const effectiveSliceDuration = Math.max(0.01, sourceDuration);
        const gainNode = this.audioContext.createGain();
        const { fadeInDuration, fadeOutDuration, overlapDuration } = this.calculateCompositedFades(
          bpm,
          division,
          transitionSpeed,
          playbackRate,
          effectiveSliceDuration,
          intervalSeconds
        );
        this.currentFadeParams = { fadeInDuration, fadeOutDuration };

        source.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        if (this.recordingDestination) gainNode.connect(this.recordingDestination);

        this.activeSourceNodes.set(segmentId, source);
        this.gainNodes.set(segmentId, gainNode);
        this.activeGainNode = gainNode;
        this.activeSourceNode = source;

        this.updateLevelMetrics(clampedBuffer);
        this.qualityMetrics.currentFadeMs = fadeInDuration * 1000;
        this.qualityMetrics.currentOverlapMs = overlapDuration * 1000;
        this.qualityMetrics.stretchMode = resolvedStretchMode;

        const overlapLead = Math.max(0.0008, overlapDuration * 0.2);
        const safeNow = startAt + overlapLead;

        if (previousGainNode && previousGainNode !== gainNode) {
          this.applySimpleEqualPowerCrossfade(
            previousGainNode,
            gainNode,
            fadeInDuration,
            safeNow,
            transitionSpeed
          );
        } else {
          this.scheduleGainSafe(gainNode.gain, safeNow - 0.001, 0.0001);
          gainNode.gain.linearRampToValueAtTime(1.0, safeNow + fadeInDuration);
        }

        if (sourceDuration > 0) {
          const fadeOutStart = startAt + sourceDuration - fadeOutDuration - overlapLead;
          if (fadeOutStart > safeNow) {
            this.scheduleGainSafe(gainNode.gain, fadeOutStart - 0.001, Math.max(0.0001, gainNode.gain.value || 1));
            gainNode.gain.linearRampToValueAtTime(0.0001, fadeOutStart + fadeOutDuration);
          }
        }

        source.start(startAt, sourceOffset, sourceDuration);
        this.lastPlayedTime = now;
        this.lastPlaybackRate = playbackRate;

    await new Promise<void>((resolve) => {
      source.onended = () => {
        this.cleanupPlayback(segment.id);
        if (!hqMissedDeadline) {
          const total = this.hqCacheHits + this.hqCacheMisses;
          if (total > 0) this.qualityMetrics.hqCacheHitRate = this.hqCacheHits / total;
        }
        resolve();
      };
    });

    return;
  }
  
  /**
   * Stop playback of a specific segment with a quick fade out
   */
  public stopSegment(id: string, fadeTime: number = 0.01): void {
    const source = this.activeSourceNodes.get(id);
    const gainNode = this.gainNodes.get(id);
    
    if (source && gainNode) {
      const now = this.audioContext.currentTime;
      
      // Apply smooth fade out with multiple curve points for maximum smoothness
      const steps = 32;
      const curve = new Float32Array(steps);
      
      // Create a special curve that never exactly reaches zero
      // to prevent discontinuity in the audio signal
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        // Use a modified exponential curve for more natural fade
        curve[i] = Math.exp(-4 * t) * (1 - t) + 0.0001;
      }
      
      // Cancel any pending changes and set current value
      this.scheduleGainSafe(gainNode.gain, now, Math.max(0.0001, gainNode.gain.value));
      
      // Apply the curve
      gainNode.gain.setValueCurveAtTime(curve, now, fadeTime);
      
      // Schedule stop after fade completes with a small safety margin
      setTimeout(() => {
        try {
          source.stop();
        } catch (e) {
          // Ignore errors
        } finally {
          try { gainNode.disconnect(); } catch { /* ignore */ }
          this.activeSourceNodes.delete(id);
          this.gainNodes.delete(id);
        }
      }, (fadeTime * 1000) + 10);
    } else if (source) {
      // No gain node available, immediately stop the source
      try {
        source.stop();
      } catch (e) {
        // Ignore errors
      } finally {
        this.activeSourceNodes.delete(id);
      }
    }
  }
  
  /**
   * Stop all currently playing segments
   */
  public stopAll(): void {
    this.scheduler.stop();
    // Stop all active sources with a quick fade out
    const activeSourceIds = [...this.activeSourceNodes.keys()];
    for (const id of activeSourceIds) {
      this.stopSegment(id, 0.02);
    }
    
    // Clear active references
    this.activeSourceNode = null;
    this.activeGainNode = null;
    this.lastPlayedTime = 0;
  }
  
  /**
   * Set the master volume
   */
  public setVolume(volume: number): void {
    this.masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
  }
  
  /**
   * Enable/disable recording output
   */
  public setRecordingOutput(recordingDestination: MediaStreamAudioDestinationNode | null): void {
    // Disconnect all gain nodes from previous recording destination if it exists
    if (this.recordingDestination) {
      for (const gainNode of this.gainNodes.values()) {
        try {
          gainNode.disconnect(this.recordingDestination);
        } catch (e) {
          // Ignore disconnection errors
        }
      }
    }
    
    // Set new recording destination
    this.recordingDestination = recordingDestination;
    
    // Connect all active gain nodes to new recording destination if it exists
    if (recordingDestination) {
      for (const gainNode of this.gainNodes.values()) {
        try {
          gainNode.connect(recordingDestination);
        } catch (e) {
          console.error("Error connecting to recording destination:", e);
        }
      }
    }
  }
  
  /**
   * Clean up resources for a segment with zero-click prevention
   */
  private cleanupPlayback(id: string): void {
    const source = this.activeSourceNodes.get(id);
    const gainNode = this.gainNodes.get(id);
    
    // Apply fade-out before cleanup
    if (gainNode) {
      const now = this.audioContext.currentTime;
      const currentGain = gainNode.gain.value;
      
      // Apply tiny fade-out to prevent clicks
      this.scheduleGainSafe(gainNode.gain, now, Math.max(0.0001, currentGain));
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
      
      // Disconnect after fade completes
      setTimeout(() => {
        try { 
          gainNode.disconnect();
          this.gainNodes.delete(id);
        } catch (e) { /* ignore errors */ }
      }, 15); // 15ms after fade starts
    }
    
    if (source) {
      try {
        setTimeout(() => {
          try { source.stop(); } catch (e) { /* ignore if already stopped */ }
          this.activeSourceNodes.delete(id);
        }, 20); // Slightly longer than gain node cleanup
      } catch (e) {
        // Ignore errors
      }
    }
  }
  
  /**
   * Get a segment from the cache
   */
  public getCachedSegment(id: string): AudioSegment | undefined {
    return this.cache.get(id);
  }
  
  /**
   * Clear the audio cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  async loadFile(file: File): Promise<AudioBuffer | null> {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    try {
      console.log(`Loading audio file: ${file.name} (${file.size} bytes)`);
      const arrayBuffer = await file.arrayBuffer();
      console.log('File loaded to array buffer, decoding audio data...');
      
      // Reset any existing state
      this.stopAllPlayback();
      this.slices = [];
      this.activeSliceIndex = -1;
      
      // Decode the audio data
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      console.log(`Audio decoded successfully: ${this.audioBuffer.duration.toFixed(2)}s, 
                  ${this.audioBuffer.numberOfChannels} channels, 
                  ${this.audioBuffer.sampleRate}Hz`);
                  
      return this.audioBuffer;
    } catch (error) {
      console.error('Error loading audio file:', error);
      this.audioBuffer = null;
      return null;
    }
  }

  async sliceAudio(options: SliceOptions): Promise<AudioSlice[]> {
    console.log('AudioPlaybackEngine.sliceAudio called with options:', options);
    console.log('Audio context state:', this.audioContext?.state);
    console.log('Audio buffer exists:', !!this.audioBuffer);
    console.log('Audio buffer details:', this.audioBuffer ? {
      duration: this.audioBuffer.duration,
      numberOfChannels: this.audioBuffer.numberOfChannels,
      sampleRate: this.audioBuffer.sampleRate,
      length: this.audioBuffer.length
    } : 'No buffer');
  
    try {
      if (!this.audioContext) {
        console.error('Audio context is not initialized');
        throw new Error('Audio context not initialized');
      }
    
      if (this.audioContext.state === 'suspended') {
        console.log('Resuming suspended audio context');
        await this.audioContext.resume();
      }
    
      if (!this.audioBuffer) {
        console.error('Audio buffer is null or undefined');
        throw new Error('Audio not loaded');
      }
    
      const { bpm, division } = options;
      
      // Calculate time per beat in seconds with greater precision
      const secondsPerBeat = 60 / bpm;
      
      console.log(`Slicing with precise timing - BPM: ${bpm}, seconds per beat: ${secondsPerBeat}`);
      
      // Calculate slice duration based on division
      const divisionValue = this.getDivisionValue(division);
      const sliceDuration = secondsPerBeat * divisionValue;
      
      console.log(`Creating slices with duration ${sliceDuration}s (BPM: ${bpm}, Division: ${division})`);
      
      // Create slices
      const slices: AudioSlice[] = [];
      let startTime = 0;
      
      while (startTime < this.audioBuffer.duration) {
        try {
          // Make sure we don't exceed audio duration
          const endTime = Math.min(startTime + sliceDuration, this.audioBuffer.duration);
          const actualDuration = endTime - startTime;
          
          // Validate frame count before creating buffer - ADD THIS CODE
          const startSample = Math.floor(startTime * this.audioBuffer.sampleRate);
          const endSample = Math.floor(endTime * this.audioBuffer.sampleRate);
          let frameCount = endSample - startSample;
          
          // Ensure we have at least 1 frame - ADD THIS CODE
          if (frameCount <= 0) {
            console.warn(`Skipping invalid slice at time ${startTime}: would result in ${frameCount} frames`);
            // Skip to next slice without error
            startTime = endTime;
            continue;
          }
          
          // Create a new buffer for this slice with validated frame count
          const sliceBuffer = this.audioContext.createBuffer(
            this.audioBuffer.numberOfChannels,
            frameCount,
            this.audioBuffer.sampleRate
          );
          
          // Copy data from the original buffer
          for (let channel = 0; channel < this.audioBuffer.numberOfChannels; channel++) {
            const originalData = this.audioBuffer.getChannelData(channel);
            const sliceData = sliceBuffer.getChannelData(channel);
            
            const startSample = Math.floor(startTime * this.audioBuffer.sampleRate);
            const endSample = Math.min(
              Math.floor(endTime * this.audioBuffer.sampleRate),
              originalData.length
            );
            
            console.log(`Copying channel ${channel} data from sample ${startSample} to ${endSample}`);
            
            for (let i = startSample, j = 0; i < endSample; i++, j++) {
              sliceData[j] = originalData[i];
            }
          }
          
          const index = slices.length;
          slices.push({
            buffer: sliceBuffer,
            metadata: {
              startTime,
              duration: actualDuration,
              index
            },
            id: `slice-${index}` // Ensure id is always set
          });
          
          startTime = endTime;
        } catch (error) {
          console.error("Error creating slice at time", startTime, error);
          // Continue to next slice instead of failing entire process
          startTime += sliceDuration;
        }
      }
      
      console.log(`Created ${slices.length} slices`);
      
      if (slices.length === 0) {
        throw new Error("Failed to create any slices");
      }
      
      // If bpm was detected automatically, use that information for more accurate slicing
      if (options.detectedBpm && options.detectedConfidence && options.detectedConfidence > 0.6) {
        console.log(`Using high-confidence detected BPM (${options.detectedBpm}) for enhanced timing accuracy`);
        // Any enhanced timing logic can be applied here
      }
      
      // Before returning slices, convert them to proper AudioSegment format
      // to ensure compatibility with the rest of the system
      this.slices = slices.map(slice => ({
        ...slice,
        metadata: {
          ...slice.metadata,
          sliceIndex: slice.metadata.index,
          // Add required fields from AudioSegmentMetadata
          sampleRate: this.audioBuffer?.sampleRate || 44100,
          channels: this.audioBuffer?.numberOfChannels || 2,
          timestamp: Date.now()
        }
      }));
      
      return this.slices;
    } catch (error) {
      console.error("Error in sliceAudio method:", error);
      throw error; // Re-throw so the calling function knows it failed
    }
  }

  /**
   */
  private detectTransientAtStart(buffer: AudioBuffer): boolean {
    const channel = buffer.getChannelData(0);
    const sampleCount = Math.min(1024, channel.length);
    
    // Look at first samples (usually first 20ms)
    const firstSamples = channel.slice(0, sampleCount);
    
    // Calculate RMS energy
    let energySum = 0;
    for (let i = 0; i < sampleCount; i++) {
      energySum += firstSamples[i] * firstSamples[i];
    }
    const rms = Math.sqrt(energySum / sampleCount);
    
    // Check for rate of change in the first samples
    let differentialSum = 0;
    for (let i = 1; i < sampleCount; i++) {
      differentialSum += Math.abs(firstSamples[i] - firstSamples[i-1]);
    }
    const avgDifferential = differentialSum / (sampleCount - 1);
    
    // Combined metric for transient detection
    return (rms > 0.1 && avgDifferential > 0.05) || avgDifferential > 0.12;
  }

  /**
   * Get peak amplitude of an audio buffer
   */
  private getBufferPeakAmplitude(buffer: AudioBuffer): number {
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    return peak;
  }

  private calculateCompositedFades(
    bpm: number,
    division: string,
    transitionSpeed: number,
    playbackRate: number,
    sliceDurationSeconds: number,
    intervalSeconds: number
  ): { fadeInDuration: number; fadeOutDuration: number; overlapDuration: number } {
    const fadeBase = calculateOptimalCrossfadeDuration(bpm, division);
    const safeTransition = Math.max(0.25, transitionSpeed);
    const transitionFactor = Math.max(0.65, Math.min(1.35, Math.pow(1 / safeTransition, 0.35)));
    const rateFactor = Math.max(0.8, Math.min(1.25, Math.pow(1 / Math.max(0.5, playbackRate), 0.25)));
    const fadeScaled = fadeBase * transitionFactor * rateFactor;
    const referenceWindow = Math.max(0.01, Math.min(sliceDurationSeconds, intervalSeconds));
    const maxAllowed = Math.min(0.12, 0.35 * referenceWindow);
    const fade = Math.max(0.012, Math.min(maxAllowed, fadeScaled));
    const overlap = Math.max(0.008, Math.min(fade * 0.85, referenceWindow * 0.25, 0.06));
    return {
      fadeInDuration: fade,
      fadeOutDuration: fade,
      overlapDuration: overlap,
    };
  }

  private scheduleGainSafe(param: AudioParam, startTime: number, value: number): void {
    const safeTime = Math.max(this.audioContext.currentTime, startTime);
    param.cancelScheduledValues(Math.max(0, safeTime - 0.002));
    param.setValueAtTime(value, safeTime);
  }

  private classifySliceEnergy(buffer: AudioBuffer): number {
    let peak = 0;
    let sumSquares = 0;
    let count = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        peak = Math.max(peak, abs);
        sumSquares += data[i] * data[i];
        count += 1;
      }
    }
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    return rms * 0.7 + peak * 0.3;
  }

  private pickNextSliceIndex(): number {
    if (!this.slices.length) return -1;
    if (this.slices.length === 1) return 0;

    const lastIndexIsValid =
      this.lastRandomSliceIndex >= 0 &&
      this.lastRandomSliceIndex < this.slices.length;
    const current = lastIndexIsValid
      ? this.lastRandomSliceIndex
      : Math.floor(Math.random() * this.slices.length);
    const currentEnergy = this.classifySliceEnergy(this.slices[current].buffer);
    const recentSet = new Set(this.recentRandomHistory);
    const candidates = this.slices.map((slice, idx) => ({ idx, energy: this.classifySliceEnergy(slice.buffer) }))
      .filter((entry) => entry.idx !== current);

    const nonRecentCandidates = candidates.filter((entry) => !recentSet.has(entry.idx));
    const pool = nonRecentCandidates.length > 0 ? nonRecentCandidates : candidates;

    const withScore = pool.map((entry) => {
      const delta = Math.abs(entry.energy - currentEnergy);
      const smoothScore = 1 - Math.min(1, delta / 0.35);
      const randomScore = Math.random();
      const combined = this.smoothnessBias * smoothScore + (1 - this.smoothnessBias) * randomScore;
      return { idx: entry.idx, score: combined };
    });

    withScore.sort((a, b) => b.score - a.score);
    return withScore[0].idx;
  }

  private applyHeadroomClamp(buffer: AudioBuffer, headroomDb: number = -1): AudioBuffer {
    const peak = this.getBufferPeakAmplitude(buffer);
    if (peak <= 0) return buffer;

    const linearLimit = Math.pow(10, headroomDb / 20);
    if (peak <= linearLimit) return buffer;

    const gain = linearLimit / peak;
    const output = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const input = buffer.getChannelData(channel);
      const out = output.getChannelData(channel);
      for (let i = 0; i < input.length; i++) {
        out[i] = input[i] * gain;
      }
    }

    return output;
  }

  private updateLevelMetrics(buffer: AudioBuffer): void {
    let peak = 0;
    let sumSquares = 0;
    let count = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const sample = data[i];
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
        sumSquares += sample * sample;
        count += 1;
      }
    }

    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    if (peak >= 1) {
      this.qualityMetrics.clipCount += 1;
    }

    this.qualityMetrics.peakDb = this.toDb(peak);
    this.qualityMetrics.rmsDb = this.toDb(rms);
    this.qualityMetrics.contextState = this.audioContext.state;
  }

  private toDb(value: number): number {
    if (value <= 0.000001) return -96;
    return 20 * Math.log10(value);
  }

  private applySimpleEqualPowerCrossfade(
    currentGain: GainNode,
    nextGain: GainNode,
    fadeDuration: number,
    startTime: number,
    transitionSpeed: number
  ): void {
    const steps = transitionSpeed >= 2 ? 160 : 96;
    const fadeOutCurve = new Float32Array(steps);
    const fadeInCurve = new Float32Array(steps);

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      fadeOutCurve[i] = Math.max(0.0001, Math.cos((Math.PI * 0.5) * t));
      fadeInCurve[i] = Math.max(0.0001, Math.sin((Math.PI * 0.5) * t));
    }

    this.scheduleGainSafe(currentGain.gain, startTime - 0.001, Math.max(0.0001, currentGain.gain.value || 1));
    this.scheduleGainSafe(nextGain.gain, startTime - 0.001, 0.0001);
    currentGain.gain.setValueCurveAtTime(fadeOutCurve, startTime, fadeDuration);
    nextGain.gain.setValueCurveAtTime(fadeInCurve, startTime, fadeDuration);
    currentGain.gain.setValueAtTime(0.0001, startTime + fadeDuration + 0.002);
    nextGain.gain.setValueAtTime(1, startTime + fadeDuration + 0.002);
  }
  
  /**
   * Specialized buffer preparation optimized for transient content
   */
  private prepareTransientBuffer(buffer: AudioBuffer): AudioBuffer {
    const prepared = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    
    // Process each channel with specialized transient preservation
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = prepared.getChannelData(channel);
      
      // Copy data
      for (let i = 0; i < buffer.length; i++) {
        outputData[i] = inputData[i];
      }
      
      // For transient content, apply very minimal fade-in
      // just enough to avoid discontinuity
      const fadeInSamples = Math.min(buffer.sampleRate * 0.0005, buffer.length * 0.01);
      for (let i = 0; i < fadeInSamples; i++) {
        const factor = i / fadeInSamples;
        // Very quick linear fade for minimal impact on transient
        outputData[i] *= factor;
      }
      
      // Apply normal fade-out at the end
      const fadeOutSamples = Math.min(buffer.sampleRate * 0.001, buffer.length * 0.01);
      for (let i = 0; i < fadeOutSamples; i++) {
        const position = buffer.length - fadeOutSamples + i;
        const factor = (fadeOutSamples - i) / fadeOutSamples;
        // Equal-power curve for smoother transition
        const gain = Math.sin(factor * Math.PI/2);
        outputData[position] *= gain;
      }
    }
    
    return prepared;
  }

  stopAllPlayback(): void {
    this.stopAll();
    this.activeSliceIndex = -1;
  }

  getActiveSliceIndex(): number {
    return this.activeSliceIndex;
  }

  getSlices(): AudioSlice[] {
    return this.slices;
  }

  public startRandomPlayback(config?: Partial<{
    playbackRate: number;
    bpm: number;
    division: string;
    transitionSpeed: number;
  }>): void {
    if (!this.slices.length) return;
    this.randomPlaybackConfig = {
      ...this.randomPlaybackConfig,
      ...(config || {}),
    };
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    const resolvedMode = this.timeStretcher.resolveStretchMode(this.stretchMode, this.randomPlaybackConfig.playbackRate);
    this.scheduler.setConfig({
      queueDepth: isDesktop && resolvedMode === 'hq' ? 3 : 2,
    });

    this.scheduler.start(
      (scheduledTime) => {
        if (!this.slices.length) return;
        const index = this.pickNextSliceIndex();
        if (index < 0) return;
        this.lastRandomSliceIndex = index;
        this.recentRandomHistory.push(index);
        if (this.recentRandomHistory.length > 3) {
          this.recentRandomHistory.shift();
        }

        // Prewarm likely upcoming slices for HQ mode to avoid deadline misses.
        const shouldPrewarm = this.timeStretcher.resolveStretchMode(this.stretchMode, this.randomPlaybackConfig.playbackRate) === 'hq';
        if (shouldPrewarm && this.slices.length > 2) {
          for (let i = 0; i < 2; i++) {
            const prewarmIndex = this.pickNextSliceIndex();
            const prewarmSlice = this.slices[prewarmIndex];
            this.timeStretcher.getHQBuffer(
              prewarmSlice.id,
              prewarmSlice.buffer,
              this.randomPlaybackConfig.playbackRate,
              this.stretchingQuality
            ).catch(() => undefined);
          }
        }

        this.playSlice(
          index,
          this.randomPlaybackConfig.playbackRate,
          this.randomPlaybackConfig.bpm,
          this.randomPlaybackConfig.transitionSpeed,
          scheduledTime,
          this.randomPlaybackConfig.division
        );
        this.qualityMetrics.schedulerDriftMs = this.scheduler.getState().schedulerDriftMs;
        const total = this.hqCacheHits + this.hqCacheMisses;
        if (total > 0) {
          this.qualityMetrics.hqCacheHitRate = this.hqCacheHits / total;
        }
        this.qualityMetrics.stretchMode = this.stretchMode;
        this.qualityMetrics.currentOverlapMs = this.qualityMetrics.currentOverlapMs || 0;
      },
      () =>
        calculateInterval(
          this.randomPlaybackConfig.bpm,
          this.randomPlaybackConfig.division,
          this.randomPlaybackConfig.transitionSpeed,
          this.randomPlaybackConfig.playbackRate
        )
    );
  }

  public stopRandomPlayback(): void {
    this.scheduler.stop();
    this.stopAllPlayback();
    this.lastRandomSliceIndex = -1;
    this.recentRandomHistory = [];
  }

  public setSchedulerConfig(config: Partial<SchedulerConfig>): void {
    this.scheduler.setConfig(config);
  }

  public getSchedulerState(): { running: boolean; schedulerDriftMs: number } {
    return this.scheduler.getState();
  }

  public getCurrentCrossfadeDuration(): number {
    return this.currentFadeParams?.fadeInDuration ?? 0;
  }

  public getQualityMetrics(): AudioQualityMetrics {
    const total = this.hqCacheHits + this.hqCacheMisses;
    return {
      ...this.qualityMetrics,
      schedulerDriftMs: this.scheduler.getState().schedulerDriftMs,
      contextState: this.audioContext.state,
      hqCacheHitRate: total > 0 ? this.hqCacheHits / total : this.qualityMetrics.hqCacheHitRate || 0,
      stretchMode: this.stretchMode,
    };
  }

  getRecordingDestination(): MediaStream | null {
    if (!this.audioContext) {
      console.error('Audio context not initialized');
      return null;
    }
    
    try {
      // Create a destination node for recording if it doesn't exist
      if (!this.recordingDestination) {
        // Create a destination node for recording
        this.recordingDestination = this.audioContext.createMediaStreamDestination();
        
        // Connect the master gain to the recording destination
        if (this.masterGainNode) {
          this.masterGainNode.disconnect(this.recordingDestination);
          this.masterGainNode.connect(this.recordingDestination);
        }
      }
      
      // Return the MediaStream from the destination node
      return this.recordingDestination.stream;
    } catch (error) {
      console.error('Error creating recording destination:', error);
      return null;
    }
  }

  /**
   * Parse the division string to get the numeric value
   * For example, "1/4" returns 0.25, "1/8" returns 0.125, etc.
   */
  private getDivisionValue(division: string): number {
    switch (division) {
      case '1/1':
        return 4.0;
      case '1/2':
        return 2.0;
      case '1/4':
        return 1.0;
      case '1/8':
        return 0.5;
      case '1/16':
        return 0.25;
      case '1/32':
        return 0.125;
      default:
        return 1.0;
    }
  }

  reset(): void {
    this.stopRandomPlayback();
    this.audioBuffer = null;
    this.slices = [];
    this.activeSliceIndex = -1;
    this.qualityMetrics = {
      peakDb: -96,
      rmsDb: -96,
      clipCount: 0,
      schedulerDriftMs: 0,
      contextState: this.audioContext.state,
      hqCacheHitRate: 0,
      hqFallbackCount: 0,
      currentFadeMs: 0,
      currentOverlapMs: 0,
      stretchMode: this.stretchMode,
    };
    this.hqCacheHits = 0;
    this.hqCacheMisses = 0;
    this.lastRandomSliceIndex = -1;
    this.recentRandomHistory = [];
  }

  /**
   * Play a slice by index with specified parameters
   * @param index The index of the slice to play
   * @param playbackRate The rate at which to play (1 = normal speed)
   * @param bpm The BPM to use for timing calculations
   * @param transitionSpeed The speed for transitions between slices
   */
  public playSlice(
    index: number,
    playbackRate: number = 1,
    bpm: number = 120,
    transitionSpeed: number = 1,
    scheduledStartTime?: number,
    division: string = '1/4'
  ): void {
    console.log(`PlaySlice: Starting playback of slice ${index} (available: ${this.slices?.length || 0})`);
    
    // Validate parameters
    if (index < 0 || !this.slices || index >= this.slices.length) {
      console.error(`Invalid slice index: ${index}. Available slices: ${this.slices?.length || 0}`);
      return;
    }

    try {
      // Ensure audio context is running
      if (this.audioContext.state === 'suspended') {
        console.log('PlaySlice: Resuming audio context');
        this.audioContext.resume();
      }
      
      // Get the slice at the given index
      const slice = this.slices[index];
      
      // Set a flag to track UI visibility for debugging
      this.playingUIVisible = true;
      
      // Check UI visibility after a short delay
      setTimeout(() => {
        if (this.playingUIVisible) {
          console.log('PlaySlice: UI still visible after 100ms');
        } else {
          console.warn('PlaySlice: UI visibility flag was changed!');
        }
        
        // Check document body state
        if (typeof document !== 'undefined') {
          const bodyOpacity = getComputedStyle(document.body).opacity;
          const bodyVisibility = getComputedStyle(document.body).visibility;
          console.log(`PlaySlice: Body state - opacity: ${bodyOpacity}, visibility: ${bodyVisibility}`);
        }
      }, 100);
      
      // Important: Update slice index BEFORE starting audio
      const prevIndex = this.activeSliceIndex;
      this.activeSliceIndex = index;
      console.log(`PlaySlice: Updated index ${prevIndex} → ${index}`);

      // Prepare options for playback with minimal settings
      const options: PlaybackOptions = {
        playbackRate,
        bpm,
        transitionSpeed,
        scheduledStartTime,
        division,
      };

      // Convert slice to AudioSegment with proper metadata
      const audioSegment: AudioSegment = {
        id: slice.id,
        buffer: slice.buffer,
        metadata: {
          ...slice.metadata,
          sliceIndex: slice.metadata.index,
          sampleRate: this.audioBuffer?.sampleRate || 44100,
          channels: this.audioBuffer?.numberOfChannels || 2,
          timestamp: Date.now()
        }
      };

      // Play the segment with minimal preprocessing
      this.playSegment(audioSegment, options)
        .catch(err => console.error(`PlaySlice: Error playing slice ${index}:`, err));

    } catch (error) {
      console.error(`Error in playSlice(${index}):`, error);
      this.activeSliceIndex = -1; // Reset on error
    }
  }

  /**
   * Report UI visibility issue from React components
   */
  public reportUIVisibilityIssue(): void {
    console.warn('UI reported visibility issue during playback!');
    this.playingUIVisible = false;
    
    // Log current state
    console.log('Current state:', {
      activeSliceIndex: this.activeSliceIndex,
      isPlaying: this.activeSourceNodes.size > 0,
      audioContextState: this.audioContext.state
    });
  }

  /**
   * Update the playback rate for active and future audio sources
   * @param rate The new playback rate (1.0 = normal speed)
   */
  public updatePlaybackRate(rate: number): void {
    console.log(`Updating playback rate to ${rate}x`);
    
    // Store the new rate
    this.lastPlaybackRate = rate;
    this.randomPlaybackConfig.playbackRate = rate;
    
    // Apply to currently active source if possible
    if (this.activeSourceNode && 'playbackRate' in this.activeSourceNode) {
      try {
        // For normal audio source nodes
        if ('value' in this.activeSourceNode.playbackRate) {
          // Apply a micro-dip in volume to mask transition artifacts
          if (this.activeGainNode) {
            const now = this.audioContext.currentTime;
            const currentGain = this.activeGainNode.gain.value;
            
            // Brief dip in volume
            this.activeGainNode.gain.setValueAtTime(currentGain, now);
            this.activeGainNode.gain.linearRampToValueAtTime(currentGain * 0.85, now + 0.02);
            this.activeGainNode.gain.linearRampToValueAtTime(currentGain, now + 0.05);
          }
          
          // Update the playback rate
          this.activeSourceNode.playbackRate.setValueAtTime(rate, this.audioContext.currentTime);
          console.log(`Applied new rate ${rate}x to active source node`);
        }
      } catch (err) {
        console.warn(`Could not update playback rate of active source: ${err}`);
      }
    }
    
    // For time-stretched sources, we can't easily change the rate
    // The next playback will use the new rate
  }

  /**
   * Enable recording functionality
   */
  public enableRecording(): void {
    if (!this.audioContext) {
      console.error('Audio context not initialized');
      return;
    }
    
    try {
      const destination = this.audioContext.createMediaStreamDestination();
      this.setRecordingOutput(destination);
      console.log('Recording enabled with new media stream destination');
    } catch (error) {
      console.error('Failed to enable recording:', error);
    }
  }
  
  /**
   * Disable recording functionality
   */
  public disableRecording(): void {
    this.setRecordingOutput(null);
    console.log('Recording disabled');
  }
}

// Create a singleton instance of AudioPlaybackEngine with default settings
let audioContext: AudioContext | null = null;

// Initialize the audio context lazily
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Create and export a default singleton instance
const audioEngineInstance = new AudioPlaybackEngine(
  getAudioContext(),
  getAudioContext().destination,
  null,
  32
);

// Export the singleton instance as default
export default audioEngineInstance;
