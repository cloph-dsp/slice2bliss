import React, { useState } from 'react';
import { SliceOptions } from '../types/audio';

interface SliceConfigProps {
  onApplyConfig: (options: SliceOptions) => Promise<boolean>;
  audioFileName: string;
}

const SliceConfig: React.FC<SliceConfigProps> = ({ onApplyConfig, audioFileName }) => {
  const [bpm, setBpm] = useState(120);
  const [division, setDivision] = useState('1/16');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    
    try {
      const options: SliceOptions = {
        bpm,
        division
      };
      
      console.log('Submitting slice config:', options);
      const success = await onApplyConfig(options);
      
      if (!success) {
        setErrorMsg('Failed to process audio. Please try different settings.');
      }
    } catch (error) {
      console.error('Error in slice config:', error);
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="w-full max-w-md p-6 bg-gray-900 rounded-lg">
      <h2 className="text-lg font-semibold mb-4 text-center">Slice Configuration</h2>
      <p className="text-gray-400 text-sm mb-6 text-center">
        File: {audioFileName}
      </p>
      
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500 text-red-200 text-sm rounded">
          {errorMsg}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="bpm" className="block text-sm font-medium mb-2">
            BPM (Beats Per Minute)
          </label>
          <input
            type="number"
            id="bpm"
            min="40"
            max="300"
            value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white"
            disabled={isSubmitting}
          />
        </div>
        
        <div className="mb-6">
          <label htmlFor="division" className="block text-sm font-medium mb-2">
            Beat Division
          </label>
          <select
            id="division"
            value={division}
            onChange={e => setDivision(e.target.value)}
            className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white"
            disabled={isSubmitting}
          >
            <option value="1/4">1/4 (Quarter Notes)</option>
            <option value="1/8">1/8 (Eighth Notes)</option>
            <option value="1/16">1/16 (Sixteenth Notes)</option>
            <option value="1/32">1/32 (Thirty-second Notes)</option>
          </select>
        </div>
        
        <div className="flex justify-center">
          <button
            type="submit"
            className={`py-2 px-4 font-medium rounded transition-colors ${
              isSubmitting 
                ? "bg-gray-600 text-gray-300 cursor-not-allowed" 
                : "bg-yellow-400 text-black hover:bg-yellow-300"
            }`}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Processing..." : "Slice Audio"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SliceConfig;
