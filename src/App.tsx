import { useState, useRef, useEffect } from 'react'; 
import { Loader } from 'lucide-react';
import { SliceOptions } from './types/audio';

// Components
import Header from './components/Header'; 
import FileUploader from './components/FileUploader';
import SliceConfig from './components/SliceConfig';
import SliceGrid from './components/SliceGrid';
import PlaybackControls from './components/PlaybackControls';
import RecordingsList from './components/RecordingsList';

// Hooks
import { useAudioEngine } from './hooks/useAudioEngine';
import { useAudioRecorder } from './hooks/useAudioRecorder';

function App() {
  // State for UI
  const [showConfig, setShowConfig] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [slicePlaybackRate, setSlicePlaybackRate] = useState(1);
  const [transitionPlaybackRate, setTransitionPlaybackRate] = useState(0.5); 
  
  // Use custom hooks
  const {
    audioFile,
    slices,
    isLoading,
    activeSlice,
    loadAudioFile,
    processAudio,
    playSlice,
    updatePlaybackRate,
    stopAllPlayback,
    getRecordingDestination,
    setRecordingOutput,
    reset: resetAudio
  } = useAudioEngine();
  
  const {
    isRecording,
    recordings,
    currentlyPlaying,
    startRecording,
    stopRecording,
    downloadRecording,
    playPauseRecording,
    deleteRecording
  } = useAudioRecorder();
  
  // For rate debouncing
  const [debouncedSliceRate, setDebouncedSliceRate] = useState(slicePlaybackRate);
  const [debouncedTransRate, setDebouncedTransRate] = useState(transitionPlaybackRate); 
  const rateChangeTimeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  
  // Handle rate changes with debounce - but apply immediately to active playback
  useEffect(() => {
    // Apply rate immediately to any currently playing slices
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
  }, [slicePlaybackRate, transitionPlaybackRate, isPlaying, activeSlice, updatePlaybackRate]);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    try {
      await loadAudioFile(file);
      setShowConfig(true);
    } catch (error) {
      // Error handled by the hook
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
    // Always use current slice rate, not debounced value
    playSlice(index, slicePlaybackRate);
  };

  // Random playback logic - using current rates, not debounced
  const handleRestartPlayback = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (slices.length > 0) {
      const beatsPerSecond = 120 / 60; // Using a default BPM as we don't track it in state
      let divisionValue = 0.25; // Default to 1/16
      
      // You could make this dynamic if you want to store division in state
      if (slices[0].metadata?.duration) {
        // Estimate division from the first slice duration if available
        divisionValue = slices[0].metadata.duration * (beatsPerSecond);
      }
      
      // Use current transition rate, not debounced
      const interval = (divisionValue / beatsPerSecond) * 1000 / transitionPlaybackRate;
      
      let randomIndex = Math.floor(Math.random() * slices.length);
      // Use current slice rate, not debounced
      playSlice(randomIndex, slicePlaybackRate);
      
      intervalRef.current = window.setInterval(() => {
        randomIndex = Math.floor(Math.random() * slices.length);
        // Use current slice rate, not debounced
        playSlice(randomIndex, slicePlaybackRate);
      }, interval);
    }
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
  const toggleRecording = () => {
    if (isRecording) {
      console.log("Stopping recording");
      stopRecording();
      setRecordingOutput(false);
    } else {
      console.log("Starting recording");
      const destination = getRecordingDestination();
      console.log("Recording destination:", destination);
      
      if (destination?.stream) {
        setRecordingOutput(true); // This connects audio to the recording destination
        
        // Short delay to ensure connections are made before starting recorder
        setTimeout(() => {
          const success = startRecording(destination.stream);
          console.log("Recording started:", success);
          
          if (!success) {
            setRecordingOutput(false);
          }
        }, 100);
      } else {
        console.error("No recording destination available");
      }
    }
  };

  // Reset everything
  const handleReset = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setIsPlaying(false);
    resetAudio();
  };

  // Get view content based on state
  const renderContent = () => {
    if (!audioFile) {
      return <FileUploader onFileSelect={handleFileUpload} />;
    }
    
    if (showConfig) {
      return <SliceConfig 
        onApplyConfig={handleApplyConfig} 
        audioFileName={audioFile.name} 
      />;
    }
    
    return (
      <div className="w-full max-w-3xl flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex flex-col mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs text-gray-400">
              {audioFile?.name} • {slices.length} slices
              {isRecording && (
                <span className="ml-2 text-red-500 animate-pulse">● Recording</span>
              )}
            </div>
            <div className="text-xs text-gray-400 flex gap-2 items-center">
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
                New File
              </button>
            </div>
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
            onShowRecordings={() => setShowRecordings(true)}
          />
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
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 text-white flex flex-col items-center p-4 sm:p-6 md:p-8 max-h-screen overflow-hidden">
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
          recordings={recordings}
          onClose={() => setShowRecordings(false)}
          onDownload={downloadRecording}
          onPlayPause={playPauseRecording}
          onDelete={deleteRecording}
          currentlyPlaying={currentlyPlaying}
        />
      )}
      
      <Header />

      <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
