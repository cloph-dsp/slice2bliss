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
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [showConfig, setShowConfig] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const destinationNode = useRef<MediaStreamAudioDestinationNode | null>(null);
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

    playbackEngine.playSegment(slices[index], { playbackRate: slicePlaybackRate });
    console.log(`Playing slice ${index}, duration: ${slices[index].metadata.duration}s`);
    setActiveSlice(index);

    // Reset active slice after playback
    const duration = (slices[index].metadata.duration / slicePlaybackRate) * 1000;
    setTimeout(() => {
      if (activeSlice === index) { // Only reset if this is still the active slice
        setActiveSlice(-1);
      }
    }, Math.max(duration, 100)); // Ensure minimum duration for visual feedback
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

  // Start/stop recording
  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorder.current) {
        mediaRecorder.current.stop();
      }
      setIsRecording(false);
    } else {
      if (destinationNode.current) {
        const chunks: Blob[] = [];
        mediaRecorder.current = new MediaRecorder(destinationNode.current.stream);

        mediaRecorder.current.ondataavailable = (e: any) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.current.onstop = () => {
          setRecordedChunks(chunks);
        };

        mediaRecorder.current.start();
        setIsRecording(true);
      }
    }
  };

  // Download recorded audio
  const downloadRecording = () => {
    if (recordedChunks.length === 0) return;

    const blob = new Blob(recordedChunks, { type: 'audio/mp3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slice2bliss-recording.mp3';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Play sine wave
  const playSineWave = () => {
    try {
      // Resume audio context if it's suspended
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
      oscillator.connect(audioContext.destination);
      oscillator.start();
      setTimeout(() => oscillator.stop(), 500);
    } catch (error) {
      console.error('Error playing sine wave:', error);
    }
  };

  // Clean up on unmount

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center p-8">
      <header className="w-full max-w-4xl flex items-center justify-center mb-8">
        <Disc className="text-yellow-400 mr-2" size={32} />
        <h1 className="text-3xl font-bold">slice2bliss</h1>
      </header>

      <button onClick={playSineWave} className="bg-yellow-400 text-black px-4 py-2 rounded cursor-pointer hover:bg-yellow-300 transition-colors">
        Play Sine Wave
      </button>

      {!audioFile ? (
        <div className="w-full max-w-4xl flex flex-col items-center justify-center p-12 border-2 border-dashed border-yellow-400 rounded-lg">
          <Upload className="text-yellow-400 mb-4" size={48} />
          <h2 className="text-xl mb-4">Upload an audio file to begin</h2>
          <label className="bg-yellow-400 text-black px-4 py-2 rounded cursor-pointer hover:bg-yellow-300 transition-colors">
            Select File
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      ) : showConfig ? (
        <div className="w-full max-w-md bg-gray-900 p-8 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-yellow-400 mb-6 text-center">Configure Slicing</h2>

          <div className="mb-6">
            <label className="block mb-2 font-medium">BPM</label>
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="w-full bg-gray-800 text-white px-4 py-2 rounded"
              min="1"
              max="300"
            />
          </div>

          <div className="mb-8">
            <label className="block mb-2 font-medium">Division</label>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-2 rounded"
            >
              <option value="1/4">1/4</option>
              <option value="1/8">1/8</option>
              <option value="1/16">1/16</option>
              <option value="1/32">1/32</option>
            </select>
          </div>

          <button
            onClick={applyConfig}
            className="w-full bg-yellow-400 text-black py-3 rounded font-bold hover:bg-yellow-300 transition-colors"
          >
            Slice Audio
          </button>
        </div>
      ) : (
        <div className="w-full max-w-4xl">
          <div className="mb-6 flex flex-wrap gap-4 items-center">

            <div className="flex flex-col w-full mb-4">
              <label className="block mb-1">Slice Speed</label>
              <div className="flex items-center gap-2">
                <span>0.25x</span>
                <input
                  type="range"
                  min="0.25"
                  max="2"
                  step="0.25"
                  value={slicePlaybackRate}
                  onChange={(e) => setSlicePlaybackRate(Number(e.target.value))}
                  className="flex-grow h-2 appearance-none bg-gray-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400"
                />
                <span>2x</span>
                <span className="ml-2 bg-gray-800 px-2 py-1 rounded min-w-12 text-center">{slicePlaybackRate}x</span>
              </div>
            </div>

            <div className="flex flex-col w-full mb-4">
              <label className="block mb-1">Transition Speed</label>
              <div className="flex items-center gap-2">
                <span>0.25x</span>
                <input
                  type="range"
                  min="0.25"
                  max="2"
                  step="0.25"
                  value={transitionPlaybackRate}
                  onChange={(e) => setTransitionPlaybackRate(Number(e.target.value))}
                  className="flex-grow h-2 appearance-none bg-gray-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400"
                />
                <span>2x</span>
                <span className="ml-2 bg-gray-800 px-2 py-1 rounded min-w-12 text-center">{transitionPlaybackRate}x</span>
              </div>
            </div>

            <div className="flex gap-2 ml-auto">
              <button
                onClick={togglePlayback}
                className="bg-yellow-400 text-black p-2 rounded-full hover:bg-yellow-300 transition-colors"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <button
                onClick={toggleRecording}
                className={`p-2 rounded-full transition-colors ${
                  isRecording
                    ? "bg-red-500 text-white hover:bg-red-400"
                    : "bg-gray-700 text-white hover:bg-gray-600"
                }`}
                title={isRecording ? "Stop Recording" : "Start Recording"}
              >
                <span className="block h-4 w-4 rounded-full bg-current"></span>
              </button>

              {recordedChunks.length > 0 && (
                <button
                  onClick={downloadRecording}
                  className="bg-gray-700 text-white p-2 rounded-full hover:bg-gray-600 transition-colors"
                  title="Download Recording"
                >
                  <Download size={24} />
                </button>
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
                onClick={() => {
                  setAudioFile(null);
                  setAudioBuffer(null);
                  setSlices([]);
                  setIsPlaying(false);
                  setActiveSlice(-1);
                  if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                  }
                }}
                className="text-yellow-400 underline hover:text-yellow-300"
              >
                Upload a different file
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
