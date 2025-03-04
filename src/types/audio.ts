/**
 * Audio segment metadata and types
 */

/**
 * Audio segment metadata containing technical information
 */
export interface AudioSegmentMetadata {
  startTime: number;
  duration: number;
  format?: string;
  sampleRate: number;
  channels: number;
  bitDepth?: number;
  timestamp: number;
  sliceIndex: number;
  // New fields for improved crossfading
  originalBoundaries?: {
    sliceStartTime: number;
    sliceEndTime: number;
    originalDuration: number;
  };
  overlapDuration?: number;
}

/**
 * Audio segment representing a slice of audio with its buffer and metadata
 */
export interface AudioSegment {
  id: string;
  buffer: AudioBuffer;
  metadata: AudioSegmentMetadata;
}

/**
 * Options for slicing audio files
 */
export interface SliceOptions {
  bpm: number;
  division: string; // e.g., '1/4', '1/8', '1/16'
  totalSlices?: number; // Optional number of slices to create
  preserveTail?: boolean; // Whether to include the last partial slice
  sampleAccurate?: boolean; // Whether to use sample-accurate slicing
  // New fields for BPM detection
  detectedBpm?: number;
  detectedConfidence?: number;
  autoSlice?: boolean;
}

/**
 * Options for playing back audio segments
 * Note: The AudioPlaybackEngine uses fadeInDuration and fadeOutDuration
 * for smooth transitions. All other properties are optional.
 */
export interface PlaybackOptions {
  playbackRate?: number;
  detune?: number;
  loop?: boolean;
  fadeIn?: number;      // Deprecated, use fadeInDuration instead
  fadeOut?: number;     // Deprecated, use fadeOutDuration instead
  startTime?: number;   // Position in seconds to start playback from
  endTime?: number;     // Position in seconds to end playback
  fadeInDuration?: number;  // Duration of fade in (seconds)
  fadeOutDuration?: number; // Duration of fade out (seconds)
  bpm?: number;         // Beats per minute (for dynamic fade calculations)
  transitionSpeed?: number; // Playback speed for transitions (affects fade durations)
  // New options for crossfade behavior
  crossfadeDuration?: number; // Override automatic crossfade calculation
  equalPowerCrossfade?: boolean; // Whether to use equal power crossfade (default: true)
  respectOverlaps?: boolean; // Whether to use the slice overlaps (default: true)
}

/**
 * Audio file format information
 */
export interface AudioFormat {
  type: string; // 'mp3', 'wav', 'ogg', etc.
  codec?: string;
  container?: string;
}

/**
 * Audio processor options
 */
export interface AudioProcessorOptions {
  cacheSize?: number;
  preloadStrategy?: 'eager' | 'lazy' | 'none';
  bufferSize?: number;
  crossfadeDuration?: number;
}

/**
 * Parameters for audio recorder
 */
export interface RecordingOptions {
  /** Recording audio quality (low, medium, high) */
  quality?: 'low' | 'medium' | 'high';
  /** MIME type for recording format */
  mimeType?: string;
  /** Whether to automatically stop recording after a duration */
  autoStop?: boolean;
  /** Duration in milliseconds after which to auto-stop */
  stopAfter?: number;
}

/**
 * Audio recording information
 */
export interface AudioRecording {
  id: string;
  name: string;
  url: string;
  timestamp: number;
  duration?: number;
  size?: number;
}