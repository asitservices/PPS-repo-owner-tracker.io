import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface OrgData {
  name: string;
  totalRepos: number;
  assignedRepos: number;
  percentage: number;
  lastUpdated: string;
}

interface TrendData {
  date: string;
  [key: string]: string | number;
}

export default function Dashboard() {
  const [orgData, setOrgData] = useState<OrgData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/repo-owner-tracker/data/dashboard-data.json');
        if (response.ok) {
          const data = await response.json();
          setOrgData(data.organizations || []);
          setTrendData(data.trends || []);
          setLastUpdate(new Date().toLocaleString('de-DE'));
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  const totalRepos = orgData.reduce((sum, org) => sum + org.totalRepos, 0);
  const assignedRepos = orgData.reduce((sum, org) => sum + org.assignedRepos, 0);
  const overallPercentage = totalRepos > 0 ? ((assignedRepos / totalRepos) * 100).toFixed(1) : '0';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🔐 Repository Owner Tracker</h1>
          <p className="text-slate-300">Security Process - Organization Assignment Progress</p>
          <p className="text-slate-400 text-sm mt-2">Last updated: {lastUpdate}</p>
        </div>

        {loading ? (
          <div className="text-center text-white text-xl">Loading...</div>
        ) : (
          <>
            {/* Overall Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg p-6 text-white shadow-lg">
                <div className="text-sm font-semibold opacity-90">Overall Progress</div>
                <div className="text-4xl font-bold mt-2">{overallPercentage}%</div>
                <div className="text-sm opacity-75 mt-1">
                  {assignedRepos} / {totalRepos} Repositories
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-lg p-6 text-white shadow-lg">
                <div className="text-sm font-semibold opacity-90">Assigned</div>
                <div className="text-4xl font-bold mt-2">{assignedRepos}</div>
                <div className="text-sm opacity-75 mt-1">Repositories with owners</div>
              </div>

              <div className="bg-gradient-to-br from-orange-600 to-orange-800 rounded-lg p-6 text-white shadow-lg">
                <div className="text-sm font-semibold opacity-90">Total Organizations</div>
                <div className="text-4xl font-bold mt-2">{orgData.length}</div>
                <div className="text-sm opacity-75 mt-1">Being monitored</div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Bar Chart - Organization Comparison */}
              <div className="bg-slate-700 rounded-lg p-6 shadow-lg">
                <h2 className="text-xl font-bold text-white mb-4">Organization Assignment Status</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={orgData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="name" stroke="#94a3b8" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                    <Legend />
                    <Bar dataKey="assignedRepos" fill="#10b981" name="Assigned" />
                    <Bar dataKey="totalRepos" fill="#64748b" name="Total" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie Chart - Overall Distribution */}
              <div className="bg-slate-700 rounded-lg p-6 shadow-lg">
                <h2 className="text-xl font-bold text-white mb-4">Assignment Distribution</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Assigned', value: assignedRepos },
                        { name: 'Not Assigned', value: totalRepos - assignedRepos },
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Trend Chart */}
            {trendData.length > 0 && (
              <div className="bg-slate-700 rounded-lg p-6 shadow-lg mb-8">
                <h2 className="text-xl font-bold text-white mb-4">Progress Trend</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#fff' }} />
                    <Legend />
                    {orgData.map((org, idx) => (
                      <Line
                        key={org.name}
                        type="monotone"
                        dataKey={org.name}
                        stroke={COLORS[idx]}
                        connectNulls
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Organization Details Table */}
            <div className="bg-slate-700 rounded-lg p-6 shadow-lg">
              <h2 className="text-xl font-bold text-white mb-4">Organization Details</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-slate-100">
                  <thead className="border-b border-slate-600">
                    <tr>
                      <th className="pb-3 font-semibold">Organization</th>
                      <th className="pb-3 font-semibold">Total Repos</th>
                      <th className="pb-3 font-semibold">Assigned</th>
                      <th className="pb-3 font-semibold">Not Assigned</th>
                      <th className="pb-3 font-semibold">Progress</th>
                      <th className="pb-3 font-semibold">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgData.map((org) => (
                      <tr key={org.name} className="border-b border-slate-600 hover:bg-slate-600 transition">
                        <td className="py-3 font-semibold">{org.name}</td>
                        <td className="py-3">{org.totalRepos}</td>
                        <td className="py-3 text-green-400">{org.assignedRepos}</td>
                        <td className="py-3 text-red-400">{org.totalRepos - org.assignedRepos}</td>
                        <td className="py-3">
                          <div className="w-full bg-slate-600 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${org.percentage}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-slate-300">{org.percentage.toFixed(1)}%</span>
                        </td>
                        <td className="py-3 text-slate-400 text-sm">{org.lastUpdated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}