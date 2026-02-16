import React, { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { SliceOptions, StretchMode } from './types/audio';
import useAudioRecorder from './hooks/useAudioRecorder';
import { useAudioEngine } from './hooks/useAudioEngine';

import Header from './components/Header';
import SliceConfig from './components/SliceConfig';
import SliceGrid from './components/SliceGrid';
import PlaybackControls from './components/PlaybackControls';
import RecordingsList from './components/RecordingsList';

interface RecordingListItem {
  id: string;
  name: string;
  url: string;
  date: Date;
  timestamp?: number;
  size?: number;
  duration?: number;
}

function App() {
  const {
    audioFile,
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
    reset,
    setStretchingQuality,
    setStretchMode,
    setSmoothnessBias,
    startRandomPlayback,
    stopRandomPlayback,
    schedulerState,
    qualityMetrics,
    currentCrossfadeDuration,
  } = useAudioEngine();

  const [localLoading, setLocalLoading] = useState(false);
  const isLoading = hookLoading || localLoading;

  const {
    isRecording,
    recordings,
    recordingMetrics,
    currentlyPlaying,
    startRecording,
    stopRecording,
    downloadRecording,
    playPauseRecording,
    deleteRecording,
  } = useAudioRecorder();

  const [showConfig, setShowConfig] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [slicePlaybackRate, setSlicePlaybackRate] = useState(1);
  const [transitionPlaybackRate, setTransitionPlaybackRate] = useState(0.5);
  const [bpm, setBpm] = useState(120);
  const [division, setDivision] = useState('1/4');
  const [stretchingQuality, setStretchingQualityState] = useState<'low' | 'medium' | 'high'>('medium');
  const [stretchMode, setStretchModeState] = useState<StretchMode>('auto');
  const [smoothnessBias, setSmoothnessBiasState] = useState(0.7);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    const quality = desktop ? 'high' : 'medium';
    setStretchingQualityState(quality);
    setStretchingQuality(quality);
    setStretchMode('auto');
    setSmoothnessBias(0.7);
  }, [setStretchingQuality, setStretchMode, setSmoothnessBias]);

  useEffect(() => {
    if (isPlaying) {
      startRandomPlayback({
        playbackRate: slicePlaybackRate,
        bpm,
        division,
        transitionSpeed: transitionPlaybackRate,
      });
    }
  }, [isPlaying, startRandomPlayback, slicePlaybackRate, bpm, division, transitionPlaybackRate]);

  useEffect(() => {
    updatePlaybackRate(slicePlaybackRate);
  }, [slicePlaybackRate, updatePlaybackRate]);

  const handleAudioProcessingError = (error: unknown) => {
    console.error('Error processing audio:', error);
    setLocalLoading(false);
    alert('Failed to process audio. Please try another file.');
  };

  const handleFileUpload = async (file: File, detectedBpm: number | null) => {
    setLocalLoading(true);
    try {
      if (detectedBpm) {
        setBpm(detectedBpm);
      }
      const buffer = await loadAudioFile(file);
      if (!buffer) {
        setLocalLoading(false);
        return;
      }
      setShowConfig(true);
    } catch (error) {
      handleAudioProcessingError(error);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, null);
    }
  };

  const handleApplyConfig = async (options: SliceOptions) => {
    const success = await processAudio(options);
    if (success) {
      setShowConfig(false);
    }
    return success;
  };

  const handleSliceClick = (index: number) => {
    playSlice(index, slicePlaybackRate, bpm, transitionPlaybackRate, division);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopRandomPlayback();
      stopAllPlayback();
      setIsPlaying(false);
      return;
    }

    if (!slices.length) return;
    startRandomPlayback({
      playbackRate: slicePlaybackRate,
      bpm,
      division,
      transitionSpeed: transitionPlaybackRate,
    });
    setIsPlaying(true);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
      setRecordingOutput(false);
      return;
    }

    const destination = getRecordingDestination();
    if (!destination) return;

    try {
      await startRecording(destination);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecordingOutput(false);
    }
  };

  const handleReset = async () => {
    if (isRecording) {
      await stopRecording();
      setRecordingOutput(false);
    }
    stopRandomPlayback();
    setIsPlaying(false);
    setShowConfig(false);
    setShowRecordings(false);
    setShowDiagnostics(false);
    reset();
  };

  const handleQualityChange = (quality: 'low' | 'medium' | 'high') => {
    setStretchingQualityState(quality);
    setStretchingQuality(quality);
  };

  const handleStretchModeChange = (mode: StretchMode) => {
    setStretchModeState(mode);
    setStretchMode(mode);
  };

  const handleSmoothnessBiasChange = (value: number) => {
    setSmoothnessBiasState(value);
    setSmoothnessBias(value);
  };

  const recordingsForList = useMemo<RecordingListItem[]>(
    () =>
      recordings.map((recording) => ({
        ...recording,
        date: new Date(recording.timestamp),
      })),
    [recordings]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-gray-900 text-white flex flex-col items-center p-1 sm:p-2 h-screen overflow-hidden">
      <Header compact={true} />

      <div className="w-full max-w-5xl flex-1 flex flex-col items-center overflow-hidden py-1 px-1 gap-2">
        {!audioFile && (
          <div className="w-full max-w-4xl flex flex-col items-center justify-center p-12 border-2 border-dashed border-yellow-400 rounded-xl bg-black/20">
            <Upload className="text-yellow-400 mb-4" size={48} />
            <h2 className="text-xl mb-4">Upload an audio file to begin</h2>
            <label className="bg-yellow-400 text-black px-4 py-2 rounded cursor-pointer hover:bg-yellow-300 transition-colors">
              Select File
              <input type="file" accept="audio/*" onChange={handleFileInputChange} className="hidden" />
            </label>
          </div>
        )}

        {audioFile && showConfig && (
          <SliceConfig
            key={`${audioFile?.name || 'no-file'}-${bpm}`}
            onApplyConfig={handleApplyConfig}
            audioFileName={audioFile?.name || ''}
            initialBpm={bpm}
            initialDivision={division}
            onBpmChange={setBpm}
            onDivisionChange={setDivision}
            detectBpm={detectBpm}
          />
        )}

        {audioFile && !showConfig && (
          <>
            <div className="w-full flex items-center mb-1 px-1">
              <span className="text-xs text-yellow-300/90 font-medium truncate">{audioFile.name}</span>
            </div>

            <PlaybackControls
              isPlaying={isPlaying}
              isRecording={isRecording}
              hasRecording={recordings.length > 0}
              slicePlaybackRate={slicePlaybackRate}
              transitionPlaybackRate={transitionPlaybackRate}
              isLoading={isLoading}
              noSlices={slices.length === 0}
              onTogglePlayback={togglePlayback}
              onToggleRecording={toggleRecording}
              onSliceRateChange={setSlicePlaybackRate}
              onTransitionRateChange={setTransitionPlaybackRate}
              onShowRecordings={() => setShowRecordings(true)}
              stretchingQuality={stretchingQuality}
              onQualityChange={handleQualityChange}
              stretchMode={stretchMode}
              onStretchModeChange={handleStretchModeChange}
              smoothnessBias={smoothnessBias}
              onSmoothnessBiasChange={handleSmoothnessBiasChange}
              onEditBpm={() => setShowConfig(true)}
              onUploadNewFile={handleReset}
              onOpenDiagnostics={() => setShowDiagnostics((v) => !v)}
              qualityMetrics={qualityMetrics}
              recordingFormatLabel="WAV 24-bit stereo"
            />

            <div className="flex-1 w-full overflow-hidden bg-black/15 rounded-lg border border-gray-800">
              <SliceGrid slices={slices} onSliceClick={handleSliceClick} activeSlice={activeSlice} />
            </div>

            {showDiagnostics && (
              <div className="w-full rounded-lg border border-gray-800 bg-gray-900/70 p-3 text-xs">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded bg-gray-800/80 px-2 py-1">Context: {qualityMetrics.contextState}</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Scheduler: {schedulerState.running ? 'running' : 'stopped'}</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Drift: {schedulerState.schedulerDriftMs.toFixed(1)} ms</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Crossfade: {(currentCrossfadeDuration * 1000).toFixed(0)} ms</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Overlap: {(qualityMetrics.currentOverlapMs || 0).toFixed(1)} ms</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Stretch: {qualityMetrics.stretchMode || stretchMode}</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">HQ Hit: {((qualityMetrics.hqCacheHitRate || 0) * 100).toFixed(0)}%</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">HQ Fallback: {qualityMetrics.hqFallbackCount || 0}</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Rec Peak: {recordingMetrics.peakDb.toFixed(1)} dB</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Rec RMS: {recordingMetrics.rmsDb.toFixed(1)} dB</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Rec Clips: {recordingMetrics.clipCount}</div>
                  <div className="rounded bg-gray-800/80 px-2 py-1">Format: WAV 24-bit stereo</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showRecordings && (
        <RecordingsList
          recordings={recordingsForList}
          onClose={() => setShowRecordings(false)}
          onDownload={downloadRecording}
          onPlayPause={playPauseRecording}
          onDelete={deleteRecording}
          currentlyPlaying={currentlyPlaying}
        />
      )}

      <div className="h-safe-bottom w-full"></div>
    </div>
  );
}

export default App;
