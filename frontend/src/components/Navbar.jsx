import React, { useState, useEffect } from 'react';
import './Navbar.css';
import { Menu, X } from 'lucide-react';

const navLinks = ['Home', 'Features'];

const Navbar = ({ onNavigate }) => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNav = (e, target) => {
    e.preventDefault();
    setMenuOpen(false);
    const normalized = target.toLowerCase().replace(/\s+/g, '-');
    if (normalized === 'features' && onNavigate) {
      onNavigate('predictor');
      return;
    }
    if (normalized === 'home' && onNavigate) {
      onNavigate('home');
    }
    const id = normalized;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className={`navbar${scrolled ? ' navbar--scrolled' : ''}`} id="home">
      <div className="navbar__inner container">
        {/* Logo */}
        <a href="#home" className="navbar__logo" onClick={(e) => handleNav(e, 'home')}>
          <div className="navbar__logo-mark">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="#1C2B4A" strokeWidth="1.5"/>
              <path d="M8 20 Q14 4 20 20" stroke="#D4A5A7" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="14" cy="10" r="2.5" fill="#1C2B4A"/>
            </svg>
          </div>
          <span className="navbar__logo-text">Progena</span>
        </a>

        {/* Desktop Links */}
        <ul className="navbar__links">
          {navLinks.map(link => (
            <li key={link}>
              <a
                href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                className="navbar__link"
                onClick={(e) => handleNav(e, link)}
              >
                {link}
              </a>
            </li>
          ))}
        </ul>

        {/* Mobile Toggle */}
        <button
          className="navbar__toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          id="menu-toggle"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div className={`navbar__mobile${menuOpen ? ' navbar__mobile--open' : ''}`}>
        {navLinks.map(link => (
          <a
            key={link}
            href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
            className="navbar__mobile-link"
            onClick={(e) => handleNav(e, link)}
          >
            {link}
          </a>
        ))}
      </div>
    </nav>
  );
};

export default Navbar;
