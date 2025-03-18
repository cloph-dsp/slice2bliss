import React, { useState, useEffect } from 'react';
import { BpmDetectionResult } from '../types/bpm';

interface BpmEditorProps {
  detectedBpm: BpmDetectionResult | null;
  onBpmChange: (bpm: number) => void;
}

export function BpmEditor({ detectedBpm, onBpmChange }: BpmEditorProps) {
  const [bpmValue, setBpmValue] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (detectedBpm) {
      if (detectedBpm.isValid && detectedBpm.bpm > 0) {
        setBpmValue(detectedBpm.bpm);
        setMessage('');
      } else {
        // Clear BPM value and show message when detection fails
        setBpmValue(null);
        setMessage('Could not detect BPM automatically. Please enter a value manually.');
      }
    }
  }, [detectedBpm]);

  const updateBpm = (value: number) => {
    setBpmValue(value);
    onBpmChange(value);
    // Clear message when user manually sets a BPM
    setMessage('');
  };

  return (
    <div className="bpm-editor">
      <h3>BPM Editor</h3>
      {message && <div className="bpm-detection-message">{message}</div>}
      <div className="bpm-controls">
        <input
          type="number"
          min="40"
          max="300"
          value={bpmValue || ''} 
          placeholder="Enter BPM"
          onChange={(e) => updateBpm(Number(e.target.value))}
        />
        <div className="bpm-confidence">
          {detectedBpm && detectedBpm.isValid && detectedBpm.bpm > 0 && (
            <span>
              Confidence: {Math.round(detectedBpm.confidence * 100)}%
              {detectedBpm.details.source && (
                <span className="source-tag">Source: {detectedBpm.details.source}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}