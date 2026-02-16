import React from 'react';
import { X, Play, Pause, Download, Trash } from 'lucide-react';

interface Recording {
  id: string;
  name: string;
  url: string;
  date?: Date;
  timestamp?: number;
  size?: number;
  duration?: number;
}

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
  currentlyPlaying,
}) => {
  const formatDuration = (seconds?: number) => {
    if (!seconds || Number.isNaN(seconds)) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (recording: Recording) => {
    const dateObj = recording.date || (recording.timestamp ? new Date(recording.timestamp) : new Date());
    return dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-800 w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold">Recordings</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-800 transition-colors" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {recordings.length === 0 ? (
          <div className="p-6 text-center text-gray-400">No recordings yet.</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2">
            <ul className="divide-y divide-gray-800">
              {recordings.map((recording) => (
                <li key={recording.id} className="py-3 px-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onPlayPause(recording.id)}
                      className={`p-2 rounded-full ${
                        currentlyPlaying === recording.id
                          ? 'bg-yellow-500 text-black'
                          : 'bg-gray-800 text-white hover:bg-gray-700'
                      }`}
                      aria-label={currentlyPlaying === recording.id ? 'Pause' : 'Play'}
                    >
                      {currentlyPlaying === recording.id ? <Pause size={16} /> : <Play size={16} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{recording.name}</p>
                      <div className="flex items-center text-xs text-gray-400 space-x-2 mt-1">
                        <span>{formatDate(recording)}</span>
                        <span>•</span>
                        <span>{formatDuration(recording.duration)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onDownload(recording.id)}
                      className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 transition-colors"
                      aria-label="Download"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(recording.id)}
                      className="p-2 bg-red-600 text-white rounded-full hover:bg-red-500 transition-colors"
                      aria-label="Delete"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingsList;

