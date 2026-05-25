import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import { BarChart3, Users, HardDrive, Zap, TrendingUp, Activity } from 'lucide-react';

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState('7d');

  const stats = [
    {
      title: 'Total Assets',
      value: '12,847',
      change: '+12%',
      icon: HardDrive,
      color: 'from-blue-500 to-blue-600'
    },
    {
      title: 'Active Users',
      value: '1,429',
      change: '+8%',
      icon: Users,
      color: 'from-purple-500 to-purple-600'
    },
    {
      title: 'Storage Used',
      value: '2.4 TB',
      change: '+24%',
      icon: Activity,
      color: 'from-green-500 to-green-600'
    },
    {
      title: 'Compression Ratio',
      value: '12.5:1',
      change: '+2%',
      icon: Zap,
      color: 'from-orange-500 to-orange-600'
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        <Navbar />
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
              <p className="text-gray-300">Welcome back! Here's what's happening with your media assets.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {stats.map((stat, index) => (
                <div key={index} className="glass-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm font-medium">{stat.title}</p>
                      <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                      <p className="text-green-400 text-sm mt-1">{stat.change} from last week</p>
                    </div>
                    <div className={`p-3 rounded-lg bg-gradient-to-r ${stat.color}`}>
                      <stat.icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Upload Activity */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-white">Upload Activity</h3>
                  <select 
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="input-field text-sm py-2"
                  >
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                  </select>
                </div>
                
                <div className="h-64 flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-400">Chart visualization would go here</p>
                    <p className="text-gray-500 text-sm">Integration with Chart.js or similar</p>
                  </div>
                </div>
              </div>

              {/* Storage Distribution */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white mb-6">Storage Distribution</h3>
                
                <div className="space-y-4">
                  {[
                    { type: 'Video Files', percentage: 65, size: '1.56 TB', color: 'bg-blue-500' },
                    { type: 'Images', percentage: 25, size: '600 GB', color: 'bg-purple-500' },
                    { type: 'Audio Files', percentage: 8, size: '192 GB', color: 'bg-green-500' },
                    { type: 'Other', percentage: 2, size: '48 GB', color: 'bg-orange-500' }
                  ].map((item, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white">{item.type}</span>
                        <span className="text-gray-400">{item.size}</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${item.color}`}
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-6">Recent Activity</h3>
              
              <div className="space-y-4">
                {[
                  { action: 'Video uploaded', file: 'project_final.mp4', user: 'Sarah Johnson', time: '2 minutes ago' },
                  { action: 'Compression completed', file: 'interview_raw.mov', user: 'System', time: '5 minutes ago' },
                  { action: 'Collection created', file: 'Q4 Marketing Assets', user: 'Mike Chen', time: '12 minutes ago' },
                  { action: 'File shared', file: 'logo_variants.zip', user: 'Emma Davis', time: '1 hour ago' },
                  { action: 'Thumbnail generated', file: 'product_demo.mp4', user: 'System', time: '2 hours ago' }
                ].map((activity, index) => (
                  <div key={index} className="flex items-center justify-between py-3 border-b border-white/10 last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-blue-400 rounded-full" />
                      <div>
                        <p className="text-white text-sm">
                          <span className="font-medium">{activity.action}:</span> {activity.file}
                        </p>
                        <p className="text-gray-400 text-xs">by {activity.user}</p>
                      </div>
                    </div>
                    <span className="text-gray-400 text-xs">{activity.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
