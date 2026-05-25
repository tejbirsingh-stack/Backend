import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import MfaSetup from '../components/MfaSetup';
import { useAuthStore } from '../stores/authStore';
import { 
  User, 
  Settings as SettingsIcon, 
  Shield, 
  Database, 
  Bell, 
  Palette,
  Globe,
  Key,
  Trash2,
  Save,
  RefreshCw
} from 'lucide-react';

export default function Settings() {
  const { user, token } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [settings, setSettings] = useState({
    profile: {
      name: user?.name || 'User',
      email: user?.email || 'user@example.com',
      avatar: '',
      timezone: 'UTC-8',
      language: 'English'
    },
    notifications: {
      emailNotifications: true,
      pushNotifications: true,
      weeklyReports: true,
      securityAlerts: true
    },
    privacy: {
      profileVisibility: 'team',
      activityTracking: true,
      dataCollection: false,
      mfaEnabled: false
    },
    storage: {
      autoCompress: true,
      compressionQuality: 'high',
      retentionPeriod: '1-year',
      maxFileSize: '2GB'
    }
  });

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy & Security', icon: Shield },
    { id: 'storage', label: 'Storage', icon: Database },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'integrations', label: 'Integrations', icon: Globe }
  ];

  const handleSave = () => {
    // Save settings logic here
    console.log('Saving settings:', settings);
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        <Navbar />
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
              <p className="text-gray-300">Manage your account and application preferences</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Tabs Sidebar */}
              <div className="lg:col-span-1">
                <div className="glass-card p-4">
                  <nav className="space-y-2">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-all ${
                          activeTab === tab.id
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <tab.icon className="w-5 h-5" />
                        <span className="font-medium">{tab.label}</span>
                      </button>
                    ))}
                  </nav>
                </div>
              </div>

              {/* Settings Content */}
              <div className="lg:col-span-3">
                <div className="glass-card p-6">
                  {/* Profile Settings */}
                  {activeTab === 'profile' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">Profile Settings</h2>
                        <button onClick={handleSave} className="btn-primary">
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
                          <input
                            type="text"
                            value={settings.profile.name}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              profile: { ...prev.profile, name: e.target.value }
                            }))}
                            className="input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                          <input
                            type="email"
                            value={settings.profile.email}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              profile: { ...prev.profile, email: e.target.value }
                            }))}
                            className="input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Timezone</label>
                          <select
                            value={settings.profile.timezone}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              profile: { ...prev.profile, timezone: e.target.value }
                            }))}
                            className="input-field w-full"
                          >
                            <option value="UTC-8">Pacific Time (UTC-8)</option>
                            <option value="UTC-5">Eastern Time (UTC-5)</option>
                            <option value="UTC+0">UTC</option>
                            <option value="UTC+1">Central European Time (UTC+1)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Language</label>
                          <select
                            value={settings.profile.language}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              profile: { ...prev.profile, language: e.target.value }
                            }))}
                            className="input-field w-full"
                          >
                            <option value="English">English</option>
                            <option value="Spanish">Spanish</option>
                            <option value="French">French</option>
                            <option value="German">German</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-medium text-white mb-4">Profile Picture</h3>
                        <div className="flex items-center space-x-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
                            <User className="w-8 h-8 text-white" />
                          </div>
                          <div>
                            <button className="btn-secondary">Upload New Photo</button>
                            <p className="text-gray-400 text-sm mt-1">JPG, PNG or GIF. Max size 2MB.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notifications Settings */}
                  {activeTab === 'notifications' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">Notification Preferences</h2>
                        <button onClick={handleSave} className="btn-primary">
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </button>
                      </div>

                      <div className="space-y-4">
                        {Object.entries(settings.notifications).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between py-3 border-b border-white/10">
                            <div>
                              <h3 className="text-white font-medium">
                                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                              </h3>
                              <p className="text-gray-400 text-sm">
                                {key === 'emailNotifications' && 'Receive notifications via email'}
                                {key === 'pushNotifications' && 'Receive push notifications in browser'}
                                {key === 'weeklyReports' && 'Get weekly activity reports'}
                                {key === 'securityAlerts' && 'Get alerts for security events'}
                              </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={value}
                                onChange={(e) => setSettings(prev => ({
                                  ...prev,
                                  notifications: { ...prev.notifications, [key]: e.target.checked }
                                }))}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Privacy & Security */}
                  {activeTab === 'privacy' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">Privacy & Security</h2>
                        <button onClick={handleSave} className="btn-primary">
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </button>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <h3 className="text-lg font-medium text-white mb-4">Account Security</h3>
                          <div className="space-y-4">
                            <button className="btn-secondary w-full justify-between">
                              <span className="flex items-center">
                                <Key className="w-4 h-4 mr-3" />
                                Change Password
                              </span>
                              <span className="text-gray-400">Last changed 30 days ago</span>
                            </button>
                            <button 
                              className="btn-secondary w-full justify-between" 
                              onClick={() => setShowMfaSetup(!showMfaSetup)}
                            >
                              <span className="flex items-center">
                                <Shield className="w-4 h-4 mr-3" />
                                Two-Factor Authentication
                              </span>
                              <span className={settings.privacy.mfaEnabled ? "text-green-400" : "text-gray-400"}>
                                {settings.privacy.mfaEnabled ? "Enabled" : "Disabled"}
                              </span>
                            </button>
                            
                            {showMfaSetup && (
                              <div className="mt-4">
                                <MfaSetup 
                                  token={token || ''} 
                                  onSuccess={() => {
                                    setSettings(prev => ({
                                      ...prev,
                                      privacy: { ...prev.privacy, mfaEnabled: true }
                                    }));
                                    setShowMfaSetup(false);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-lg font-medium text-white mb-4">Privacy Settings</h3>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-white font-medium">Profile Visibility</h4>
                                <p className="text-gray-400 text-sm">Who can see your profile information</p>
                              </div>
                              <select
                                value={settings.privacy.profileVisibility}
                                onChange={(e) => setSettings(prev => ({
                                  ...prev,
                                  privacy: { ...prev.privacy, profileVisibility: e.target.value }
                                }))}
                                className="input-field"
                              >
                                <option value="public">Public</option>
                                <option value="team">Team Only</option>
                                <option value="private">Private</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-lg font-medium text-white mb-4">Data Management</h3>
                          <div className="space-y-4">
                            <button className="btn-secondary text-red-400 hover:text-red-300">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Account
                            </button>
                            <p className="text-gray-400 text-sm">
                              Permanently delete your account and all associated data. This action cannot be undone.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Storage Settings */}
                  {activeTab === 'storage' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">Storage Settings</h2>
                        <button onClick={handleSave} className="btn-primary">
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Auto Compression</label>
                          <select
                            value={settings.storage.autoCompress ? 'enabled' : 'disabled'}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              storage: { ...prev.storage, autoCompress: e.target.value === 'enabled' }
                            }))}
                            className="input-field w-full"
                          >
                            <option value="enabled">Enabled</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Compression Quality</label>
                          <select
                            value={settings.storage.compressionQuality}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              storage: { ...prev.storage, compressionQuality: e.target.value }
                            }))}
                            className="input-field w-full"
                          >
                            <option value="low">Low (Fastest)</option>
                            <option value="medium">Medium</option>
                            <option value="high">High (Best Quality)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Data Retention</label>
                          <select
                            value={settings.storage.retentionPeriod}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              storage: { ...prev.storage, retentionPeriod: e.target.value }
                            }))}
                            className="input-field w-full"
                          >
                            <option value="30-days">30 Days</option>
                            <option value="90-days">90 Days</option>
                            <option value="1-year">1 Year</option>
                            <option value="forever">Forever</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Max File Size</label>
                          <select
                            value={settings.storage.maxFileSize}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              storage: { ...prev.storage, maxFileSize: e.target.value }
                            }))}
                            className="input-field w-full"
                          >
                            <option value="100MB">100 MB</option>
                            <option value="500MB">500 MB</option>
                            <option value="1GB">1 GB</option>
                            <option value="2GB">2 GB</option>
                            <option value="5GB">5 GB</option>
                          </select>
                        </div>
                      </div>

                      <div className="glass-card bg-blue-500/10 border-blue-500/20 p-4">
                        <h3 className="text-blue-400 font-medium mb-2">Storage Usage</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-300">Used</span>
                            <span className="text-white">2.4 TB / 5 TB</span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: '48%' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Appearance Settings */}
                  {activeTab === 'appearance' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">Appearance</h2>
                        <button onClick={handleSave} className="btn-primary">
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </button>
                      </div>

                      <div className="text-center py-12">
                        <Palette className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-white mb-2">Appearance Settings</h3>
                        <p className="text-gray-400">Theme customization options coming soon</p>
                      </div>
                    </div>
                  )}

                  {/* Integrations */}
                  {activeTab === 'integrations' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">Integrations</h2>
                        <button className="btn-primary">
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Refresh Connections
                        </button>
                      </div>

                      <div className="text-center py-12">
                        <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-white mb-2">Third-party Integrations</h3>
                        <p className="text-gray-400">Connect with Adobe Creative Suite, Slack, and more</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
