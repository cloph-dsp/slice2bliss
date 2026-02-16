import { useState, useEffect, useCallback, useRef } from 'react';
import audioEngine, { AudioSlice } from '../services/AudioPlaybackEngine';
import {
  AudioQualityMetrics,
  SchedulerConfig,
  SliceOptions as EngineSliceOptions,
  StretchMode,
} from '../types/audio';
import { BpmDetectionResult } from '../types/bpm';
import { detectBPM } from '../services/BpmDetectionService';
import { testBpmDetection } from '../utils/fileNameUtils';

const DEFAULT_QUALITY_METRICS: AudioQualityMetrics = {
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

export function useAudioEngine() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [slices, setSlices] = useState<AudioSlice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeSlice, setActiveSlice] = useState<number>(-1);
  const [detectedBpm, setDetectedBpm] = useState<BpmDetectionResult | null>(null);
  const [schedulerState, setSchedulerState] = useState<{ running: boolean; schedulerDriftMs: number }>({
    running: false,
    schedulerDriftMs: 0,
  });
  const [qualityMetrics, setQualityMetrics] = useState<AudioQualityMetrics>(DEFAULT_QUALITY_METRICS);
  const [currentCrossfadeDuration, setCurrentCrossfadeDuration] = useState<number>(0);

  const fileRef = useRef<File | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    fileRef.current = audioFile;
    bufferRef.current = audioBuffer;
  }, [audioFile, audioBuffer]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSchedulerState(audioEngine.getSchedulerState());
      setQualityMetrics(audioEngine.getQualityMetrics());
      setCurrentCrossfadeDuration(audioEngine.getCurrentCrossfadeDuration());
    }, 150);

    return () => window.clearInterval(id);
  }, []);

  const loadAudioFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setAudioFile(file);
    fileRef.current = file;

    try {
      const buffer = await audioEngine.loadFile(file);
      setAudioBuffer(buffer);
      bufferRef.current = buffer;
      return buffer;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const detectBpm = useCallback(async () => {
    const file = fileRef.current;
    const buffer = bufferRef.current;

    if (!buffer || !file) {
      return null;
    }

    const filenameTest = testBpmDetection(file.name);
    if (filenameTest.detected && filenameTest.bpm) {
      const quickResult: BpmDetectionResult = {
        bpm: filenameTest.bpm,
        confidence: filenameTest.confidence,
        isValid: true,
        details: {
          onsetCount: 0,
          analysisTime: 0,
          peakThreshold: 0,
          rawBpm: filenameTest.bpm,
          source: 'filename',
        },
      };
      setDetectedBpm(quickResult);
      return quickResult;
    }

    try {
      const bpm = await detectBPM(buffer, file.name);
      if (!bpm) return null;

      const result: BpmDetectionResult = {
        bpm,
        confidence: 1,
        isValid: true,
        details: {
          onsetCount: 0,
          analysisTime: 0,
          peakThreshold: 0,
          rawBpm: bpm,
          source: 'audio-analysis',
        },
      };

      setDetectedBpm(result);
      return result;
    } catch (error) {
      setDetectedBpm({
        bpm: 0,
        confidence: 0,
        isValid: false,
        details: {
          onsetCount: 0,
          analysisTime: 0,
          peakThreshold: 0,
          rawBpm: 0,
          source: 'none',
          error: error instanceof Error ? error.message : 'Unknown BPM detection error',
        },
      });
      return null;
    }
  }, []);

  const processAudio = useCallback(async (options: EngineSliceOptions) => {
    if (!audioBuffer || !audioFile) return false;
    setIsLoading(true);
    try {
      const generatedSlices = await audioEngine.sliceAudio(options);
      setSlices(generatedSlices);
      return true;
    } catch (error) {
      console.error('Error processing audio:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [audioBuffer, audioFile]);

  const playSlice = useCallback((index: number, rate = 1, bpm = 120, transitionSpeed = 1, division = '1/4') => {
    audioEngine.playSlice(index, rate, bpm, transitionSpeed, undefined, division);
    setActiveSlice(index);
  }, []);

  const startRandomPlayback = useCallback((config?: Partial<{
    playbackRate: number;
    bpm: number;
    division: string;
    transitionSpeed: number;
  }>) => {
    audioEngine.startRandomPlayback(config);
    setSchedulerState(audioEngine.getSchedulerState());
  }, []);

  const stopRandomPlayback = useCallback(() => {
    audioEngine.stopRandomPlayback();
    setActiveSlice(-1);
    setSchedulerState(audioEngine.getSchedulerState());
  }, []);

  const updatePlaybackRate = useCallback((rate: number) => {
    audioEngine.updatePlaybackRate(rate);
  }, []);

  const setSchedulerConfig = useCallback((config: Partial<SchedulerConfig>) => {
    audioEngine.setSchedulerConfig(config);
    setSchedulerState(audioEngine.getSchedulerState());
  }, []);

  const stopAllPlayback = useCallback(() => {
    audioEngine.stopAllPlayback();
    setActiveSlice(-1);
    setSchedulerState(audioEngine.getSchedulerState());
  }, []);

  const getRecordingDestination = useCallback(() => {
    return audioEngine.getRecordingDestination();
  }, []);

  const setRecordingOutput = useCallback((enabled: boolean) => {
    if (enabled) {
      audioEngine.enableRecording();
    } else {
      audioEngine.disableRecording();
    }
  }, []);

  const reset = useCallback(() => {
    audioEngine.reset();
    setAudioFile(null);
    setAudioBuffer(null);
    setSlices([]);
    setActiveSlice(-1);
    setDetectedBpm(null);
    setSchedulerState(audioEngine.getSchedulerState());
    setQualityMetrics(audioEngine.getQualityMetrics());
    setCurrentCrossfadeDuration(audioEngine.getCurrentCrossfadeDuration());
  }, []);

  const setStretchingQuality = useCallback((quality: 'low' | 'medium' | 'high') => {
    audioEngine.setStretchingQuality(quality);
  }, []);

  const setStretchMode = useCallback((mode: StretchMode) => {
    audioEngine.setStretchMode(mode);
    setQualityMetrics(audioEngine.getQualityMetrics());
  }, []);

  const setSmoothnessBias = useCallback((value: number) => {
    audioEngine.setSmoothnessBias(value);
  }, []);

  return {
    audioFile,
    audioBuffer,
    slices,
    isLoading,
    activeSlice,
    detectedBpm,
    schedulerState,
    qualityMetrics,
    currentCrossfadeDuration,
    loadAudioFile,
    detectBpm,
    processAudio,
    playSlice,
    startRandomPlayback,
    stopRandomPlayback,
    setSchedulerConfig,
    updatePlaybackRate,
    stopAllPlayback,
    getRecordingDestination,
    setRecordingOutput,
    setActiveSlice,
    reset,
    setStretchingQuality,
    setStretchMode,
    setSmoothnessBias,
  };
}
