import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Home, Users, Mail, Layers } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import Prospects from './pages/Prospects'
import Emails from './pages/Emails'

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/campaigns', label: 'Campaigns', icon: Layers },
    { path: '/prospects', label: 'Prospects', icon: Users },
    { path: '/emails', label: 'Email Queue', icon: Mail },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">Auto Emailer</span>
            </div>

            <div className="flex gap-2">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.path
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`nav-link flex items-center gap-2 ${
                      isActive ? 'nav-link-active' : 'nav-link-inactive'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/prospects" element={<Prospects />} />
          <Route path="/emails" element={<Emails />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
