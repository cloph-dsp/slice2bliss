import React from 'react';
import { Volume2 } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="w-full mb-8 text-center">
      <div className="flex items-center justify-center gap-2 mb-1">
        <Volume2 className="text-yellow-400 h-7 w-7" />
        <h1 className="text-3xl md:text-4xl font-bold text-yellow-400">Slice2Bliss</h1>
      </div>
      <p className="text-gray-400 mt-1.5 text-sm md:text-base font-medium">Transform audio into playable slices</p>
    </header>
  );
};

export default Header;
