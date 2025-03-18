import React, { useState, useEffect } from 'react';
import { Play, Pause, Download, Mic, Square, Settings, ChevronDown, ChevronUp, Edit, Upload } from 'lucide-react';

interface PlaybackControlsProps {
  isPlaying: boolean;
  isRecording: boolean;
  hasRecording: boolean;
  slicePlaybackRate: number;
  transitionPlaybackRate: number;
  debouncedSliceRate: number;
  debouncedTransRate: number;
  isLoading: boolean;
  noSlices: boolean;
  onTogglePlayback: () => void;
  onToggleRecording: () => void;
  onSliceRateChange: (rate: number) => void;
  onTransitionRateChange: (rate: number) => void;
  onShowRecordings: () => void;
  stretchingQuality: 'low' | 'medium' | 'high';
  onQualityChange: (quality: 'low' | 'medium' | 'high') => void;
  onEditBpm: () => void;
  onUploadNewFile: () => void;
  onTestAudio: () => void; // Add this prop
  compact?: boolean;
}

// Custom hook to track window size
const useWindowSize = () => {
  const [isCompact, setIsCompact] = useState(window.innerWidth < 480);
  
  useEffect(() => {
    const handleResize = () => {
      setIsCompact(window.innerWidth < 480);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return isCompact;
};

const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  isRecording,
  hasRecording,
  slicePlaybackRate,
  transitionPlaybackRate,
  debouncedSliceRate,
  debouncedTransRate,
  isLoading,
  noSlices,
  onTogglePlayback,
  onToggleRecording,
  onSliceRateChange,
  onTransitionRateChange,
  onShowRecordings,
  stretchingQuality,
  onQualityChange,
  onEditBpm,
  onUploadNewFile,
  onTestAudio, // Add this prop
  compact
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const isCompact = useWindowSize();
  const [showSliders, setShowSliders] = useState(true);
  
  // For very small screens, provide option to collapse sliders
  const toggleSliders = () => {
    setShowSliders(!showSliders);
  };
  
  return (
    <div className="relative bg-gray-900/80 rounded-lg shadow-md w-full p-2">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        {/* Compact slider section */}
        <div className="flex gap-2 items-center flex-grow max-w-xs">
          <div className="flex flex-col w-full gap-1">
            <div className="flex items-center gap-1">
              <div className="w-8 text-xs">Slice</div>
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.25"
                value={slicePlaybackRate}
                onChange={(e) => onSliceRateChange(Number(e.target.value))}
                className="flex-grow h-1.5 rounded-full accent-yellow-400"
              />
              <div className="w-8 text-right text-xs">{slicePlaybackRate}x</div>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-8 text-xs">Trans</div>
              <input
                type="range"
                min="0.25"
                max="4"
                step="0.25"
                value={transitionPlaybackRate}
                onChange={(e) => onTransitionRateChange(Number(e.target.value))}
                className="flex-grow h-1.5 rounded-full accent-yellow-400"
              />
              <div className="w-8 text-right text-xs">{transitionPlaybackRate}x</div>
            </div>
          </div>
        </div>

        {/* Buttons in a more compact layout */}
        <div className="flex gap-1 items-center">
          <button
            onClick={onTogglePlayback}
            disabled={isLoading || noSlices}
            className={`p-2 rounded-full transition-colors flex-shrink-0 ${
              isLoading || noSlices ? 'bg-gray-700 opacity-50 cursor-not-allowed' : 
              isPlaying ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={18} strokeWidth={2.5} /> : <Play size={18} strokeWidth={2.5} />}
          </button>

          <button
            onClick={onToggleRecording}
            className={`p-2 rounded-full transition-colors flex-shrink-0 ${
              isRecording
                ? "bg-red-600 text-white hover:bg-red-500 animate-pulse"
                : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}
            title={isRecording ? "Stop Recording" : "Start Recording"}
          >
            {isRecording ? <Square size={18} strokeWidth={2.5} /> : <Mic size={18} strokeWidth={2.5} />}
          </button>

          {hasRecording && (
            <button
              onClick={onShowRecordings}
              className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-500 transition-colors flex-shrink-0"
              title="Show Recordings"
              data-testid="show-recordings-button"
            >
              <Download size={18} strokeWidth={2.5} />
            </button>
          )}
          
          {/* Add the Edit BPM button */}
          <button
            onClick={onEditBpm}
            className="bg-yellow-400 text-black p-2 rounded-full hover:bg-yellow-300 transition-colors flex-shrink-0"
            title="Edit BPM"
          >
            <Edit size={18} strokeWidth={2.5} />
          </button>
          
          {/* Add the Upload New File button */}
          <button
            onClick={onUploadNewFile}
            className="bg-yellow-400 text-black p-2 rounded-full hover:bg-yellow-300 transition-colors flex-shrink-0"
            title="Upload a different file"
          >
            <Upload size={18} strokeWidth={2.5} />
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-full transition-colors flex-shrink-0 bg-gray-800 text-white hover:bg-gray-700"
            title="Time-stretching Settings"
          >
            <Settings size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
      
      {showSettings && (
        <div className={`absolute ${isCompact ? 'left-0' : 'right-0'} top-full mt-2 bg-gray-900 p-3 rounded-lg shadow-lg z-50 w-64`}>
          <h3 className="text-sm font-medium mb-2">Time-stretching Quality</h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="quality"
                value="low"
                checked={stretchingQuality === 'low'}
                onChange={() => onQualityChange('low')}
                className="mr-2"
              />
              <span className="text-sm">Low (Better Performance)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="quality"
                value="medium"
                checked={stretchingQuality === 'medium'}
                onChange={() => onQualityChange('medium')}
                className="mr-2"
              />
              <span className="text-sm">Medium (Balanced)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="quality"
                value="high"
                checked={stretchingQuality === 'high'}
                onChange={() => onQualityChange('high')}
                className="mr-2"
              />
              <span className="text-sm">High (Better Quality)</span>
            </label>
          </div>
          {/* Add Test Audio button */}
          <div className="mt-3 pt-3 border-t border-gray-700">
            <button 
              onClick={onTestAudio}
              className="w-full bg-purple-700 hover:bg-purple-600 text-white py-2 px-4 rounded-md flex items-center justify-center"
            >
              <span className="mr-2">🔊</span> Test Audio
            </button>
            <p className="text-xs text-gray-400 mt-1">
              Fix audio issues on mobile by testing the audio system
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaybackControls;
