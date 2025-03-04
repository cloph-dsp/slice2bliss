import React, { useState } from 'react';
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
  // Check if we're on a small screen
  const isSmallScreen = window.innerWidth < 640;
  // State to track which recording's download menu is open
  const [openDownloadMenu, setOpenDownloadMenu] = useState<string | null>(null);

  const formatDuration = (seconds?: number) => {
    if (!seconds || isNaN(seconds)) return '—:—'; // Changed from '00:00' to '—:—' for undefined duration
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (recording: Recording) => {
    // Use date if available, otherwise create from timestamp
    const dateObj = recording.date || (recording.timestamp ? new Date(recording.timestamp) : new Date());
    return dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Handle toggling the download menu
  const toggleDownloadMenu = (recordingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDownloadMenu(openDownloadMenu === recordingId ? null : recordingId);
  };

  // Close the download menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setOpenDownloadMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-bold">Your Recordings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {recordings.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No recordings yet. Start recording your jam session!
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2">
            <ul className="divide-y divide-gray-800">
              {recordings.map((recording) => (
                <li key={recording.id} className="py-3 sm:py-4 px-2">
                  <div className={`flex flex-col sm:flex-row ${isSmallScreen ? 'gap-2' : 'items-center'}`}>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => onPlayPause(recording.id)}
                          className={`p-2 rounded-full ${
                            currentlyPlaying === recording.id
                              ? "bg-yellow-500 text-black"
                              : "bg-gray-800 text-white hover:bg-gray-700"
                          }`}
                          aria-label={currentlyPlaying === recording.id ? "Pause" : "Play"}
                        >
                          {currentlyPlaying === recording.id ? (
                            <Pause size={16} strokeWidth={2.5} />
                          ) : (
                            <Play size={16} strokeWidth={2.5} />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{recording.name}</p>
                          <div className="flex items-center text-xs text-gray-400 space-x-2 mt-1">
                            <span>{formatDate(recording)}</span>
                            {recording.duration ? (
                              <>
                                <span>•</span>
                                <span>{formatDuration(recording.duration)}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className={`flex gap-2 ${isSmallScreen ? 'ml-9' : 'ml-auto'}`}>
                      <button
                        onClick={() => onDownload(recording.id)}
                        className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 transition-colors"
                        aria-label="Download"
                      >
                        <Download size={16} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => onDelete(recording.id)}
                        className="p-2 bg-red-600 text-white rounded-full hover:bg-red-500 transition-colors"
                        aria-label="Delete"
                      >
                        <Trash size={16} strokeWidth={2.5} />
                      </button>
                    </div>
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
