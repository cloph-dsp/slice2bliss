import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Disc, Upload, Play, Pause, Download, Loader, Edit } from 'lucide-react';
import { SliceOptions } from './types/audio';
import useAudioRecorder from './hooks/useAudioRecorder';
import { useAudioEngine } from './hooks/useAudioEngine';
// Import the AudioPlaybackEngine singleton directly
import audioEngineInstance from './services/AudioPlaybackEngine';

import Header from './components/Header';
import FileUploader from './components/FileUploader';
import SliceConfig from './components/SliceConfig';
import SliceGrid from './components/SliceGrid';
import PlaybackControls from './components/PlaybackControls';
import RecordingsList from './components/RecordingsList';

interface RecorderRecording {
  id: string;
  name: string;
  url: string;
  timestamp: number;
  size?: number;
  duration?: number;
  blob: Blob;
}

function App() {
  console.log("App component loaded");
  const {
    audioFile,
    audioBuffer,
    slices,
    isLoading: hookLoading,
    activeSlice,
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
    setStretchingQuality
  } = useAudioEngine();

  const [localLoading, setLocalLoading] = useState(false);

  const isLoading = hookLoading || localLoading;

  const {
    isRecording,
    recordings,
    currentlyPlaying,
    startRecording,
    stopRecording,
    downloadRecording,
    playPauseRecording,
    deleteRecording,
  } = useAudioRecorder();

  useEffect(() => {
    console.log("Recordings state updated:", recordings);
    console.log("Has recordings:", recordings.length > 0);
  }, [recordings]);

  // State for UI
  const [showConfig, setShowConfig] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [slicePlaybackRate, setSlicePlaybackRate] = useState(1);
  const [transitionPlaybackRate, setTransitionPlaybackRate] = useState(0.5);
  const [debouncedSliceRate, setDebouncedSliceRate] = useState(1);
  const [debouncedTransRate, setDebouncedTransRate] = useState(0.5);
  const [bpm, setBpm] = useState(120);
  const [division, setDivision] = useState("1/4");
  const [stretchingQuality, setStretchingQualityState] = useState<'low' | 'medium' | 'high'>('medium');
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const rateChangeTimeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const currentIndex = useRef<number>(-1);

  // Handle rate changes with debounce
  useEffect(() => {
    if (!isPlaying && activeSlice === -1) return;
    updatePlaybackRate(slicePlaybackRate);

    if (rateChangeTimeoutRef.current) {
      window.clearTimeout(rateChangeTimeoutRef.current);
    }

    rateChangeTimeoutRef.current = window.setTimeout(() => {
      setDebouncedSliceRate(slicePlaybackRate);
      setDebouncedTransRate(transitionPlaybackRate);

      if (isPlaying && debouncedTransRate !== transitionPlaybackRate) {
        handleRestartPlayback();
      }
    }, 300);

    return () => {
      if (rateChangeTimeoutRef.current) {
        window.clearTimeout(rateChangeTimeoutRef.current);
      }
    };
  }, [slicePlaybackRate, transitionPlaybackRate, isPlaying, activeSlice, updatePlaybackRate, debouncedTransRate]);

  const setInitialBpm = (detectedBpm: number | null) => {
    if (detectedBpm) {
      console.log(`✅ BPM detected: ${detectedBpm}`);
      setBpm(detectedBpm);
    } else {
      console.log(`⚠️ No BPM detected, using default 120`);
      setBpm(120);
    }
  };

  const handleAudioProcessingError = (error: any) => {
    console.error("❌ Error processing audio:", error);
    setLocalLoading(false);
    alert("Failed to process audio. Please try again.");
  };

  const loadAndProcessAudio = async (file: File) => {
    console.log(`🔄 Loading file: "${file.name}"`);
    setLocalLoading(true);
    try {
      const buffer = await loadAudioFile(file);

      if (!buffer) {
        console.error("❌ Failed to load audio buffer");
        setLocalLoading(false);
        alert("Failed to load audio file. Please try again.");
        return false;
      }

      return true;

    } catch (error) {
      handleAudioProcessingError(error);
      return false;
    }
  };

  // Handle file upload
  const handleFileUpload = async (file: File, detectedBpm: number | null) => {

    setInitialBpm(detectedBpm);

    const success = await loadAndProcessAudio(file);
    if (!success) return;

    setTimeout(() => {
      console.log(`🎵 Using BPM: ${bpm}`);
      setLocalLoading(false);
      setShowConfig(true);
    }, 200);
  };

  // Handle file input change
  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, null);
    }
  };

  // slice configuration
  const handleApplyConfig = async (options: SliceOptions) => {
    try {
      console.log('App: Applying slice configuration:', options);
      const success = await processAudio(options);
      setShowConfig(false);
      return success;
    } catch (error) {
      handleAudioProcessingError(error);
      return false;
    }
  };

    // playback of a slice
  const handleSliceClick = (index: number) => {
    // BPM and transition speed
    playSlice(index, slicePlaybackRate, bpm, transitionPlaybackRate);
  };

  // Random playback logic
  const handleRestartPlayback = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!slices || slices.length === 0) {
      stopAllPlayback();
      setIsPlaying(false);
      return;
    }

    const playRandomSlice = () => {
      const randomIndex = Math.floor(Math.random() * slices.length);
      currentIndex.current = randomIndex;
      // BPM and transition speed
      playSlice(randomIndex, slicePlaybackRate, bpm, transitionPlaybackRate);
    };

    // random slice playback
    playRandomSlice();

    const intervalMs = calculateInterval();
    intervalRef.current = window.setInterval(playRandomSlice, intervalMs);
  };

  // Calculate interval based on BPM
  const calculateInterval = () => {
    return (60 / bpm) * 1000 / transitionPlaybackRate;
  };

  // Playback
  const togglePlayback = () => {
    if (isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      stopAllPlayback();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      handleRestartPlayback();
    }
  };

  const startAudioRecording = async (destination: MediaStream) => {
    try {
      setRecordingOutput(true);

      setTimeout(async () => {
        try {
          await startRecording(destination);
        } catch (error) {
          setRecordingOutput(false);
          console.error("Failed to start recording", error);
        }
      }, 100);
    } catch (error) {
      console.error("Error setting up recording:", error);
    }
  };

  const stopAudioRecording = async () => {
    try {
      await stopRecording();
      setRecordingOutput(false);
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  };

  // Toggle recording
  const toggleRecording = async () => {
    if (isRecording) {
      console.log("Stopping recording");
      await stopAudioRecording();
    } else {
      console.log("Starting recording");
      const destination = getRecordingDestination();
      if (destination) {
        await startAudioRecording(destination);
      } else {
        console.error("No recording destination available");
      }
    }
  };

  // Handle reset/new file with proper recording handling
  const handleReset = async () => {
    // Always make sure to stop any active recording before resetting
    if (isRecording) {
      await stopRecording();
      setRecordingOutput(false);
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsPlaying(false);
    reset();
  };

  // Update the showRecordings handler in the App component
  const handleShowRecordings = () => {
    console.log("Show recordings clicked, recordings:", recordings.length);
    setShowRecordings(true);
  };

  // Add handler for quality change
  const handleQualityChange = (quality: 'low' | 'medium' | 'high') => {
    setStretchingQualityState(quality);
    setStretchingQuality(quality);
  };

  // Add proper type definitions to the function
  const formatRecordingsForList = (recordings: RecorderRecording[]): Recording[] => {
    return recordings.map(recording => ({
      ...recording,
      date: recording.timestamp ? new Date(recording.timestamp) : new Date(),
      url: recording.url || ''
    }));
  };

  // Detect mobile device on mount
  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      setIsMobileDevice(width < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Add this inside the App component
  const testAudio = async () => {
    console.log("Testing audio...");
    // Use the imported instance instead of trying to access audioEngine
    const context = audioEngineInstance.getAudioContext();
    console.log("Audio context state:", context.state);
    
    // Try to resume the context
    if (context.state !== "running") {
      try {
        await context.resume();
        console.log("After resume, context state:", context.state);
      } catch (e) {
        console.error("Failed to resume context:", e);
      }
    }
    
    // Create and play a short test tone
    try {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      gainNode.gain.value = 0.1;
      
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      
      oscillator.start();
      setTimeout(() => oscillator.stop(), 200);
      console.log("Test tone played");
    } catch (e) {
      console.error("Failed to play test tone:", e);
    }
  };

  // Render SliceConfig with proper values and a new forced update approach
  const renderSliceConfig = () => {
    // Verify current BPM before rendering
    console.log(`📊 Current BPM when rendering SliceConfig: ${bpm}`);

    // IMPORTANT: Use a reactive key based on both file name and BPM
    // This ensures re-render whenever either changes
    const fileKey = audioFile?.name || 'no-file';
    const configKey = `${fileKey}-${bpm}-${Date.now()}`;

    return (
      <SliceConfig
        key={configKey}
        onApplyConfig={handleApplyConfig}
        audioFileName={audioFile?.name || ""}
        initialBpm={bpm}
        initialDivision={division}
        onBpmChange={(newBpm) => {
          console.log(`🎛️ Manual BPM change: ${bpm} → ${newBpm}`);
          setBpm(newBpm);
        }}
            onDivisionChange={setDivision}
            detectBpm={detectBpm}
          />
    );
  };

  const renderContent = () => {
    if (!audioFile) {
      return (
        <div className="w-full max-w-4xl flex flex-col items-center justify-center p-12 border-2 border-dashed border-yellow-400 rounded-lg">
          <Upload className="text-yellow-400 mb-4" size={48} />
          <h2 className="text-xl mb-4">Upload an audio file to begin</h2>
          <label className="bg-yellow-400 text-black px-4 py-2 rounded cursor-pointer hover:bg-yellow-300 transition-colors">
            Select File
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </label>
        </div>
      );
    }

    if (showConfig) {
      (window as any).__latestBpm = bpm;
      console.log(`🎼 Rendering config with BPM = ${bpm}`);
      return renderSliceConfig();
    }

    // Replace this section to remove the duplicate Edit BPM button
    return (
      <>
        <div className="w-full flex items-center mb-1">
          <span className="text-xs text-yellow-400/80 font-medium truncate">
            {audioFile?.name}
          </span>
        </div>

        <PlaybackControls
          isPlaying={isPlaying}
          isRecording={isRecording}
          hasRecording={recordings.length > 0}
          slicePlaybackRate={slicePlaybackRate}
          transitionPlaybackRate={transitionPlaybackRate}
          debouncedSliceRate={debouncedSliceRate}
          debouncedTransRate={debouncedTransRate}
          isLoading={isLoading}
          noSlices={slices.length === 0}
          onTogglePlayback={togglePlayback}
          onToggleRecording={toggleRecording}
          onSliceRateChange={setSlicePlaybackRate}
          onTransitionRateChange={setTransitionPlaybackRate}
          onShowRecordings={handleShowRecordings}
          stretchingQuality={stretchingQuality}
          onQualityChange={handleQualityChange}
          onEditBpm={() => setShowConfig(true)}
          onUploadNewFile={handleReset}
          compact={true}
          onTestAudio={testAudio}
        />

        <div className="flex-1 w-full overflow-hidden bg-black/10 rounded-lg">
          <SliceGrid 
            slices={slices}
            onSliceClick={handleSliceClick}
            activeSlice={activeSlice}
          />
        </div>
      </>
    );
  };

  // Update the main container layout to be more space-efficient
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 text-white flex flex-col items-center p-0.5 sm:p-1 md:p-2 h-screen overflow-hidden">
      <Header compact={true} />
      
      <div className="w-full max-w-5xl flex-1 flex flex-col items-center overflow-hidden py-1 px-0.5">
        {renderContent()}
      </div>

      <div className="h-safe-bottom w-full"></div>
    </div>
  );
}

interface Recording {
  id: string;
  name: string;
  url: string;
  date: Date;
  timestamp?: number;
  size?: number;
  duration?: number;
}

export default App;
