import { NavLink } from 'react-router-dom'

const backtestLinks = [
  { to: '/journal', label: 'Log Trade' },
  { to: '/trades', label: 'Trade Log' },
  { to: '/dashboard', label: 'Dashboard' },
]

const portfolioLinks = [
  { to: '/portfolio/journal', label: 'Log Trade' },
  { to: '/portfolio/trades', label: 'P. Log' },
  { to: '/portfolio/dashboard', label: 'P. Dashboard' },
]

function NavGroup({ links }) {
  return (
    <div className="flex items-center gap-1">
      {links.map(l => (
        <NavLink
          key={l.to}
          to={l.to}
          className={({ isActive }) =>
            `relative px-4 py-1.5 text-sm font-semibold rounded-lg transition-all duration-150 cursor-pointer select-none ${
              isActive
                ? 'text-brand-text bg-brand-raised border border-brand-border shadow-sm'
                : 'text-brand-muted hover:text-brand-text hover:bg-brand-raised'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {l.label}
              {isActive && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-text" />
              )}
            </>
          )}
        </NavLink>
      ))}
    </div>
  )
}

export default function NavBar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-[60px] flex items-center px-8 gap-6 bg-white border-b border-brand-border">

      {/* Logo */}
      <div className="flex items-baseline gap-2 mr-2 select-none">
        <span className="font-black text-xl text-brand-text tracking-tight" style={{ letterSpacing: '-0.03em' }}>CAP ✪ | Trading Community</span>
      </div>

      {/* Backtesting section */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest bg-brand px-2 py-0.5 rounded-full text-brand-muted border border-brand-border">Backtest</span>
        <NavGroup links={backtestLinks} />
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-brand-border mx-1" />

      {/* Portfolio section */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest bg-brand px-2 py-0.5 rounded-full text-brand-muted border border-brand-border">My Portfolio</span>
        <NavGroup links={portfolioLinks} />
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="w-1.5 h-1.5 rounded-full bg-brand-win" />
        <span className="text-xs text-brand-muted font-mono font-semibold tracking-wider">LIVE</span>
      </div>
    </nav>
  )
}
