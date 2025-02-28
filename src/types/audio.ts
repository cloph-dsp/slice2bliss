/**
 * Audio segment metadata and types
 */

export interface AudioSegment {
  id: string;
  buffer: AudioBuffer;
  metadata: AudioSegmentMetadata;
}

export interface AudioSegmentMetadata {
  startTime: number;
  duration: number;
  format: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  timestamp: number;
  sliceIndex: number;
}

export type AudioFormat = 'wav' | 'mp3' | 'ogg' | 'aac' | 'flac' | 'unknown';

export interface PlaybackOptions {
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  playbackRate?: number;
  detune?: number;
  startTime?: number;
  endTime?: number;
}

export interface AudioProcessorOptions {
  cacheSize?: number;
  preloadStrategy?: 'eager' | 'lazy' | 'none';
  bufferSize?: number;
  crossfadeDuration?: number;
}