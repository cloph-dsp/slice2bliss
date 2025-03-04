import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Disc, Upload, Play, Pause, Download, Loader } from 'lucide-react';
import { SliceOptions } from './types/audio';
import useAudioRecorder from './hooks/useAudioRecorder';
import { useAudioEngine } from './hooks/useAudioEngine';

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

  // Refs
  const rateChangeTimeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const currentIndex = useRef<number>(-1);

  // Handle rate changes with debounce
  useEffect(() => {
    if (isPlaying || activeSlice !== -1) {
      updatePlaybackRate(slicePlaybackRate);
    }

    if (rateChangeTimeoutRef.current) {
      window.clearTimeout(rateChangeTimeoutRef.current);
    }

    rateChangeTimeoutRef.current = window.setTimeout(() => {
      setDebouncedSliceRate(slicePlaybackRate);
      setDebouncedTransRate(transitionPlaybackRate);

      // Only restart playback if we're in random playback mode and the transition rate changed
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

  // Handle file upload
  const handleFileUpload = async (file: File, detectedBpm: number | null) => {
    console.log(`🔄 Loading file: "${file.name}"`);

    try {
      setLocalLoading(true);

      if (detectedBpm) {
        console.log(`✅ BPM detected: ${detectedBpm}`);
        setBpm(detectedBpm);
      } else {
        console.log(`⚠️ No BPM detected, using default 120`);
        setBpm(120);
      }

      // Now load the audio file
      const buffer = await loadAudioFile(file);

      if (!buffer) {
        console.error("❌ Failed to load audio buffer");
        setLocalLoading(false);
        alert("Failed to load audio file. Please try again.");
        return;
      }

      // Complete loading and show config
      setTimeout(() => {
        console.log(`🎵 Using BPM: ${bpm}`);
        setLocalLoading(false);
        setShowConfig(true);
      }, 200);
    } catch (error) {
      console.error("❌ Error in file upload:", error);
      setLocalLoading(false);
      alert("Failed to load audio file. Please try a different file.");
    }
  };

  // Remove the useEffect for detectedBpmValue as we now update BPM directly

  // Handle file input change
  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, null);
    }
  };

  // Apply slice configuration
  const handleApplyConfig = async (options: SliceOptions) => {
    try {
      console.log('App: Applying slice configuration:', options);
      const success = await processAudio(options);
      if (success) {
        setShowConfig(false);
      }
      return success;
    } catch (error) {
      console.error('Error applying slice config:', error);
      return false;
    }
  };

  // Handle playback of a slice
  const handleSliceClick = (index: number) => {
    // Pass BPM and transition speed along with slice rate
    playSlice(index, slicePlaybackRate, bpm, transitionPlaybackRate);
  };

  // Random playback logic
  const handleRestartPlayback = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!slices || slices.length === 0) {
      setIsPlaying(false);
      return;
    }

    const playRandomSlice = () => {
      const randomIndex = Math.floor(Math.random() * slices.length);
      currentIndex.current = randomIndex;
      // Pass BPM and transition speed along with slice rate
      playSlice(randomIndex, slicePlaybackRate, bpm, transitionPlaybackRate);
    };

    // Play first random slice immediately
    playRandomSlice();

    // Set interval for subsequent slices
    const intervalMs = calculateInterval();
    intervalRef.current = window.setInterval(playRandomSlice, intervalMs);
  };

  // Calculate interval based on BPM and transition rate
  const calculateInterval = () => {
    // Simple calculation - could be enhanced with more musical timing
    return (60 / bpm) * 1000 / transitionPlaybackRate;
  };

  // Toggle playback
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

  // Toggle recording
  const toggleRecording = async () => {
    if (isRecording) {
      console.log("Stopping recording");
      try {
        await stopRecording();
        setRecordingOutput(false);
      } catch (error) {
        console.error("Error stopping recording:", error);
      }
    } else {
      console.log("Starting recording");
      // Get MediaStream from recording destination
      const destination = getRecordingDestination();
      if (destination) {
        try {
          // Enable recording output first so any playing audio gets captured
          setRecordingOutput(true);

          // Small delay to ensure audio routing is established
          setTimeout(async () => {
            try {
              // Pass the destination stream to the recorder
              await startRecording(destination);
            } catch (error) {
              // If recording fails, disable recording output
              setRecordingOutput(false);
              console.error("Failed to start recording", error);
            }
          }, 100);
        } catch (error) {
          console.error("Error setting up recording:", error);
        }
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

    return (
      <>
        <div className="w-full max-w-4xl mb-4">
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
          />

          <div className="text-xs text-gray-400 flex gap-2 items-center mt-2">
            <span className="font-medium text-white mr-2">
              {audioFile?.name}
            </span>
            <span>•</span>
            <button
              onClick={() => setShowConfig(true)}
              className="text-yellow-400 hover:text-yellow-300"
            >
              Edit BPM
            </button>
            <span>•</span>
            <button
              onClick={handleReset}
              className="text-yellow-400 hover:text-yellow-300"
            >
              Upload a different file
            </button>
          </div>
        </div>

        {slices.length > 0 && (
          <div className="flex-1 overflow-hidden w-full">
            <SliceGrid
              slices={slices}
              activeSlice={activeSlice}
              onSliceClick={handleSliceClick}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 text-white flex flex-col items-center p-2 sm:p-4 md:p-8 h-screen overflow-hidden">
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-lg shadow-lg flex flex-col items-center">
            <Loader className="animate-spin text-yellow-400 mb-3" size={32} />
            <p className="text-white font-medium">Processing audio...</p>
          </div>
        </div>
      )}

      {showRecordings && (
        <RecordingsList
          recordings={formatRecordingsForList(recordings)}
          onClose={() => setShowRecordings(false)}
          onDownload={downloadRecording}
          onPlayPause={playPauseRecording}
          onDelete={deleteRecording}
          currentlyPlaying={currentlyPlaying}
        />
      )}

      <Header compact={isMobileDevice} />

      <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center overflow-hidden">
        {renderContent()}
      </div>

      {isMobileDevice && <div className="h-2 w-full"></div>}
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
