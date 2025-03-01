import { useState, useCallback, useRef, useEffect } from 'react';
import audioEngine, { AudioSlice } from '../services/AudioPlaybackEngine';
import { SliceOptions, PlaybackOptions, AudioSegment, AudioSegmentMetadata } from '../types/audio';

export const useAudioEngine = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [slices, setSlices] = useState<AudioSlice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSlice, setActiveSlice] = useState<number>(-1);
  const audioLoaded = useRef(false);
  const recordingEnabled = useRef(false);

  // Initialize audio context and recording destination on mount
  useEffect(() => {
    // Ensure audio context is running when needed
    const handleUserInteraction = () => {
      if (audioEngine.getAudioContext().state === 'suspended') {
        audioEngine.getAudioContext().resume();
      }
    };

    window.addEventListener('click', handleUserInteraction);
    window.addEventListener('keydown', handleUserInteraction);

    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);

  const loadAudioFile = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const buffer = await audioEngine.loadFile(file);
      setAudioFile(file);
      setAudioBuffer(buffer || null); // Store the audio buffer
      setSlices([]);
      audioLoaded.current = true;
      return true;
    } catch (error) {
      console.error('Error loading audio file:', error);
      audioLoaded.current = false;
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const processAudio = useCallback(async (options: SliceOptions) => {
    if (!audioLoaded.current) {
      console.error('Cannot process audio: Audio not yet loaded');
      return false;
    }
    
    setIsLoading(true);
    try {
      console.log('Processing audio with options:', options);
      const newSlices = await audioEngine.sliceAudio(options);
      console.log(`Created ${newSlices.length} slices`);
      setSlices(newSlices);
      return true;
    } catch (error) {
      console.error('Error processing audio:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePlaybackRate = useCallback((rate: number) => {
    audioEngine.updatePlaybackRate(rate);
  }, []);

  const playSlice = useCallback((index: number, rate = 1, bpm = 120, transitionSpeed = 1) => {
    audioEngine.playSlice(index, rate, bpm, transitionSpeed);
    setActiveSlice(index);
    
    // Set up a small interval to track active slice from the engine
    const checkActive = setInterval(() => {
      const currentActiveSlice = audioEngine.getActiveSliceIndex();
      if (currentActiveSlice !== index) {
        setActiveSlice(currentActiveSlice);
        clearInterval(checkActive);
      }
    }, 100);
    
    // Clear interval after maximum expected duration
    setTimeout(() => clearInterval(checkActive), 10000);
  }, []);

  const stopAllPlayback = useCallback(() => {
    audioEngine.stopAllPlayback();
    setActiveSlice(-1);
  }, []);

  const getRecordingDestination = useCallback(() => {
    console.log("Getting recording destination:", audioEngine.getRecordingDestination());
    return audioEngine.getRecordingDestination();
  }, []);

  const setRecordingOutput = useCallback((enabled: boolean) => {
    console.log("Setting recording output:", enabled);
    recordingEnabled.current = enabled;
    
    // Enable/disable recording by connecting/disconnecting the destination
    if (enabled) {
      audioEngine.enableRecording();
    } else {
      audioEngine.disableRecording();
    }
    
    return enabled;
  }, []);

  const setStretchingQuality = useCallback((quality: 'low' | 'medium' | 'high') => {
    audioEngine.setStretchingQuality(quality);
  }, []);

  const reset = useCallback(() => {
    audioEngine.reset();
    setAudioFile(null);
    setAudioBuffer(null);
    setSlices([]);
    setActiveSlice(-1);
    audioLoaded.current = false;
  }, []);

  return {
    audioFile,
    audioBuffer, // Include audioBuffer in the return
    slices,
    isLoading,
    activeSlice,
    setActiveSlice, // Include setActiveSlice in the return
    loadAudioFile,
    processAudio,
    playSlice,
    updatePlaybackRate,
    stopAllPlayback,
    getRecordingDestination,
    setRecordingOutput,
    reset,
    setStretchingQuality, // Add this to the returned object
  };
};
