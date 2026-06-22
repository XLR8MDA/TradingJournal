import { NavLink } from 'react-router-dom'

const links = [
  { to: '/journal', label: 'Add Trade' },
  { to: '/trades', label: 'Trade Log' },
  { to: '/dashboard', label: 'Dashboard' },
]

export default function NavBar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-16 flex items-center px-8 gap-10 bg-white border-b border-brand-border">

      {/* Logo */}
      <div className="flex items-baseline gap-2 mr-4 select-none">
        <span className="font-black text-xl text-brand-text" style={{ letterSpacing: '-0.03em' }}>EDGE</span>
        <span className="text-[11px] font-bold text-brand-muted tracking-widest uppercase">Journal</span>
      </div>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `relative px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-150 ${
                isActive
                  ? 'text-brand-text bg-brand-raised'
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

      <div className="ml-auto flex items-center gap-2.5">
        <div className="w-1.5 h-1.5 rounded-full bg-brand-win" />
        <span className="text-xs text-brand-muted font-mono font-semibold tracking-wider">LIVE</span>
      </div>
    </nav>
  )
}
