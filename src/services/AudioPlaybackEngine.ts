import { AudioSegment, PlaybackOptions, SliceOptions } from '../types/audio';
import { AudioCache } from './AudioCache';
import { TimeStretcher, getTimeStretcher } from './TimeStretcher';

export interface AudioSlice {
  buffer: AudioBuffer;
  metadata: {
    startTime: number;
    duration: number;
    index: number;
  };
  id: string; // Make id required, not optional
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
  private audioBuffer: AudioBuffer | null = null;
  private slices: AudioSlice[] = [];
  private activeSliceIndex: number = -1;
  private timeStretcher: TimeStretcher;
  private stretchingQuality: 'low' | 'medium' | 'high' = 'medium';
  
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
        
        // Stop any existing playback of this segment
        this.stopSegment(segment.id);
        
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
        
        if (options.playbackRate !== undefined && options.playbackRate !== 1.0) {
          // Use time-stretcher for pitch-preserving speed change
          source = this.timeStretcher.createTimeStretchedSource(
            segment.buffer,
            options.playbackRate,
            true,  // Always preserve pitch
            this.stretchingQuality
          );
        } else {
          // Use regular source for normal playback
          source = this.audioContext.createBufferSource();
          source.buffer = segment.buffer;
        }
        
        // Create gain node for this source (for fades)
        const gainNode = this.audioContext.createGain();
        
        // Calculate dynamic fade durations based on BPM and transition speed
        let fadeInDuration = options.fadeInDuration || 0.015;  // Default 15ms fade in
        let fadeOutDuration = options.fadeOutDuration || 0.015; // Default 15ms fade out
        
        // If we have bpm and transitionSpeed in options, calculate dynamic fade times
        if (options.bpm && options.transitionSpeed) {
          // Calculate beat duration in seconds
          const beatDuration = 60 / options.bpm;
          
          // Calculate fade proportion based on transition speed
          // Slower transitions (lower values) get longer fades as a percentage of beat
          // 1.0 speed = 10% of beat, 0.25 speed = 40% of beat
          const fadeInProportion = Math.min(0.4, 0.1 / Math.sqrt(options.transitionSpeed));
          const fadeOutProportion = Math.min(0.5, 0.12 / Math.sqrt(options.transitionSpeed));
          
          // Calculate actual fade durations
          fadeInDuration = Math.min(beatDuration * fadeInProportion, 0.25); // Cap at 250ms
          fadeOutDuration = Math.min(beatDuration * fadeOutProportion, 0.35); // Cap at 350ms
          
          // Ensure minimum fade times for musical smoothness
          fadeInDuration = Math.max(0.01, fadeInDuration);  // At least 10ms
          fadeOutDuration = Math.max(0.015, fadeOutDuration); // At least 15ms
          
          console.log(`Dynamic fades: in=${fadeInDuration.toFixed(3)}s, out=${fadeOutDuration.toFixed(3)}s (BPM: ${options.bpm}, speed: ${options.transitionSpeed})`);
        }
        
        // Start with zero gain for fade in
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        
        // Connect source -> gain -> master -> destination
        source.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        // Connect to recording destination if available and recording
        if (this.recordingDestination) {
          gainNode.connect(this.recordingDestination);
        }
        
        // Store references
        this.activeSourceNodes.set(segment.id, source);
        this.gainNodes.set(segment.id, gainNode);
        
