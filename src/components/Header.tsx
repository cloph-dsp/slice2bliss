import React from 'react';
import { Scissors } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="w-full py-6 mb-4 text-center">
      <div className="flex items-center justify-center gap-3 relative">
        <div className="relative group">
          <Scissors 
            className="text-yellow-400 h-8 w-8 transition-transform duration-300 hover:rotate-12" 
            strokeWidth={2.5}
          />
          <div className="absolute -inset-1 bg-yellow-400/20 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300"></div>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          <span className="text-white">Slice</span>
          <span className="text-yellow-400 relative inline-block hover:animate-pulse">2</span>
          <span className="text-white">Bliss</span>
        </h1>
      </div>
      <div className="h-0.5 w-16 mx-auto mt-3 bg-gradient-to-r from-transparent via-yellow-400 to-transparent"></div>
    </header>
  );
};

export default Header;
