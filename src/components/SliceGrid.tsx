import React, { useEffect, useRef } from 'react';
import { AudioSlice } from '../services/AudioPlaybackEngine';
import AudioWaveform from './AudioWaveform';

interface SliceGridProps {
  slices: AudioSlice[];
  activeSlice: number;
  onSliceClick: (index: number) => void;
}

const SliceGrid: React.FC<SliceGridProps> = ({ slices, activeSlice, onSliceClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get more optimal grid columns based on count and container size
  const getGridClasses = () => {
    const count = slices.length;
    
    // Use more granular column counts for better space utilization
    if (count <= 2) return "grid-cols-2"; // 1-2 slices: 2 columns
    if (count <= 6) return "grid-cols-3"; // 3-6 slices: 3 columns
    if (count <= 12) return "grid-cols-4"; // 7-12 slices: 4 columns
    if (count <= 20) return "grid-cols-5"; // 13-20 slices: 5 columns
    if (count <= 30) return "grid-cols-6"; // 21-30 slices: 6 columns
    if (count <= 42) return "grid-cols-7"; // 31-42 slices: 7 columns
    if (count <= 56) return "grid-cols-8"; // 43-56 slices: 8 columns
    return "grid-cols-9"; // 57+ slices: 9 columns (highest density)
  };
  
  // Calculate optimal gap size based on slice count
  const getGapSize = () => {
    const count = slices.length;
    if (count <= 9) return "gap-4";
    if (count <= 25) return "gap-3";
    if (count <= 49) return "gap-2";
    return "gap-1"; // Very dense grid
  };
  
  // Check if grid has overflow and apply appropriate class
  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current) {
        const hasOverflow = containerRef.current.scrollHeight > containerRef.current.clientHeight;
        containerRef.current.classList.toggle('overflowed', hasOverflow);
      }
    };
    
    // Check on mount and when slice count changes
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    
    return () => window.removeEventListener('resize', checkOverflow);
  }, [slices.length]);
  
  return (
    <div 
      ref={containerRef}
      className="w-full h-full p-4 slice-grid-container overflow-auto"
      data-slice-count={slices.length}
    >
      <div className={`grid ${getGridClasses()} ${getGapSize()} w-full auto-rows-fr`}>
        {slices.map((slice, index) => (
          <div 
            key={index}
            onClick={() => onSliceClick(index)}
            className={`
              aspect-square rounded-lg flex flex-col items-center justify-center
              transition-all duration-200 cursor-pointer relative overflow-hidden
              ${activeSlice === index 
                ? 'bg-yellow-400 text-black scale-[0.95] active-slice-animation' 
                : 'bg-gray-800 hover:bg-gray-700 hover:scale-[1.02]'
              }
            `}
          >
            {/* Waveform overlay with playback animation */}
            <div 
              className={`absolute inset-0 ${activeSlice === index ? 'waveform-playing' : 'opacity-40'}`}
              style={{
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {slice.buffer && (
                <>
                  {/* Static waveform */}
                  <AudioWaveform 
                    buffer={slice.buffer} 
                    color={activeSlice === index ? '#444444' : '#f7dc6f'} 
                    width="100%" 
                    height="100%" 
                    lineWidth={activeSlice === index ? 2.5 : 2}
                  />
                  
                  {/* Playback position indicator */}
                  {activeSlice === index && (
                    <div 
                      className="playback-indicator"
                      style={{
                        '--slice-duration': `${slice.metadata?.duration || 1}s`
                      } as React.CSSProperties}
                    ></div>
                  )}
                </>
              )}
            </div>
            
            {/* Slice number - dynamically sized based on grid density */}
            <div 
              className="z-10 font-bold slice-number"
              style={{
                fontSize: slices.length > 64 ? '1rem' : 
                        slices.length > 36 ? '1.25rem' : 
                        slices.length > 16 ? '1.5rem' : 
                        slices.length > 9 ? '1.75rem' : '2rem'
              }}
            >
              {index + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SliceGrid;
