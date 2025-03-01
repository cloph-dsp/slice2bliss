import { AudioSegment, PlaybackOptions, SliceOptions } from '../types/audio';
import { AudioCache } from './AudioCache';

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
        
        // Create source node
        const source = this.audioContext.createBufferSource();
        source.buffer = segment.buffer;
        
        // Set playback rate if specified with enhanced error handling
        if (options.playbackRate !== undefined) {
          const playbackRate = Math.max(0.25, Math.min(4.0, options.playbackRate));
          try {
            source.playbackRate.setValueAtTime(playbackRate, this.audioContext.currentTime);
          } catch (error) {
            console.warn("Error setting playback rate:", error);
            // Continue with default rate if there's an error
          }
        }
        
        // Create gain node for this source (for fades)
        const gainNode = this.audioContext.createGain();
        
        // Setup fade parameters
        const fadeInDuration = options.fadeInDuration || 0.015; // Default 15ms fade in
        const fadeOutDuration = options.fadeOutDuration || 0.015; // Default 15ms fade out
        
        // Start with zero gain for fade in
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        
        // Connect source -> gain -> master -> destination
        source.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        // Connect to recording destination if available and recording
        if (this.recordingDestination) {
          gainNode.connect(this.recordingDestination);
        }
        
        // Calculate playback rate (removed unused duration variable)
        const playbackRate = options.playbackRate || 1;
        
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
          
          console.log(`Playing segment ${segment.id} (${sliceIndexInfo}), offset: ${offset}, duration: ${playDuration > 0 ? playDuration : 'full'}, rate: ${playbackRate}x`);
  
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

  async loadFile(file: File): Promise<void> {
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
                  
      return Promise.resolve();
    } catch (error) {
      console.error('Error loading audio file:', error);
      this.audioBuffer = null;
      return Promise.reject('Failed to load audio file');
    }
  }

  async sliceAudio(options: SliceOptions): Promise<AudioSlice[]> {
    console.log('AudioPlaybackEngine.sliceAudio called with options:', options);
    console.log('Audio context state:', this.audioContext?.state);
    console.log('Audio buffer exists:', !!this.audioBuffer);
  
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
    }
    
    console.log(`Created ${slices.length} slices`);
    
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
  }

  playSlice(index: number, rate = 1): void {
    if (!this.audioContext || !this.masterGainNode || index >= this.slices.length) {
      return;
    }

    // Resume audio context if it's suspended
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Don't stop currently playing slice if it's the same one, just update the rate
    if (this.activeSliceIndex === index && this.activeSourceNode) {
      try {
        const now = this.audioContext.currentTime;
        this.activeSourceNode.playbackRate.setValueAtTime(
          this.activeSourceNode.playbackRate.value, now);
        this.activeSourceNode.playbackRate.linearRampToValueAtTime(rate, now + 0.05);
        return; // Exit early since we're just updating the current slice
      } catch (e) {
        // If updating fails, continue to stop and restart
        console.warn("Failed to update rate for current slice, restarting playback:", e);
      }
    }

    // Stop any currently playing slice
    this.stopAllPlayback();

    const slice = this.slices[index];
    const source = this.audioContext.createBufferSource();
    source.buffer = slice.buffer;
    source.playbackRate.value = rate;
    source.connect(this.masterGainNode);
    
    // Connect to recording destination if available
    if (this.recordingDestination) {
      source.connect(this.recordingDestination);
    }
    
    // Store the source node so we can stop it later
    this.sourceNodes.set(index, source);
    this.activeSourceNode = source;
    this.activeSliceIndex = index;
    
    source.start();
    source.onended = () => {
      this.sourceNodes.delete(index);
      if (this.activeSourceNode === source) {
        this.activeSourceNode = null;
        this.activeSliceIndex = -1;
      }
    };
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
    const now = this.audioContext.currentTime;
    
    // Update all active source nodes
    for (const source of this.activeSourceNodes.values()) {
      try {
        // Apply rate smoothly over a very short time to avoid clicks
        const playbackRate = Math.max(0.25, Math.min(4.0, rate));
        source.playbackRate.cancelScheduledValues(now);
        source.playbackRate.setValueAtTime(source.playbackRate.value, now);
        source.playbackRate.linearRampToValueAtTime(playbackRate, now + 0.05);
      } catch (error) {
        console.warn("Error updating playback rate:", error);
      }
    }
    
    console.log(`Updated playback rate to ${rate}x for ${this.activeSourceNodes.size} source(s)`);
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
