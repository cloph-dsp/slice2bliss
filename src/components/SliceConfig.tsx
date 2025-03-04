import React from 'react';
import { SliceOptions } from '../types/audio';

interface SliceConfigProps {
  onApplyConfig: (options: SliceOptions) => Promise<boolean>;
  audioFileName: string;
  initialBpm: number;
  initialDivision: string;
  onBpmChange: (bpm: number) => void;
  onDivisionChange: (division: string) => void;
  detectBpm: () => Promise<{ bpm: number } | null>;
}

// This is a COMPLETELY controlled component 
const SliceConfig: React.FC<SliceConfigProps> = ({
  onApplyConfig,
  audioFileName,
  initialBpm,
  initialDivision,
  onBpmChange,
  onDivisionChange,
  detectBpm
}) => {
  // Critical: Always log the actual initialBpm we're receiving
  console.log(
    `%cSliceConfig render with initialBpm=${initialBpm}`,
    "background:#222; color:#ff0; padding:2px;"
  );
  
  // Use initialBpm directly with fallback
  const bpm = initialBpm || 120;
  const division = initialDivision || '1/4';
  
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);

  const handleDetectBpmClick = async () => {
    const detectedBpm = await detectBpm();
    if (detectedBpm) {
      onBpmChange(detectedBpm.bpm);
    }
  };
  
  // Handle BPM change
  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 60 && value <= 200) {
      console.log(`SliceConfig: handleBpmChange to ${value}`);
      onBpmChange(value);
    }
  };
  
  // Handle division change
  const handleDivisionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onDivisionChange(e.target.value);
  };
  
  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const options: SliceOptions = {
      bpm,
      division,
    };
    
    try {
      await onApplyConfig(options);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render the component with the current BPM value
  return (
    <div className="w-full max-w-md bg-gray-900 p-6 rounded-lg shadow-xl">
      <h2 className="text-xl mb-4">Configure Slicing</h2>
      
      <p className="text-sm text-gray-400 mb-4">
        Set the BPM and slice length for "{audioFileName}"
      </p>
      
      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label className="block mb-2 text-sm font-medium">
            BPM (Tempo)
          </label>
          <input 
            type="number" 
            min="60" 
            max="200" 
            value={bpm} 
            onChange={handleBpmChange}
            className="w-full px-4 py-2 bg-gray-800 rounded border border-gray-700 focus:ring-yellow-500 focus:border-yellow-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Beats per minute (60-200)
          </p>
          <button
            type="button"
            onClick={handleDetectBpmClick}
            className="mt-2 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-medium py-1 px-4 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50"
          >
            Detect BPM
          </button>
        </div>
        
        <div className="mb-5">
          <label className="block mb-2 text-sm font-medium">Slice Length</label>
          <select 
            value={division} 
            onChange={handleDivisionChange}
            className="w-full px-4 py-2 bg-gray-800 rounded border border-gray-700 focus:ring-yellow-500 focus:border-yellow-500"
          >
            <option value="1/1">Whole note (1/1)</option>
            <option value="1/2">Half note (1/2)</option>
            <option value="1/4">Quarter note (1/4)</option>
            <option value="1/8">Eighth note (1/8)</option>
            <option value="1/16">Sixteenth note (1/16)</option>
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Musical length of each slice
          </p>
        </div>
        
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-medium py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50 disabled:opacity-50"
        >
          {isSubmitting ? 'Processing...' : 'Create Slices'}
        </button>
      </form>
    </div>
  );
};

export default SliceConfig;
