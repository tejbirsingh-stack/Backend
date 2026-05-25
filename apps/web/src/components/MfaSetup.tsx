import { useState } from 'react';
import { 
  Shield, 
  Lock, 
  KeyRound, 
  CheckCircle, 
  AlertTriangle, 
  Copy, 
  Loader2 
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface MfaSetupProps {
  token: string;
  onSuccess?: () => void;
}

enum SetupStep {
  Initial,
  QrCode,
  Verification,
  Success
}

export default function MfaSetup({ token, onSuccess }: MfaSetupProps) {
  const [step, setStep] = useState<SetupStep>(SetupStep.Initial);
  const [otpUri, setOtpUri] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const startSetup = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(
        `${API_URL}/api/auth/mfa/setup`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSecret(response.data.secret);
      setOtpUri(response.data.otpUri);
      setStep(SetupStep.QrCode);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to setup MFA');
    } finally {
      setIsLoading(false);
    }
  };
  
  const verifyCode = async () => {
    if (verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      await axios.post(
        `${API_URL}/api/auth/mfa/enable`,
        { code: verificationCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setStep(SetupStep.Success);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to verify code');
    } finally {
      setIsLoading(false);
    }
  };
  
  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="glass-card p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <Shield className="w-12 h-12 text-blue-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white">Two-Factor Authentication</h2>
      </div>
      
      {error && (
        <div className="p-3 mb-4 bg-red-800/30 border border-red-600 rounded-lg flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" />
          <p className="text-red-200 text-sm">{error}</p>
        </div>
      )}
      
      {step === SetupStep.Initial && (
        <div>
          <p className="text-gray-300 mb-4">
            Enable two-factor authentication to add an extra layer of security to your account.
            You'll need an authenticator app like Google Authenticator or Authy.
          </p>
          
          <button
            onClick={startSetup}
            className="btn-primary w-full flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting Up...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Setup Two-Factor Authentication
              </>
            )}
          </button>
        </div>
      )}
      
      {step === SetupStep.QrCode && (
        <div>
          <p className="text-gray-300 mb-4">
            Scan this QR code with your authenticator app or enter the secret key manually.
          </p>
          
          <div className="bg-white p-4 rounded-lg mb-4 mx-auto w-fit">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpUri)}`}
              alt="MFA QR Code"
              width={200}
              height={200}
            />
          </div>
          
          <div className="flex items-center mb-6 p-3 bg-gray-800/50 rounded border border-gray-700">
            <div className="flex-1 font-mono text-sm text-gray-300 break-all">
              {secret}
            </div>
            <button 
              onClick={copySecret}
              className="ml-2 p-2 hover:bg-gray-700 rounded"
            >
              {copied ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <Copy className="w-5 h-5 text-gray-400" />
              )}
            </button>
          </div>
          
          <button
            onClick={() => setStep(SetupStep.Verification)}
            className="btn-primary w-full"
          >
            Continue
          </button>
        </div>
      )}
      
      {step === SetupStep.Verification && (
        <div>
          <p className="text-gray-300 mb-4">
            Enter the 6-digit code from your authenticator app to verify setup.
          </p>
          
          <div className="mb-4">
            <input
              type="text"
              placeholder="6-digit code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="input-field w-full text-center text-xl tracking-widest"
              required
              autoFocus
              pattern="[0-9]{6}"
              inputMode="numeric"
              maxLength={6}
            />
          </div>
          
          <button
            onClick={verifyCode}
            className="btn-primary w-full flex items-center justify-center gap-2"
            disabled={isLoading || verificationCode.length !== 6}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                Verify & Enable
              </>
            )}
          </button>
        </div>
      )}
      
      {step === SetupStep.Success && (
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h3 className="text-xl text-white mb-2">Two-Factor Authentication Enabled</h3>
          <p className="text-gray-300 mb-6">
            Your account is now protected with an additional layer of security.
            You'll be asked for a verification code when signing in.
          </p>
        </div>
      )}
    </div>
  );
}
