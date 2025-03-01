import React, { useState } from 'react';
import { Play, Pause, Download, Mic, Square, Settings } from 'lucide-react';

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
}

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
  onQualityChange
}) => {
  const [showSettings, setShowSettings] = useState(false);
  
  return (
    <div className="flex items-center gap-2.5 bg-gray-900 p-3 rounded-lg flex-1 shadow-md">
      <div className="flex flex-col gap-1.5 w-[65%] max-w-sm">
        <div className="flex items-center gap-2">
          <div className="w-16">
            <div className="text-xs font-medium">Slice</div>
            <div className="text-xs text-gray-400">{slicePlaybackRate}x</div>
          </div>
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.25"
            value={slicePlaybackRate}
            onChange={(e) => onSliceRateChange(Number(e.target.value))}
            className={`w-full h-1.5 rounded-full accent-yellow-400 ${slicePlaybackRate !== debouncedSliceRate ? 'opacity-70' : ''}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16">
            <div className="text-xs font-medium">Trans</div>
            <div className="text-xs text-gray-400">{transitionPlaybackRate}x</div>
          </div>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={transitionPlaybackRate}
            onChange={(e) => onTransitionRateChange(Number(e.target.value))}
            className={`w-full h-1.5 rounded-full accent-yellow-400 ${transitionPlaybackRate !== debouncedTransRate ? 'opacity-70' : ''}`}
          />
        </div>
      </div>

      <div className="flex gap-2 ml-auto">
        <button
          onClick={onTogglePlayback}
          disabled={isLoading || noSlices}
          className={`p-2.5 rounded-full transition-colors flex-shrink-0 ${
            isLoading || noSlices ? 'bg-gray-700 opacity-50 cursor-not-allowed' : 
            isPlaying ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'bg-yellow-400 text-black hover:bg-yellow-300'
          }`}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={20} strokeWidth={2.5} /> : <Play size={20} strokeWidth={2.5} />}
        </button>

        <button
          onClick={onToggleRecording}
          className={`p-2.5 rounded-full transition-colors flex-shrink-0 ${
            isRecording
              ? "bg-red-600 text-white hover:bg-red-500 animate-pulse"
              : "bg-yellow-400 text-black hover:bg-yellow-300"
          }`}
          title={isRecording ? "Stop Recording" : "Start Recording"}
        >
          {isRecording ? <Square size={20} strokeWidth={2.5} /> : <Mic size={20} strokeWidth={2.5} />}
        </button>

        {hasRecording && (
          <button
            onClick={onShowRecordings}
            className="bg-blue-600 text-white p-2.5 rounded-full hover:bg-blue-500 transition-colors flex-shrink-0"
            title="Show Recordings"
            data-testid="show-recordings-button"
          >
            <Download size={20} strokeWidth={2.5} />
          </button>
        )}

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2.5 rounded-full transition-colors flex-shrink-0 bg-gray-800 text-white hover:bg-gray-700"
          title="Time-stretching Settings"
        >
          <Settings size={20} strokeWidth={2} />
        </button>
      </div>
      
      {showSettings && (
        <div className="absolute right-0 top-full mt-2 bg-gray-900 p-3 rounded-lg shadow-lg z-10">
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
        </div>
      )}
    </div>
  );
};

export default PlaybackControls;
