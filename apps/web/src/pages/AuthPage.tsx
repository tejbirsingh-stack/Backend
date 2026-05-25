import { useState } from 'react';
import { Sailboat, Eye, EyeOff, ArrowRight, KeyRound, AlertTriangle, Loader2, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

// Force Railway deployment update - debug UI should be visible

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [organizations, setOrganizations] = useState([
    { id: 'org-1', name: 'Visit Detroit' }, 
    { id: 'org-2', name: 'Custom Organization' }
  ]);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    orgId: 'org-1',
    mfaCode: '',
  });

  const { 
    login, 
    register, 
    isLoading, 
    requiresMfa, 
    submitMfaCode, 
    resetPassword,
    error,
    clearError
  } = useAuthStore();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔐 Form submitted:', { email: formData.email, isLogin, requiresMfa });
    
    try {
      if (requiresMfa) {
        console.log('🔑 Submitting MFA code...');
        await submitMfaCode(formData.mfaCode);
      } else if (isLogin) {
        console.log('🔑 Attempting login...');
        await login({ 
          email: formData.email, 
          password: formData.password 
        });
        console.log('✅ Login successful');
      } else {
        // Registration
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        
        console.log('📝 Attempting registration...');
        await register({
          name: formData.fullName,
          email: formData.email,
          password: formData.password,
          orgId: formData.orgId
        });
        console.log('✅ Registration successful');
      }
    } catch (err: any) {
      // Error is handled in the auth store
      console.error('❌ Authentication error:', err.message);
      console.error('❌ Full error:', err);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const success = await resetPassword(forgotPasswordEmail);
      if (success) {
        setForgotPasswordSent(true);
      }
    } catch (err) {
      console.error('Password reset error:', err);
    }
  };
  
  const renderMfaForm = () => (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          VERIFICATION REQUIRED
        </h1>
        <p className="text-gray-300 text-sm">
          Enter the code from your authenticator app
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            name="mfaCode"
            placeholder="6-digit code"
            value={formData.mfaCode}
            onChange={handleInputChange}
            className="input-field w-full text-center text-xl tracking-widest"
            required
            autoFocus
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            inputMode="numeric"
            maxLength={6}
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full flex items-center justify-center gap-2 mt-6"
          disabled={isLoading || formData.mfaCode.length !== 6}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              Verify Code
              <KeyRound className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </>
  );
  
  const renderForgotPasswordForm = () => (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          RESET PASSWORD
        </h1>
        <p className="text-gray-300 text-sm">
          Enter your email to receive a password reset link
        </p>
      </div>

      {forgotPasswordSent ? (
        <div className="p-4 bg-green-800/30 border border-green-600 rounded-lg text-center">
          <p className="text-white mb-2">Password reset email sent!</p>
          <p className="text-gray-300 text-sm">Check your inbox for instructions</p>
          <button
            onClick={() => {
              setShowForgotPassword(false);
              setForgotPasswordSent(false);
              setForgotPasswordEmail('');
            }}
            className="btn-secondary mt-4 w-full"
          >
            Return to Login
          </button>
        </div>
      ) : (
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <div>
            <input
              type="email"
              value={forgotPasswordEmail}
              onChange={(e) => setForgotPasswordEmail(e.target.value)}
              placeholder="Email Address"
              className="input-field w-full"
              required
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1 flex items-center justify-center gap-2"
              disabled={isLoading || !forgotPasswordEmail}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </div>
        </form>
      )}
    </>
  );
  
  const renderAuthForm = () => (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          {isLogin ? 'WELCOME BACK' : 'CREATE ACCOUNT'}
        </h1>
        <p className="text-gray-300 text-sm">
          {isLogin 
            ? 'Sign in to your media asset management platform' 
            : 'Join our media asset management platform'
          }
        </p>
      </div>

      {/* Debug info */}
      <div className="mb-2 p-2 bg-blue-800/20 border border-blue-600 rounded text-xs text-blue-200">
        Debug: error="{error}" | isLoading={isLoading.toString()} | requiresMfa={requiresMfa.toString()}
        <br />
        Form data: email="{formData.email}" | password="{formData.password ? '***' : ''}"
        <br />
        API_URL: "{import.meta.env.VITE_API_URL || '/api'}" | Full URL: "{(import.meta.env.VITE_API_URL || '/api') + '/auth/login'}"
        <button 
          type="button" 
          onClick={() => console.log('🧪 Debug button clicked!', { 
            formData, 
            error, 
            isLoading, 
            apiUrl: import.meta.env.VITE_API_URL || '/api',
            fullLoginUrl: (import.meta.env.VITE_API_URL || '/api') + '/auth/login'
          })}
          className="ml-2 px-2 py-1 bg-blue-600 rounded text-xs"
        >
          Test Log
        </button>
        <button 
          type="button" 
          onClick={async () => {
            console.log('🔗 Testing API connectivity...');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            console.log('🔗 Using API URL:', apiUrl);
            try {
              const response = await fetch(apiUrl + '/health');
              console.log('🔗 Response status:', response.status);
              if (response.ok) {
                const data = await response.json();
                console.log('✅ Health check successful:', data);
              } else {
                console.error('❌ Health check failed with status:', response.status);
              }
            } catch (err) {
              console.error('❌ Health check failed:', err);
            }
          }}
          className="ml-2 px-2 py-1 bg-green-600 rounded text-xs"
        >
          Test API
        </button>
        <button 
          type="button" 
          onClick={async () => {
            console.log('🔗 Testing direct API call...');
            try {
              const response = await fetch('https://noah-production-e15c.up.railway.app/api/health');
              const data = await response.json();
              console.log('✅ Direct API call successful:', data);
            } catch (err) {
              console.error('❌ Direct API call failed:', err);
            }
          }}
          className="ml-2 px-2 py-1 bg-purple-600 rounded text-xs"
        >
          Test Direct
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-800/30 border border-red-600 rounded-lg flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" />
          <p className="text-red-200 text-sm flex-1">{error}</p>
          <button 
            className="text-red-300 hover:text-white"
            onClick={clearError}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div>
            <input
              type="text"
              name="fullName"
              placeholder="Full Name"
              value={formData.fullName}
              onChange={handleInputChange}
              className="input-field w-full"
              required
            />
          </div>
        )}

        <div>
          <input
            type="email"
            name="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleInputChange}
            className="input-field w-full"
            required
          />
        </div>

        {!isLogin && (
          <div className="flex gap-4">
            <select className="input-field flex-shrink-0">
              <option value="US">US +1</option>
              <option value="UK">UK +44</option>
              <option value="CA">CA +1</option>
            </select>
            <input
              type="tel"
              name="phone"
              placeholder="(555) 123-4567"
              value={formData.phone}
              onChange={handleInputChange}
              className="input-field flex-1"
              required
            />
          </div>
        )}

        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleInputChange}
            className="input-field w-full pr-12"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {!isLogin && (
          <>
            <div>
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className="input-field w-full"
                required
              />
            </div>
            
            <div>
              <select
                name="orgId"
                value={formData.orgId}
                onChange={handleInputChange}
                className="input-field w-full"
                required
              >
                <option value="" disabled>Select Organization</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <button
          type="submit"
          className="btn-primary w-full flex items-center justify-center gap-2 mt-6"
          disabled={isLoading}
          onClick={(e) => {
            console.log('🖱️ Submit button clicked!', { isLogin, formData: { email: formData.email, hasPassword: !!formData.password } });
          }}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {isLogin ? 'Signing in...' : 'Creating account...'}
            </>
          ) : (
            <>
              {isLogin ? 'Sign In' : 'Create Account'}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-400 text-sm">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-400 hover:text-blue-300 ml-1 font-medium transition-colors"
            disabled={isLoading}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>

      {isLogin && (
        <div className="mt-4 text-center">
          <button 
            onClick={() => setShowForgotPassword(true)}
            className="text-gray-400 hover:text-white text-sm transition-colors mr-4"
          >
            Forgot Password?
          </button>
          <a href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
            Privacy Policy and Terms of Service
          </a>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 gradient-orb rounded-full animate-float" />
        <div className="absolute top-3/4 right-1/4 w-80 h-80 gradient-orb rounded-full animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-1/4 left-1/2 w-64 h-64 gradient-orb rounded-full animate-float" style={{ animationDelay: '4s' }} />
      </div>

      {/* Auth Form */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Sailboat className="w-8 h-8 text-white mr-3" />
            <span className="text-2xl font-bold text-white">Noah</span>
          </div>
        </div>

        {/* Form Card */}
        <div className="glass-card p-8">
          {requiresMfa ? renderMfaForm() : 
           showForgotPassword ? renderForgotPasswordForm() : 
           renderAuthForm()}
        </div>
      </div>
    </div>
  );
}
