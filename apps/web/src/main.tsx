import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
// import App from './App.simple.tsx'; // Use simplified app for demo
import './index.css';

console.log('🚀 Main.tsx executing...');

// Debug React version
console.log('React version:', React.version);

const rootElement = document.getElementById('root');
console.log('📍 Root element:', rootElement);

if (rootElement) {
  console.log('🎯 Creating React root...');
  
  try {
    const root = ReactDOM.createRoot(rootElement);
    console.log('✅ React root created');
    
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    );
    console.log('✅ Render called');
  } catch (error) {
    console.error('❌ Error creating/rendering React root:', error);
  }
} else {
  console.error('❌ Root element not found! Check index.html');
}
