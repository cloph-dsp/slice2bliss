import React from 'react';
import { Play, Pause, Download, Mic, Square, Edit, Upload, Activity } from 'lucide-react';
import { AudioQualityMetrics, StretchMode } from '../types/audio';

interface PlaybackControlsProps {
  isPlaying: boolean;
  isRecording: boolean;
  hasRecording: boolean;
  slicePlaybackRate: number;
  transitionPlaybackRate: number;
  isLoading: boolean;
  noSlices: boolean;
  onTogglePlayback: () => void;
  onToggleRecording: () => void;
  onSliceRateChange: (rate: number) => void;
  onTransitionRateChange: (rate: number) => void;
  onShowRecordings: () => void;
  stretchingQuality: 'low' | 'medium' | 'high';
  onQualityChange: (quality: 'low' | 'medium' | 'high') => void;
  stretchMode: StretchMode;
  onStretchModeChange: (mode: StretchMode) => void;
  smoothnessBias: number;
  onSmoothnessBiasChange: (value: number) => void;
  onEditBpm: () => void;
  onUploadNewFile: () => void;
  onOpenDiagnostics: () => void;
  qualityMetrics: AudioQualityMetrics;
  recordingFormatLabel: string;
}

const qualityButtonClass = (active: boolean) =>
  `px-2 py-1 rounded text-xs border transition-colors ${
    active
      ? 'bg-yellow-400 text-black border-yellow-300'
      : 'bg-gray-800 text-gray-200 border-gray-700 hover:border-yellow-400'
  }`;

const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  isRecording,
  hasRecording,
  slicePlaybackRate,
  transitionPlaybackRate,
  isLoading,
  noSlices,
  onTogglePlayback,
  onToggleRecording,
  onSliceRateChange,
  onTransitionRateChange,
  onShowRecordings,
  stretchingQuality,
  onQualityChange,
  stretchMode,
  onStretchModeChange,
  smoothnessBias,
  onSmoothnessBiasChange,
  onEditBpm,
  onUploadNewFile,
  onOpenDiagnostics,
  qualityMetrics,
  recordingFormatLabel,
}) => {
  return (
    <div className="w-full rounded-xl border border-gray-800 bg-gray-900/85 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePlayback}
            disabled={isLoading || noSlices}
            className={`h-11 w-11 rounded-full transition-colors ${
              isLoading || noSlices
                ? 'bg-gray-700 opacity-50 cursor-not-allowed'
                : 'bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
            title={isPlaying ? 'Stop Random' : 'Start Random'}
          >
            {isPlaying ? <Pause size={18} className="mx-auto" /> : <Play size={18} className="mx-auto" />}
          </button>

          <button
            onClick={onToggleRecording}
            className={`h-11 w-11 rounded-full transition-colors ${
              isRecording ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            {isRecording ? <Square size={18} className="mx-auto" /> : <Mic size={18} className="mx-auto" />}
          </button>

          {hasRecording && (
            <button
              onClick={onShowRecordings}
              className="h-11 w-11 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-colors"
              title="Show Recordings"
            >
              <Download size={18} className="mx-auto" />
            </button>
          )}

          <button
            onClick={onEditBpm}
            className="h-11 w-11 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors border border-gray-700"
            title="Edit BPM"
          >
            <Edit size={18} className="mx-auto" />
          </button>

          <button
            onClick={onUploadNewFile}
            className="h-11 w-11 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors border border-gray-700"
            title="Upload New File"
          >
            <Upload size={18} className="mx-auto" />
          </button>
        </div>

        <button
          onClick={onOpenDiagnostics}
          className="h-11 px-3 rounded-lg border border-gray-700 bg-gray-800 text-sm hover:border-yellow-400 transition-colors flex items-center gap-2"
        >
          <Activity size={16} />
          Diagnostics
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          <div className="mb-1 flex justify-between text-gray-300">
            <span>Slice Speed</span>
            <span>{slicePlaybackRate.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.25"
            value={slicePlaybackRate}
            onChange={(e) => onSliceRateChange(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="text-xs">
          <div className="mb-1 flex justify-between text-gray-300">
            <span>Transition Speed</span>
            <span>{transitionPlaybackRate.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={transitionPlaybackRate}
            onChange={(e) => onTransitionRateChange(Number(e.target.value))}
            className="w-full"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Stretch Quality</span>
        <button className={qualityButtonClass(stretchingQuality === 'low')} onClick={() => onQualityChange('low')}>Low</button>
        <button className={qualityButtonClass(stretchingQuality === 'medium')} onClick={() => onQualityChange('medium')}>Medium</button>
        <button className={qualityButtonClass(stretchingQuality === 'high')} onClick={() => onQualityChange('high')}>High</button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Stretch Mode</span>
        <button className={qualityButtonClass(stretchMode === 'auto')} onClick={() => onStretchModeChange('auto')}>Auto</button>
        <button className={qualityButtonClass(stretchMode === 'hq')} onClick={() => onStretchModeChange('hq')}>HQ</button>
        <button className={qualityButtonClass(stretchMode === 'native')} onClick={() => onStretchModeChange('native')}>Native</button>
      </div>

      <div className="mt-2">
        <label className="text-xs">
          <div className="mb-1 flex justify-between text-gray-300">
            <span>Smoothness Bias</span>
            <span>{smoothnessBias.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={smoothnessBias}
            onChange={(e) => onSmoothnessBiasChange(Number(e.target.value))}
            className="w-full"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded border border-gray-700 bg-gray-800">
          Peak {qualityMetrics.peakDb.toFixed(1)} dB
        </span>
        <span className="px-2 py-1 rounded border border-gray-700 bg-gray-800">
          RMS {qualityMetrics.rmsDb.toFixed(1)} dB
        </span>
        <span className="px-2 py-1 rounded border border-gray-700 bg-gray-800">
          Clips {qualityMetrics.clipCount}
        </span>
        <span className="px-2 py-1 rounded border border-gray-700 bg-gray-800">
          Drift {qualityMetrics.schedulerDriftMs.toFixed(1)} ms
        </span>
        <span className="px-2 py-1 rounded border border-gray-700 bg-gray-800">
          HQ hit {((qualityMetrics.hqCacheHitRate || 0) * 100).toFixed(0)}%
        </span>
        <span className="px-2 py-1 rounded border border-gray-700 bg-gray-800">
          HQ fallback {qualityMetrics.hqFallbackCount || 0}
        </span>
        <span className="px-2 py-1 rounded border border-gray-700 bg-gray-800">
          {recordingFormatLabel}
        </span>
      </div>
    </div>
  );
};

export default PlaybackControls;
