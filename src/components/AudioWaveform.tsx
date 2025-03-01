import React, { useMemo } from 'react';

interface AudioWaveformProps {
  buffer: AudioBuffer;
  color?: string;
  height?: number;
  width?: number;
  className?: string;
  lineWidth?: number;
  highQuality?: boolean;
}

const AudioWaveform: React.FC<AudioWaveformProps> = ({ 
  buffer,
  color = '#f7dc6f', // Changed from emerald to yellow shade
  height = 40,
  width = 100,
  className = '',
  lineWidth = 2,
  highQuality = false
}) => {
  // Generate waveform path data from audio buffer
  const waveformPath = useMemo(() => {
    if (!buffer || buffer.length === 0) {
      return '';
    }

    // Get audio data from first channel
    const channelData = buffer.getChannelData(0);
    
    // For performance, we reduce the resolution for longer samples
    const sampleStep = highQuality ? 
      Math.max(1, Math.floor(channelData.length / 1000)) : 
      Math.max(1, Math.floor(channelData.length / 100));
    
    // Calculate points for the waveform
    const dataPoints: number[] = [];
    for (let i = 0; i < channelData.length; i += sampleStep) {
      dataPoints.push(channelData[i]);
    }

    // Normalize data points to fit in height
    const normalizedData = dataPoints.map(point => {
      const normalized = ((point + 1) / 2) * height;
      return Math.max(0, Math.min(height, normalized)); // Clamp to valid range
    });

    // Calculate width of each segment
    const segmentWidth = width / normalizedData.length;
    
    // Generate SVG path
    let path = `M 0,${height/2}`;
    normalizedData.forEach((point, i) => {
      path += ` L ${i * segmentWidth},${height - point}`;
    });
    
    return path;
  }, [buffer, height, width, highQuality]);

  if (!buffer || buffer.length === 0) {
    return null;
  }

  return (
    <svg 
      width={width} 
      height={height} 
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <path
        d={waveformPath}
        fill="none"
        stroke={color}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default AudioWaveform;
