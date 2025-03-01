import React from 'react';
import { Download, X, Play, Pause, Trash2 } from 'lucide-react';
import { Recording } from '../hooks/useAudioRecorder';

interface RecordingsListProps {
  recordings: Recording[];
  onClose: () => void;
  onDownload: (id: string) => void;
  onPlayPause: (id: string) => void;
  onDelete: (id: string) => void;
  currentlyPlaying: string | null;
}

const RecordingsList: React.FC<RecordingsListProps> = ({
  recordings,
  onClose,
  onDownload,
  onPlayPause,
  onDelete,
  currentlyPlaying
}) => {
  if (recordings.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-6 rounded-lg shadow-lg w-full max-w-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Recordings</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
          <div className="py-8 text-center text-gray-400">
            No recordings available. Start recording to create one!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg shadow-lg w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Recordings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1">
          {recordings.map((recording) => (
            <div 
              key={recording.id} 
              className={`border-b border-gray-700 p-3 flex items-center justify-between ${
                currentlyPlaying === recording.id ? 'bg-gray-800' : ''
              }`}
            >
              <div className="flex flex-col">
                <span className="font-medium">{recording.name}</span>
                <span className="text-xs text-gray-400">
                  {new Date(recording.timestamp).toLocaleString()}
                  {recording.duration ? ` • ${formatDuration(recording.duration)}` : ''}
                </span>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => onPlayPause(recording.id)}
                  className="p-2 rounded-full transition-colors text-gray-300 hover:text-white hover:bg-gray-700"
                  title={currentlyPlaying === recording.id ? "Pause" : "Play"}
                >
                  {currentlyPlaying === recording.id ? <Pause size={16} /> : <Play size={16} />}
                </button>
                
                <button
                  onClick={() => onDownload(recording.id)}
                  className="p-2 rounded-full transition-colors text-gray-300 hover:text-white hover:bg-gray-700"
                  title="Download"
                >
                  <Download size={16} />
                </button>
                
                <button
                  onClick={() => onDelete(recording.id)}
                  className="p-2 rounded-full transition-colors text-gray-300 hover:text-red-500 hover:bg-gray-700"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export default RecordingsList;