        try {
          // Start playback with proper error handling
          const startTime = options.startTime !== undefined ? options.startTime : 0;
          const endTime = options.endTime !== undefined ? options.endTime : segment.buffer.duration;
          const offset = Math.max(0, Math.min(startTime, segment.buffer.duration));
          const playDuration = Math.min(endTime - startTime, segment.buffer.duration - offset);
          
          // Define fade times 
          const now = this.audioContext.currentTime;
          const fadeInEnd = now + fadeInDuration;
          
          // Apply the fade in
          gainNode.gain.linearRampToValueAtTime(1.0, fadeInEnd);
          
          // If we know the duration, apply a fade out
          if (playDuration > 0) {
            const fadeOutStart = now + playDuration - fadeOutDuration;
            
            // Only apply fade out if we have enough duration
            if (playDuration > fadeOutDuration * 2) {
              // Schedule the gain to start fading out
              gainNode.gain.setValueAtTime(1.0, fadeOutStart);
              gainNode.gain.linearRampToValueAtTime(0.0, now + playDuration);
            }
          }
          
          source.start(0, offset, playDuration > 0 ? playDuration : undefined);
          
          // FIX: Safely access metadata properties with proper null/undefined checks
          let sliceIndexInfo = '?';
          if (segment.metadata) {
            if (segment.metadata.sliceIndex !== undefined) {
              sliceIndexInfo = segment.metadata.sliceIndex.toString();
            } else if ((segment.metadata as any).index !== undefined) {
              sliceIndexInfo = (segment.metadata as any).index.toString();
            }
          }
          
          console.log(`Playing segment ${segment.id} (${sliceIndexInfo}), offset: ${offset}, duration: ${playDuration > 0 ? playDuration : 'full'}, rate: ${options.playbackRate || 1}x, fades: in=${fadeInDuration.toFixed(3)}s, out=${fadeOutDuration.toFixed(3)}s`);
  
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
      try {
        // Apply a quick fade out before stopping
        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);
        
        // Schedule stop after fade completes
        setTimeout(() => {
          try {
            source.stop();
          } catch (e) {
            // Ignore errors if already stopped
          }
          this.cleanupPlayback(id);
        }, fadeTime * 1000);
      } catch (e) {
        // Fallback to immediate stop if scheduling fails
        try {
          source.stop();
        } catch (e) {
          // Ignore errors if already stopped
        }
        this.cleanupPlayback(id);
      }
    } else if (source) {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      this.cleanupPlayback(id);
    }
  }
  
  /**
   * Stop all currently playing segments
   */
  public stopAll(): void {
    for (const id of this.activeSourceNodes.keys()) {
      this.stopSegment(id);
    }
  }
  
  /**
   * Set master volume
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
   * Clean up resources for a segment
   */
  private cleanupPlayback(id: string): void {
    const source = this.activeSourceNodes.get(id);
    const gainNode = this.gainNodes.get(id);
    
    if (source) {
      source.disconnect();
      this.activeSourceNodes.delete(id);
    }
    
    if (gainNode) {
      gainNode.disconnect();
      this.gainNodes.delete(id);
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
      
      // Calculate time per beat in seconds
      const secondsPerBeat = 60 / bpm;
      
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
          
          // Create a new buffer for this slice
          const sliceBuffer = this.audioContext.createBuffer(
            this.audioBuffer.numberOfChannels,
            Math.floor(actualDuration * this.audioBuffer.sampleRate),
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

  playSlice(index: number, rate = 1, bpm = 120, transitionSpeed = 1): void {
    if (!this.audioContext || !this.masterGainNode || index >= this.slices.length) {
      return;
    }
  
    // Resume audio context if it's suspended
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  
    // Stop any currently playing slice
    this.stopAllPlayback();
  
    const slice = this.slices[index];
    
    // Create a new buffer source node with time-stretching
    let source: AudioBufferSourceNode;
    
    if (rate !== 1) {
      // Use time-stretcher for pitch-preserving playback rate
      source = this.timeStretcher.createTimeStretchedSource(
        slice.buffer,
        rate,
        true,  // Preserve pitch
        this.stretchingQuality
      );
    } else {
      // Use regular source for normal playback
      source = this.audioContext.createBufferSource();
      source.buffer = slice.buffer;
    }
    
    // Create a gain node for volume and fades
    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    
    // Connect source → gain → master output
    source.connect(gainNode);
    gainNode.connect(this.masterGainNode);
    
    // Calculate dynamic fade durations based on BPM and transition speed
    const beatDuration = 60 / bpm; // seconds per beat
    
    // Calculate fade proportions as a percentage of beat length
    const fadeInDuration = Math.min(0.25, beatDuration * (0.1 / Math.sqrt(transitionSpeed)));
    const fadeOutDuration = Math.min(0.35, beatDuration * (0.15 / Math.sqrt(transitionSpeed)));
    
    // Apply fade in
    gainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + fadeInDuration);
    
    // Schedule fade out
    const sliceDuration = slice.buffer.duration / (rate || 1);
    const fadeOutStart = this.audioContext.currentTime + sliceDuration - fadeOutDuration;
    gainNode.gain.setValueAtTime(1, fadeOutStart);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + sliceDuration);
    
    // Store references for later control
    this.activeSourceNode = source;
    this.activeSliceIndex = index;
    this.sourceNodes.set(index, source);
    
    // Set up completion handler
    source.onended = () => {
      this.activeSourceNode = null;
      this.activeSliceIndex = -1;
      this.sourceNodes.delete(index);
    };
    
    // Start playback
    source.start();
    console.log(`Playing slice ${index} at rate ${rate}, BPM ${bpm}, transition speed ${transitionSpeed}, fades: in=${fadeInDuration.toFixed(3)}s, out=${fadeOutDuration.toFixed(3)}s`);
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

  getRecordingDestination(): MediaStreamAudioDestinationNode | null {
    return this.recordingDestination;
  }

  reset(): void {
    this.stopAllPlayback();
    this.audioBuffer = null;
    this.slices = [];
    this.activeSliceIndex = -1;
  }

  private getDivisionValue(division: string): number {
    switch (division) {
      case '1/1': return 4;
      case '1/2': return 2;
      case '1/4': return 1;
      case '1/8': return 0.5;
      case '1/16': return 0.25;
      case '1/32': return 0.125;
      default: return 1; // Default to quarter notes (1/4)
    }
  }

  /**
   * Enable recording by connecting sources to recording destination
   */
  public enableRecording(): void {
    if (!this.recordingDestination) {
      console.error("No recording destination available");
      return;
    }
    
    console.log("Enabling recording to destination");
    
    // Connect master gain to recording destination
    try {
      this.masterGainNode.connect(this.recordingDestination);
      console.log("Connected master gain to recording destination");
    } catch (e) {
      console.error("Failed to connect master gain to recording destination:", e);
    }
  }
  
  /**
   * Disable recording by disconnecting sources from recording destination
   */
  public disableRecording(): void {
    if (!this.recordingDestination) {
      return;
    }
    
    console.log("Disabling recording");
    
    // Disconnect master gain from recording destination
    try {
      this.masterGainNode.disconnect(this.recordingDestination);
      console.log("Disconnected master gain from recording destination");
    } catch (e) {
      console.error("Error disconnecting from recording destination:", e);
    }
  }

  /**
   * Get the audio context
   */
  public getAudioContext(): AudioContext {
    return this.audioContext;
  }

  /**
   * Update playback rate for all currently playing sources
   */
  public updatePlaybackRate(rate: number): void {
    if (this.activeSourceNode) {
      try {
        // For real-time rate changes, we need to use detune to preserve pitch
        const now = this.audioContext.currentTime;
        
        // Apply playback rate directly (changes speed)
        this.activeSourceNode.playbackRate.setValueAtTime(rate, now);
        
        // Apply inverse detune to compensate pitch (100 cents = 1 semitone)
        const pitchCompensation = -1200 * Math.log2(rate);
        
        // Only try to set detune if the property exists (some older browsers might not support it)
        if (this.activeSourceNode.detune) {
          this.activeSourceNode.detune.setValueAtTime(pitchCompensation, now);
        }
        
        console.log(`Updated playback rate to ${rate}x with pitch preservation`);
      } catch (error) {
        console.warn("Error updating playback rate:", error);
      }
    }
  }

  /**
   * Update playback rate for a specific slice
   */
  public updateSlicePlaybackRate(id: string, rate: number): boolean {
    const source = this.activeSourceNodes.get(id);
    if (!source) return false;
    
    try {
      const now = this.audioContext.currentTime;
      const playbackRate = Math.max(0.25, Math.min(4.0, rate));
      source.playbackRate.cancelScheduledValues(now);
      source.playbackRate.setValueAtTime(source.playbackRate.value, now);
      source.playbackRate.linearRampToValueAtTime(playbackRate, now + 0.05);
      return true;
    } catch (error) {
      console.warn(`Error updating playback rate for slice ${id}:`, error);
      return false;
    }
  }
}

// Create a single shared AudioContext
const sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

// Create recording destination
const recordingDestination = sharedAudioContext.createMediaStreamDestination();
console.log("Created media stream destination:", recordingDestination);

// Create and export a singleton instance as default export
const audioEngine = new AudioPlaybackEngine(
  sharedAudioContext,
  sharedAudioContext.destination,
  recordingDestination
);

export default audioEngine;
