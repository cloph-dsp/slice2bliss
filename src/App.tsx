import React, { useState, useRef } from 'react';
import { Play, Pause, Download, Upload, Disc } from 'lucide-react';

function App() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [division, setDivision] = useState('1/16');
  const [slices, setSlices] = useState<AudioBuffer[]>([]);
  const [activeSlice, setActiveSlice] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const destinationNode = useRef<MediaStreamAudioDestinationNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        setAudioBuffer(buffer);
        setShowConfig(true); // Show configuration after upload
      } catch (error) {
        console.error('Error decoding audio data:', error);
      }
    }
  };
  
  // Slice the audio based on BPM and division
  const sliceAudio = () => {
    if (!audioBuffer) return;
    
    // Calculate slice duration based on BPM and division
    const beatsPerSecond = bpm / 60;
    let divisionValue = 1;
    
    switch (division) {
      case '1/4':
        divisionValue = 1;
        break;
      case '1/8':
        divisionValue = 0.5;
        break;
      case '1/16':
        divisionValue = 0.25;
        break;
      case '1/32':
        divisionValue = 0.125;
        break;
      default:
        divisionValue = 0.25; // Default to 1/16
    }
    
    const sliceDuration = (divisionValue / beatsPerSecond);
    const totalSlices = 16; // Fixed at 16 slices
    const sliceArray: AudioBuffer[] = [];
    
    for (let i = 0; i < totalSlices; i++) {
      const startTime = i * sliceDuration;
      if (startTime >= audioBuffer.duration) break;
      
      const endTime = Math.min((i + 1) * sliceDuration, audioBuffer.duration);
      const sliceLength = Math.ceil((endTime - startTime) * audioBuffer.sampleRate);
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const sliceBuffer = audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        sliceLength,
        audioBuffer.sampleRate
      );
      
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const originalData = new Float32Array(audioBuffer.length);
        audioBuffer.copyFromChannel(originalData, channel);
        
        const startSample = Math.floor(startTime * audioBuffer.sampleRate);
        const sliceData = originalData.subarray(startSample, sliceLength);
        
        sliceBuffer.copyToChannel(sliceData, channel);
      }
      
      sliceArray.push(sliceBuffer);
    }
    
    console.log(`Created ${sliceArray.length} slices`);
    setSlices(sliceArray);
    setShowConfig(false); // Hide config after slicing
  };
  
  // Apply configuration and slice audio
  const applyConfig = () => {
    sliceAudio();
  };
  
  // Play a specific slice
  const playSlice = (index: number) => {
    if (!slices[index]) {
      console.error("Cannot play slice: context or slice not available");
      return;
    }
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Resume audio context if it's suspended (needed for some browsers)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Stop any currently playing source
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
    }
    
    const source = audioContext.createBufferSource();
    sourceRef.current = source;
    source.buffer = slices[index];
    source.playbackRate.value = playbackRate;
    
    // Connect to destination for normal playback
    source.connect(audioContext.destination);
    
    // Connect to recording destination if recording
    if (isRecording && destinationNode.current) {
      source.connect(destinationNode.current);
    }
    
    source.start();
    console.log(`Playing slice ${index}, duration: ${slices[index].duration}s`);
    setActiveSlice(index);
    
    // Reset active slice after playback
    const duration = (slices[index].duration / playbackRate) * 1000;
    setTimeout(() => {
      if (activeSlice === index) { // Only reset if this is still the active slice
        setActiveSlice(-1);
      }
    }, Math.max(duration, 100)); // Ensure minimum duration for visual feedback
  };
  
  // Start/stop randomized playback
  const togglePlayback = () => {
    if (isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPlaying(false);
      setActiveSlice(-1);
    } else {
      if (slices.length > 0) {
        // Calculate interval based on BPM and division
        const beatsPerSecond = bpm / 60;
        let divisionValue = 1;
        
        switch (division) {
          case '1/4':
            divisionValue = 1;
            break;
          case '1/8':
            divisionValue = 0.5;
            break;
          case '1/16':
            divisionValue = 0.25;
            break;
          case '1/32':
            divisionValue = 0.125;
            break;
          default:
            divisionValue = 0.25;
        }
        
        const interval = (divisionValue / beatsPerSecond) * 1000 / playbackRate;
        console.log(`Starting playback with interval: ${interval}ms`);
        
        // Play a slice immediately
        const randomIndex = Math.floor(Math.random() * slices.length);
        playSlice(randomIndex);
        
        // Set up interval for continued playback
        intervalRef.current = window.setInterval(() => {
          const randomIndex = Math.floor(Math.random() * slices.length);
          playSlice(randomIndex);
        }, interval);
        
        setIsPlaying(true);
      }
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
        
        mediaRecorder.current.ondataavailable = (e) => {
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
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

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
        <h1 className="text-3xl font-bold text-yellow-400">slice2bliss</h1>
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
        // Configuration popup after upload
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
              <label className="block mb-1">Speed</label>
              <div className="flex items-center gap-2">
                <span>0.25x</span>
                <input
                  type="range"
                  min="0.25"
                  max="2"
                  step="0.25"
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  className="flex-grow h-2 appearance-none bg-gray-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400"
                />
                <span>2x</span>
                <span className="ml-2 bg-gray-800 px-2 py-1 rounded min-w-12 text-center">{playbackRate}x</span>
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
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 16 }).map((_, index) => (
              <div
                key={index}
                className={`aspect-square rounded-lg cursor-pointer transition-all ${
                  index < slices.length
                    ? activeSlice === index
                      ? "bg-yellow-300 scale-105"
                      : "bg-yellow-500"
                    : "bg-gray-700"
                }`}
                onClick={() => index < slices.length && playSlice(index)}
              />
            ))}
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-gray-400">
              {audioFile.name} • {slices.length} slices • {bpm} BPM • {division}
            </p>
            <div className="flex justify-center gap-4 mt-2">
              <button
                onClick={() => setShowConfig(true)}
                className="text-yellow-400 underline hover:text-yellow-300"
              >
                Change BPM/Division
              </button>
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
        </div>
      )}
    </div>
  );
}

export default App;
