import { AudioSegment, PlaybackOptions, SliceOptions } from '../types/audio';
import { AudioCache } from './AudioCache';
import { TimeStretcher, getTimeStretcher } from './TimeStretcher';
import { calculateOptimalCrossfadeDuration, applyAdaptiveMultibandCrossfade, applyPhaseAlignedCrossfade, applyEqualPowerCrossfade, calculateTransientEnvelope, applyZeroClickCrossfade, applyUltraZeroClickCrossfade, applySlowRateCrossfade } from '../utils/crossfadeUtils';
import { prepareBufferForPlayback, applySafeFallbackCrossfade } from '../utils/audioUtils';
import { ensureAudioContextRunning } from '../utils/audioUtils';

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
  private sourceNodes: Map<number, AudioBufferSourceNode> = new Map();
  private activeSourceNode: AudioBufferSourceNode | null = null;
  private activeGainNode: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private slices: AudioSlice[] = [];
  private activeSliceIndex: number = -1;
  private timeStretcher: TimeStretcher;
  private stretchingQuality: 'low' | 'medium' | 'high' = 'medium';
  private lastPlayedTime: number = 0;
  private currentFadeParams: {fadeInDuration: number, fadeOutDuration: number} | null = null;
  // Add this property to track recent speed changes
  private lastPlaybackRate: number = 1.0;
  // Add a property to track UI visibility
  private playingUIVisible: boolean = true;

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
  }

  /**
   * Set time-stretching quality
   */
  public setStretchingQuality(quality: 'low' | 'medium' | 'high'): void {
    this.stretchingQuality = quality;
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
  public playSegment(
    segment: AudioSegment,
    options: PlaybackOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(err => {
            console.error("Error resuming audio context:", err);
            reject(err);
            return;
          });
        }

        // Extract segment ID for tracking
        const segmentId = segment.id;
        const isNewSegment = !this.activeSourceNodes.has(segmentId);

        // Capture previous active gain node for crossfade
        const previousGainNode = this.activeGainNode;

        // Check if buffer is valid
        if (!segment.buffer || segment.buffer.length === 0) {
          const error = new Error("Invalid audio buffer");
          console.error(error);
          reject(error);
          return;
        }

        // Add to cache for future quick access
        this.cache.set(segment);

        // Create source node with time-stretching if needed
        let source: AudioBufferSourceNode;

        try {
          if (options.playbackRate !== undefined && options.playbackRate !== 1.0) {
            // Use time-stretcher for pitch-preserving speed change
            // The time stretcher should use the same audio context
            source = this.timeStretcher.createTimeStretchedSource(
              segment.buffer,
              options.playbackRate,
              true,  // Always preserve pitch
              this.stretchingQuality
            );
          } else {
            // Use regular source for normal playback
            // Prepare buffer to avoid clicks
            const preparedBuffer = prepareBufferForPlayback(segment.buffer, this.audioContext);

            // Create source with prepared buffer
            source = this.audioContext.createBufferSource();
            source.buffer = preparedBuffer;
          }

          // Verify source context matches our context
          if ((source as any).context && (source as any).context !== this.audioContext) {
            throw new Error("Source created with different audio context");
          }
        } catch (error) {
          console.error("Error creating audio source:", error);
          reject(error);
          return;
        }

        // Create gain node for this source (for fades)
        const gainNode = this.audioContext.createGain();

        // Calculate optimal fade durations based on musical context
        const hasBpmInfo = typeof options.bpm === 'number';
        const division = segment.metadata?.originalBoundaries ? "1/4" : "1/8"; // Fallback division

        // Get optimal crossfade duration based on BPM and division
        const optimalCrossfade = hasBpmInfo
          ? calculateOptimalCrossfadeDuration(options.bpm || 120, division)
          : 0.015; // 15ms default

        // Determine and apply transition speeds
        const transitionSpeed = options.transitionSpeed || 1.0;

        // Calculate fade durations differently for different speed ranges
        // For faster transitions, we need LONGER fades to prevent clicks (counterintuitively)
        let fadeInDuration, fadeOutDuration;

        const playbackRate = options.playbackRate || 1.0;

        // NEW: Handle extreme slow playback differently
        if (playbackRate < 0.3) {
          // For extremely slow playback, use much longer fades
          const slowRateMultiplier = Math.max(2, (0.3 / playbackRate) * 1.2);
          
          fadeInDuration = options.fadeInDuration || 
            Math.max(0.15, optimalCrossfade * slowRateMultiplier);
          
          fadeOutDuration = options.fadeOutDuration || 
            Math.max(0.2, optimalCrossfade * slowRateMultiplier);
          
          console.log(`Using extended crossfades for slow rate (${playbackRate}x): in=${fadeInDuration.toFixed(3)}s, out=${fadeOutDuration.toFixed(3)}s`);
        }
        else if (transitionSpeed >= 3.5) {
          // Extreme speeds need extreme crossfade times
          const extraSpeedFactor = 3.5 + (transitionSpeed - 3.5) * 2.5; // Very aggressive scaling
          fadeInDuration = options.fadeInDuration ||
            Math.max(0.12, optimalCrossfade * extraSpeedFactor); // Minimum 120ms fade for highest speeds
          fadeOutDuration = options.fadeOutDuration ||
            Math.max(0.15, optimalCrossfade * extraSpeedFactor); // Even longer fade out

          console.log(`Using ultra-extreme crossfade: in=${fadeInDuration.toFixed(3)}s, out=${fadeOutDuration.toFixed(3)}s`);
        } else if (transitionSpeed >= 2.5) {
          // Very high speed (2.5-3.5x) needs aggressive fades
          const speedFactor = 2.2 + (transitionSpeed - 2.5) * 1.3;
          fadeInDuration = options.fadeInDuration ||
            Math.max(0.08, optimalCrossfade * speedFactor);
          fadeOutDuration = options.fadeOutDuration ||
            Math.max(0.1, optimalCrossfade * speedFactor);
        } else if (transitionSpeed >= 1.5) {
          // High speed (1.5-2.5x) needs longer fades
          const speedFactor = 1.5 + (transitionSpeed - 1.5) * 0.7;
          fadeInDuration = options.fadeInDuration ||
            Math.max(0.05, optimalCrossfade * speedFactor);
          fadeOutDuration = options.fadeOutDuration ||
            Math.max(0.06, optimalCrossfade * speedFactor);
        } else if (transitionSpeed > 1.0) {
          // Moderate high speeds still need MORE crossfade time
          const speedFactor = 1 + (transitionSpeed - 1) * 0.5;
          fadeInDuration = options.fadeInDuration ||
            Math.max(0.03, optimalCrossfade * speedFactor);
          fadeOutDuration = options.fadeOutDuration ||
            Math.max(0.035, optimalCrossfade * speedFactor);
        } else {
          // For normal/slow speeds, use the existing formula
          fadeInDuration = options.fadeInDuration ||
            (optimalCrossfade / Math.sqrt(transitionSpeed));
          fadeOutDuration = options.fadeOutDuration ||
            (optimalCrossfade / Math.sqrt(transitionSpeed));
        }

        // Limit fade durations based on segment length
        const maxFadeDuration = segment.buffer.duration * 0.4; // Increased maximum percentage
        fadeInDuration = Math.min(fadeInDuration, maxFadeDuration);
        fadeOutDuration = Math.min(fadeOutDuration, maxFadeDuration);

        // Store current fade parameters
        this.currentFadeParams = { fadeInDuration, fadeOutDuration };

        // Connect source -> gain -> master -> destination
        source.connect(gainNode);
        gainNode.connect(this.masterGainNode);

        // Connect to recording destination if available and recording
        if (this.recordingDestination) {
          gainNode.connect(this.recordingDestination);
        }

        // Store references
        this.activeSourceNodes.set(segmentId, source);
        this.gainNodes.set(segmentId, gainNode);
        this.activeGainNode = gainNode;
        this.activeSourceNode = source;

        try {
          // Start playback with proper error handling
          const startTime = options.startTime !== undefined ? options.startTime : 0;
          const endTime = options.endTime !== undefined ? options.endTime : segment.buffer.duration;
          const offset = Math.max(0, Math.min(startTime, segment.buffer.duration));
          const playDuration = Math.min(endTime - startTime, segment.buffer.duration - offset);

          // Define fade times with safety margin
          const now = this.audioContext.currentTime;
          const timeSinceLastPlay = now - this.lastPlayedTime;
          this.lastPlayedTime = now;

          // Detect speed changes to adapt crossfade strategy
          const currentRate = options.playbackRate || 1.0;
          const speedChanged = Math.abs(this.lastPlaybackRate - currentRate) > 0.1;
          this.lastPlaybackRate = currentRate;
                  
          // CRITICAL FIX: Add safety buffer to prevent automation overlap errors
          const safetyMargin = 0.005; // 5ms safety margin
          
          // Prepare gain node for crossfade if there's a previous playing segment
          if (previousGainNode && timeSinceLastPlay < 0.5) {
            try {
              // Safety check: verify the gain nodes are still active and connected
              if (!previousGainNode || isNaN(previousGainNode.gain.value)) {
                console.warn("Previous gain node is invalid, skipping crossfade");
              } else {
                // Get buffers for crossfade operations with validation
                const prevBuffer = this.getCachedSegmentBuffer(segment.id);
                
                // CRITICAL FIX: Start by canceling any scheduled values on both gain nodes
                // This prevents conflicts with any previous automation events
                const safeNow = now + safetyMargin;
                previousGainNode.gain.cancelScheduledValues(safeNow - 0.001);
                gainNode.gain.cancelScheduledValues(safeNow - 0.001);
                
                // Set initial values explicitly to avoid jumps
                previousGainNode.gain.setValueAtTime(previousGainNode.gain.value || 1, safeNow);
                gainNode.gain.setValueAtTime(0, safeNow);
                
                // Choose appropriate crossfade method based on speed and speed changes
                if (playbackRate < 0.3) {
                  // For extremely slow playback, use specialized ultra-smooth crossfade
                  console.log(`Applying ultra-smooth slow-rate crossfade (rate=${playbackRate})`);
                  
                  // Add extra timeout protection for slow playback rates
                  const timeoutId = setTimeout(() => {
                    // Emergency fallback if crossfade takes too long
                    try {
                      if (previousGainNode) previousGainNode.gain.value = 0;
                      gainNode.gain.value = 1;
                    } catch (e) {/* Ignore */}
                  }, fadeInDuration * 2500); // 2.5x fade duration in ms as backup
                  
                  try {
                    applySlowRateCrossfade(
                      previousGainNode,
                      gainNode,
                      this.audioContext,
                      fadeInDuration * 1.5, // Extended duration
                      safeNow, // Use safety margin time
                      Math.max(0.1, playbackRate) // Ensure minimum playback rate value
                    );
                    clearTimeout(timeoutId); // Clear timeout if successful
                  } catch (error) {
                    console.warn("Slow rate crossfade failed, using basic fade:", error);
                    // Simple fallback with no timing issues
                    previousGainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.cancelScheduledValues(now);
                    previousGainNode.gain.setValueAtTime(previousGainNode.gain.value || 1, now);
                    gainNode.gain.setValueAtTime(0, now);
                    previousGainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                    gainNode.gain.linearRampToValueAtTime(1, now + 0.05);
                  }
                }
                else if (transitionSpeed >= 2.0 || speedChanged) {
                  // For high speeds or speed changes, use multiband with robust error handling
                  try {
                    applyAdaptiveMultibandCrossfade(
                      previousGainNode,
                      gainNode,
                      this.audioContext,
                      prevBuffer,
                      segment.buffer,
                      fadeInDuration * (speedChanged ? 1.5 : 1.0),
                      safeNow, // Use safety margin time
                      transitionSpeed,
                      speedChanged
                    );
                  } catch (error) {
                    console.error("Multiband crossfade failed completely, using emergency fallback:", error);
                    // Emergency fallback - simplest possible crossfade
                    applySafeFallbackCrossfade(previousGainNode, gainNode, this.audioContext, 0.01);
                  }
                } else if (transitionSpeed > 1.0) {
                  // For moderately high speeds, use zero-click crossfade
                  applyZeroClickCrossfade(
                    previousGainNode, 
                    gainNode, 
                    this.audioContext, 
                    fadeInDuration,
                    safeNow, // Use safety margin time
                    transitionSpeed
                  );
                } else {
                  // For normal speeds, use phase-aligned crossfade
                  applyPhaseAlignedCrossfade(
                    previousGainNode, 
                    gainNode, 
                    this.audioContext,
                    prevBuffer,
                    segment.buffer,
                    fadeInDuration,
                    safeNow, // Use safety margin time
                    transitionSpeed
                  );
                }
              }
            } catch (crossfadeError) {
              // If crossfade fails, fall back to a simple crossfade
              console.error("Error applying advanced crossfade, using fallback:", crossfadeError);
              try {
                // Simple fallback crossfade with safety margin
                const safeTime = now + safetyMargin;
                if (previousGainNode) {
                  previousGainNode.gain.cancelScheduledValues(safeTime);
                  previousGainNode.gain.setValueAtTime(previousGainNode.gain.value || 1, safeTime);
                  previousGainNode.gain.linearRampToValueAtTime(0, safeTime + 0.05);
                }
                
                gainNode.gain.cancelScheduledValues(safeTime);
                gainNode.gain.setValueAtTime(0.0001, safeTime);
                gainNode.gain.linearRampToValueAtTime(1.0, safeTime + 0.05);
              } catch (fallbackError) {
                console.error("Even fallback crossfade failed:", fallbackError);
                // Continue playback anyway
              }
            }
          } else {
            // No crossfade needed, just apply fade in with safety margin
            const safeTime = now + safetyMargin;
            
            // CRITICAL FIX: Always cancel scheduled values before setting new ones
            gainNode.gain.cancelScheduledValues(safeTime - 0.001);
            gainNode.gain.setValueAtTime(0.0001, safeTime); // Start with tiny non-zero value
            
            // Calculate optimal envelope
            const hasTransients = segment.metadata?.sliceIndex % 4 === 0;
            const { attack } = calculateTransientEnvelope(options.bpm || 120, division, hasTransients);
            
            // Use exponential approach for smoother attack
            const timeConstant = attack / 4;
            gainNode.gain.setTargetAtTime(1.0, safeTime, timeConstant);
            
            // Ensure we reach exactly 1.0
            gainNode.gain.linearRampToValueAtTime(1.0, safeTime + attack * 3);
          }
          
          // If we know the duration, apply a fade out
          if (playDuration > 0) {
            const fadeOutStart = now + playDuration - fadeOutDuration - safetyMargin;
            
            if (playDuration > fadeOutDuration * 2) {
              // CRITICAL FIX: Add safety check for negative or invalid fade start time
              if (fadeOutStart <= now) {
                console.warn("Fade out would start in the past, skipping fade out scheduling");
              } else {
                // Schedule the gain to start fading out with very smooth curve
                gainNode.gain.setValueAtTime(1.0, fadeOutStart);
                
                // Multi-stage release for smoother result
                // Stage 1: Gentle initial decrease
                const gentleReleaseTime = fadeOutDuration * 0.3;
                gainNode.gain.setTargetAtTime(0.9, fadeOutStart, gentleReleaseTime);
                
                // Stage 2: Main decrease
                const mainReleaseStart = fadeOutStart + fadeOutDuration * 0.2;
                const mainReleaseTime = fadeOutDuration * 0.3;
                gainNode.gain.setValueAtTime(0.9, mainReleaseStart);
                gainNode.gain.setTargetAtTime(0.1, mainReleaseStart, mainReleaseTime);
                
                // Stage 3: Final approach to zero
                const finalReleaseStart = fadeOutStart + fadeOutDuration * 0.6;
                const finalReleaseTime = fadeOutDuration * 0.4;
                gainNode.gain.setValueAtTime(0.1, finalReleaseStart);
                gainNode.gain.setTargetAtTime(0.0001, finalReleaseStart, finalReleaseTime * 0.5);
                
                // Ensure we reach exactly zero
                gainNode.gain.linearRampToValueAtTime(0, now + playDuration + 0.005);
              }
            }
          }
          
          // Start the source
          source.start(0, offset, playDuration > 0 ? playDuration : undefined);
          
          // Log detailed playback information
          console.log(`Playing segment ${segment.id} (${segment.metadata?.sliceIndex ?? '?'}), offset: ${offset.toFixed(3)}, duration: ${playDuration > 0 ? playDuration.toFixed(3) : 'full'}, rate: ${options.playbackRate || 1}x, fades: in=${fadeInDuration.toFixed(3)}s, out=${fadeOutDuration.toFixed(3)}s`);
  
          // Handle completion
          source.onended = () => {
            this.cleanupPlayback(segment.id);
            resolve();
          };
        } catch (error) {
          console.error("Error starting audio playback:", error);
          this.cleanupPlayback(segment.id);
          reject(error);
        }
      } catch (error) {
        console.error('Error in playSegment:', error);
        reject(error);
      }
    });
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
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      
      // Apply the curve
      gainNode.gain.setValueCurveAtTime(curve, now, fadeTime);
      
      // Schedule stop after fade completes with a small safety margin
      setTimeout(() => {
        try {
          source.stop();
          this.cleanupPlayback(id);
        } catch (e) {
          // Ignore errors
        }
      }, (fadeTime * 1000) + 10);
    } else if (source) {
      // No gain node available, immediately stop the source
      try {
        source.stop();
        this.cleanupPlayback(id);
      } catch (e) {
        // Ignore errors
      }
    }
  }
  
  /**
   * Stop all currently playing segments
   */
  public stopAll(): void {
    // Stop all active sources with a quick fade out
    const activeSourceIds = [...this.activeSourceNodes.keys()];
    for (const id of activeSourceIds) {
      this.stopSegment(id, 0.01);
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
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(currentGain, now);
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
        // For source nodes, stop with a small delay to ensure any cleanup
        // fades have time to execute first
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
    this.sourceNodes.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Source might have already stopped
      }
    });
    this.sourceNodes.clear();
    this.activeSourceNode = null;
    this.activeSliceIndex = -1;
  }

  getActiveSliceIndex(): number {
    return this.activeSliceIndex;
  }

  getSlices(): AudioSlice[] {
    return this.slices;
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
   * Get a segment's buffer from the cache with better error handling
   */
  private getCachedSegmentBuffer(id: string): AudioBuffer | null {
    try {
      const segment = this.cache.get(id);
      return segment ? segment.buffer : null;
    } catch (e) {
      console.warn(`Error retrieving cached segment ${id}:`, e);
      return null;
    }
  }

  /**
   * Parse the division string to get the numeric value
   * For example, "1/4" returns 0.25, "1/8" returns 0.125, etc.
   */
  private getDivisionValue(division: string): number {
    if (!division || division === '') {
      return 0.25; // Default to quarter note (1/4)
    }
    
    // Handle simple fractions like "1/4", "1/8", etc.
    const parts = division.split('/');
    if (parts.length === 2) {
      const numerator = parseInt(parts[0], 10);
      const denominator = parseInt(parts[1], 10);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
    
    // Default value if parsing fails
    return 0.25; // 1/4 note
  }

  reset(): void {
    this.stopAllPlayback();
    this.audioBuffer = null;
    this.slices = [];
    this.activeSliceIndex = -1;
  }

  /**
   * Play a slice by index with specified parameters
   * @param index The index of the slice to play
   * @param playbackRate The rate at which to play (1 = normal speed)
   * @param bpm The BPM to use for timing calculations
   * @param transitionSpeed The speed for transitions between slices
   */
  public playSlice(index: number, playbackRate: number = 1, bpm: number = 120, transitionSpeed: number = 1): void {
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
        transitionSpeed
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
