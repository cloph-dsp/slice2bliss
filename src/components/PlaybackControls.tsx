import React from 'react';
import { Play, Pause, Download, Mic, Square } from 'lucide-react';

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
  onShowRecordings
}) => {
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
            max="2"
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
          >
            <Download size={20} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
};

export default PlaybackControls;
