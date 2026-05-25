import React, { useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function ApiTestPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<string>('');

  const addResult = (test: string, success: boolean, data: any) => {
    setResults(prev => [...prev, { test, success, data, timestamp: new Date().toISOString() }]);
  };

  const testEndpoint = async (name: string, method: string, url: string, data?: any) => {
    setLoading(name);
    try {
      const response = await axios({ method, url: `${API_URL}${url}`, data });
      addResult(name, true, response.data);
    } catch (error: any) {
      addResult(name, false, {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
    }
    setLoading('');
  };

  const runAllTests = async () => {
    setResults([]);

    // Test 1: Health check
    await testEndpoint('Health Check', 'GET', '/health');

    // Test 2: Auth status
    await testEndpoint('Auth Status', 'GET', '/debug/auth-status');

    // Test 3: Create test user
    await testEndpoint('Create Test User', 'POST', '/debug/create-test-user', {
      email: 'test@visitdetroit.com',
      password: 'TestUser123!',
      name: 'Test User'
    });

    // Test 4: Login attempt
    await testEndpoint('Login Test', 'POST', '/auth/login', {
      email: 'admin@visitdetroit.com',
      password: 'VisitDetroit2024!'
    });

    // Test 5: Media list
    await testEndpoint('Media List', 'GET', '/media');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">API Connection Test</h1>

        <div className="mb-8 p-4 bg-blue-800/20 border border-blue-600 rounded">
          <h2 className="text-xl mb-2">Configuration</h2>
          <p><strong>Frontend URL:</strong> {window.location.origin}</p>
          <p><strong>API URL:</strong> {API_URL}</p>
          <p><strong>Full API Base:</strong> {API_URL === '/api' ? `${window.location.origin}/api` : API_URL}</p>
        </div>

        <div className="mb-8">
          <button
            onClick={runAllTests}
            disabled={!!loading}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Testing {loading}...
              </>
            ) : (
              'Run All Tests'
            )}
          </button>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl mb-4">Test Results</h2>
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-4 rounded border ${
                result.success
                  ? 'bg-green-800/20 border-green-600'
                  : 'bg-red-800/20 border-red-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-lg ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                  {result.success ? '✓' : '✗'}
                </span>
                <strong>{result.test}</strong>
                <span className="text-gray-400 text-sm">{result.timestamp}</span>
              </div>
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-yellow-800/20 border border-yellow-600 rounded">
          <h3 className="text-lg mb-2">Quick Actions</h3>
          <div className="space-x-4">
            <button
              onClick={() => testEndpoint('Health', 'GET', '/health')}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-1 rounded text-sm"
            >
              Test Health
            </button>
            <button
              onClick={() => testEndpoint('Auth Status', 'GET', '/debug/auth-status')}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-1 rounded text-sm"
            >
              Check Auth Status
            </button>
            <button
              onClick={() => {
                const email = prompt('Email:', 'test@visitdetroit.com');
                const password = prompt('Password:', 'TestUser123!');
                if (email && password) {
                  testEndpoint('Login', 'POST', '/auth/login', { email, password });
                }
              }}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-1 rounded text-sm"
            >
              Test Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}