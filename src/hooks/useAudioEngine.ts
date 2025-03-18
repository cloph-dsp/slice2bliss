import { useState, useEffect, useCallback, useRef } from 'react';
import audioEngine, { AudioSlice } from '../services/AudioPlaybackEngine';
import { SliceOptions as OriginalSliceOptions } from '../types/audio';
import { BpmDetectionResult } from '../types/bpm';
import { detectBPM } from '../services/BpmDetectionService';
import { testBpmDetection } from '../utils/fileNameUtils';

// Add this interface if it doesn't exist
interface SliceOptions {
  bpm: number;
  slicesPerBeat: number;
  quantize: boolean;
  normalizeOutput: boolean;
}

export function useAudioEngine() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [slices, setSlices] = useState<AudioSlice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeSlice, setActiveSlice] = useState<number>(-1);

  // Keep detectedBpm state but make isDetectingBpm private (using _)
  const [detectedBpm, setDetectedBpm] = useState<BpmDetectionResult | null>(null);
  const [_isDetectingBpm, setIsDetectingBpm] = useState<boolean>(false);

  // Keep references to loaded file/buffer for BPM detection
  const fileRef = useRef<File | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);

  // Add the missing state for sliceOptions
  const [sliceOptions, setSliceOptions] = useState<SliceOptions>({
    bpm: 120,
    slicesPerBeat: 4,
    quantize: true,
    normalizeOutput: false,
  });

  // Update refs when state changes
  useEffect(() => {
    fileRef.current = audioFile;
    bufferRef.current = audioBuffer;
  }, [audioFile, audioBuffer]);

  const loadAudioFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setAudioFile(file);
    fileRef.current = file; // Set the ref immediately for fast access

    try {
      const buffer = await audioEngine.loadFile(file);
      setAudioBuffer(buffer);
      bufferRef.current = buffer; // Set the ref immediately
      setIsLoading(false);
      return buffer;
    } catch (error) {
      console.error('Error loading audio file:', error);
      setIsLoading(false);
      throw error;
    }
  }, []);

  const getBpmFromFilename = (filename: string): BpmDetectionResult | null => {
    const filenameTest = testBpmDetection(filename);
    if (filenameTest.detected && filenameTest.bpm) {
      console.log(`Quick BPM detection from filename: ${filenameTest.bpm} BPM`);

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

      return quickResult;
    }
    return null;
  };

  const getBpmFromAudioAnalysis = async (
    buffer: AudioBuffer,
    filename: string
  ): Promise<BpmDetectionResult | null> => {
    const bpm = await detectBPM(buffer, filename);

    if (bpm) {
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
      console.log(`BPM detection result: ${bpm} BPM`);
      return result;
    }
    return null;
  };

  /**
   * Simplified BPM detection using primarily filename - now works silently
   */
  const detectBpm = useCallback(async () => {
    // Get file and buffer from refs instead of state to avoid timing issues
    const file = fileRef.current;
    const buffer = bufferRef.current;

    if (!buffer || !file) {
      console.error('Cannot detect BPM: audio buffer or file not available');
      console.log('Current refs: file=', !!file, 'buffer=', !!buffer);
      return null;
    }

    setIsDetectingBpm(true);
    console.log('Starting silent BPM detection...');

    try {
      // First, try direct filename detection to avoid service overhead
      const filenameResult = getBpmFromFilename(file.name);
      if (filenameResult) {
        setDetectedBpm(filenameResult);
        setIsDetectingBpm(false);
        return filenameResult;
      }

      // If quick detection fails, use the detectBPM function
      const analysisResult = await getBpmFromAudioAnalysis(buffer, file.name);
      if (analysisResult) {
        setDetectedBpm(analysisResult);
        setIsDetectingBpm(false);
        return analysisResult;
      }

      // No valid BPM detected - don't set a default value
      setIsDetectingBpm(false);
      setDetectedBpm({
        bpm: 0,  // Use 0 to indicate no valid BPM detected
        confidence: 0,
        isValid: false,
        details: {
          onsetCount: 0,
          analysisTime: 0,
          peakThreshold: 0,
          rawBpm: 0,
          source: 'none',
          error: 'Could not detect BPM from file or audio analysis'
        }
      });
      
      return null;
    } catch (error) {
      console.error('Error in BPM detection:', error);
      setIsDetectingBpm(false);
      
      // Return null instead of a fallback with 120 BPM
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
          error: error instanceof Error ? error.message : 'Unknown error during BPM detection'
        }
      });
      
      return null;
    }
  }, [fileRef, bufferRef, setDetectedBpm, getBpmFromFilename, getBpmFromAudioAnalysis]);

  const processAudio = useCallback(async (options: OriginalSliceOptions) => {
    if (!audioBuffer || !audioFile) {
      console.error('No audio loaded');
      return false;
    }

    setIsLoading(true);

    try {
      console.log('Processing audio with options:', options);
      const generatedSlices = await audioEngine.sliceAudio(options);
      console.log(`Generated ${generatedSlices.length} slices`);
      setSlices(generatedSlices);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Error processing audio:', error);
      setIsLoading(false);
      return false;
    }
  }, [audioBuffer, audioFile]);

  const playSlice = useCallback((index: number, rate = 1, bpm = 120, transitionSpeed = 1) => {
    console.log(`Playing slice ${index} with rate=${rate}, bpm=${bpm}, transitionSpeed=${transitionSpeed}`);
    try {
      audioEngine.playSlice(index, rate, bpm, transitionSpeed);
      setActiveSlice(index);
      console.log("Slice playback initiated successfully");
    } catch (error) {
      console.error("Error during slice playback:", error);
    }
  }, []);

  const updatePlaybackRate = useCallback((rate: number) => {
    audioEngine.updatePlaybackRate(rate);
  }, []);

  const stopAllPlayback = useCallback(() => {
    audioEngine.stopAllPlayback();
    setActiveSlice(-1);
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
  }, []);

  const setStretchingQuality = useCallback((quality: 'low' | 'medium' | 'high') => {
    audioEngine.setStretchingQuality(quality);
  }, []);

  // Add the handleSliceAudio function
  const handleSliceAudio = useCallback(async () => {
    if (!bufferRef.current) {
      console.error('No audio buffer available for slicing');
      return [];
    }

    try {
      // Logic for slicing audio would go here
      console.log(`Slicing audio with BPM: ${sliceOptions.bpm}, slices per beat: ${sliceOptions.slicesPerBeat}`);
      
      // Return slices (implementation depends on your app's needs)
      return [];
    } catch (error) {
      console.error('Error slicing audio:', error);
      return [];
    }
  }, [sliceOptions]);

  const updateBpm = useCallback((newBpm: number) => {
    setSliceOptions((prev: SliceOptions) => ({
      ...prev,
      bpm: newBpm,
    }));

    // Update detected BPM state if needed
    if (detectedBpm) {
      setDetectedBpm({
        ...detectedBpm,
        bpm: newBpm,
      });
    }

    // Auto-slice if enabled
    if (sliceOptions.quantize) {
      handleSliceAudio();
    }
  }, [detectedBpm, setSliceOptions, sliceOptions, handleSliceAudio]);

  return {
    audioFile,
    audioBuffer,
    slices,
    isLoading,
    activeSlice,
    detectedBpm,
    // Do NOT expose isDetectingBpm to hide the detection process from UI
    loadAudioFile,
    detectBpm,
    processAudio,
    playSlice,
    updatePlaybackRate,
    stopAllPlayback,
    getRecordingDestination,
    setRecordingOutput,
    setActiveSlice,
    reset,
    setStretchingQuality,
    sliceOptions,
    setSliceOptions,
    handleSliceAudio,
    updateBpm
  };
}
