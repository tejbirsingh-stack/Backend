import React from 'react';
import { Search, Settings, Bell } from 'lucide-react';

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-[#2A2A2E] border-b border-[#36363C] px-4 flex items-center justify-between z-50">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <img src="/ark-logo.svg" alt="Noah" className="h-8 w-8" />
          <span className="text-white text-xl font-semibold">Noah</span>
        </div>
        <div className="relative w-96">
          <input
            type="text"
            placeholder="Search files..."
            className="w-full bg-[#36363C] text-[#A9A9B4] rounded-lg px-4 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-[#5D8DE1]"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#A9A9B4] w-4 h-4" />
        </div>
      </div>
      <nav className="flex items-center space-x-6">
        <button className="text-[#A9A9B4] hover:text-white transition-colors">
          <Settings className="w-5 h-5" />
        </button>
        <button className="text-[#A9A9B4] hover:text-white transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <button className="w-8 h-8 rounded-full bg-[#5D8DE1] flex items-center justify-center text-white font-medium">
          JD
        </button>
      </nav>
    </header>
  );
}
