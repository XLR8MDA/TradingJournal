import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import Journal from './pages/Journal'
import Trades from './pages/Trades'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <div className="min-h-screen bg-brand">
      <NavBar />
      <main className="pt-16">
        <Routes>
          <Route path="/" element={<Navigate to="/journal" replace />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  )
}
