import { AudioSegment, PlaybackOptions } from '../types/audio';
import { AudioCache } from './AudioCache';

export class AudioPlaybackEngine {
  private audioContext: AudioContext;
  private cache: AudioCache;
  private activeSourceNodes: Map<string, AudioBufferSourceNode>;
  private gainNodes: Map<string, GainNode>;
  private masterGainNode: GainNode;
  private destinationNode: AudioNode;
  private recordingDestination: MediaStreamAudioDestinationNode | null;
  
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
    
    this.destinationNode = destination;
    this.recordingDestination = recordingDestination;
  }
  
  /**
   * Play an audio segment with options
   */
  public playSegment(
    segment: AudioSegment, 
    options: PlaybackOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
        
        // Stop any existing playback of this segment
        this.stopSegment(segment.id);
        
        // Add to cache for future quick access
        this.cache.set(segment);
        
        // Create source node
        const source = this.audioContext.createBufferSource();
        source.buffer = segment.buffer;
        
        // Set playback rate if specified
        if (options.playbackRate !== undefined) {
          const playbackRate = Math.max(0.5, Math.min(2.0, options.playbackRate));
          try {
            source.playbackRate.value = playbackRate;
          } catch (error) {
            console.error("Error setting playback rate:", error);
          }
        }
        // Set detune if specified
        if (options.detune !== undefined) {
          source.detune.value = options.detune;
        }
        
        // Set loop if specified
        if (options.loop !== undefined) {
          source.loop = options.loop;
        }
        
        // Create gain node for this source (for fades)
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 1.0;
        
        // Connect source -> gain -> master -> destination
        source.connect(gainNode);
        gainNode.connect(this.masterGainNode);
        
        // Connect to recording destination if available and recording
        if (this.recordingDestination) {
          gainNode.connect(this.recordingDestination);
        }
        
        // Apply fade in if specified
        if (options.fadeIn && options.fadeIn > 0) {
          gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
          gainNode.gain.linearRampToValueAtTime(
            1.0, 
            this.audioContext.currentTime + options.fadeIn
          );
        }
        
        // Store references
        this.activeSourceNodes.set(segment.id, source);
        this.gainNodes.set(segment.id, gainNode);
        
        // Calculate duration based on playback rate and buffer duration
        const playbackRate = options.playbackRate || 1;
        const duration = segment.buffer.duration / playbackRate;
        
        // Apply fade out if specified
        if (options.fadeOut && options.fadeOut > 0) {
          const startFadeTime = this.audioContext.currentTime + duration - options.fadeOut;
          gainNode.gain.setValueAtTime(1.0, startFadeTime);
          gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);
        }
        
        // Start playback
        const startTime = options.startTime !== undefined ? options.startTime : 0;
        const endTime = options.endTime !== undefined ? options.endTime : segment.buffer.duration;
        const offset = Math.max(0, Math.min(startTime, segment.buffer.duration));
        const duration2 = Math.min(endTime - startTime, segment.buffer.duration - offset);
        
        source.start(0, offset, duration2 > 0 ? duration2 : undefined);
        
        console.log(`Playing segment ${segment.id} (${segment.metadata.sliceIndex}), offset: ${offset}, duration2: ${duration2}, duration: ${duration}s`);

        // Handle completion
        source.onended = () => {
          this.cleanupPlayback(segment.id);
          resolve();
        };
      } catch (error) {
        console.error('Error playing segment:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Stop playback of a specific segment
   */
  public stopSegment(id: string): void {
    const source = this.activeSourceNodes.get(id);
    if (source) {
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
    this.recordingDestination = recordingDestination;
    
    // Update all active gain nodes to connect/disconnect from recording destination
    if (recordingDestination) {
      for (const gainNode of this.gainNodes.values()) {
        gainNode.connect(recordingDestination);
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
}
