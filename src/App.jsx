import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import Journal from './pages/Journal'
import Trades from './pages/Trades'
import Dashboard from './pages/Dashboard'
import PortfolioJournal from './pages/PortfolioJournal'
import PortfolioTrades from './pages/PortfolioTrades'
import PortfolioDashboard from './pages/PortfolioDashboard'

export default function App() {
  return (
    <div className="min-h-screen bg-brand">
      <NavBar />
      <main className="pt-16">
        <Routes>
          <Route path="/" element={<Navigate to="/journal" replace />} />
          {/* Backtesting */}
          <Route path="/journal" element={<Journal />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/dashboard" element={<Dashboard />} />
          {/* My Portfolio */}
          <Route path="/portfolio" element={<Navigate to="/portfolio/dashboard" replace />} />
          <Route path="/portfolio/journal" element={<PortfolioJournal />} />
          <Route path="/portfolio/trades" element={<PortfolioTrades />} />
          <Route path="/portfolio/dashboard" element={<PortfolioDashboard />} />
        </Routes>
      </main>
    </div>
  )
}
