import React from 'react';
import './Footer.css';

const footerLinks = ['Home', 'About', 'Features', 'How It Works', 'Contact'];

const Footer = () => {
  const handleNav = (e, target) => {
    e.preventDefault();
    const id = target.toLowerCase().replace(/\s+/g, '-');
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="footer" id="footer">
      <div className="container footer__inner">
        {/* Logo + tagline */}
        <div className="footer__brand">
          <div className="footer__logo">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="13" stroke="#E8C7C8" strokeWidth="1.5"/>
              <path d="M8 20 Q14 4 20 20" stroke="#D4A5A7" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="14" cy="10" r="2.5" fill="#E8C7C8"/>
            </svg>
            <span className="footer__logo-text">Progena</span>
          </div>
          <p className="footer__tagline">
            Intelligent IVF. Better Decisions.<br />Better Outcomes.
          </p>
          <div className="footer__badges">
            <span className="footer__badge">HIPAA Compliant</span>
            <span className="footer__badge">SOC 2 Type II</span>
            <span className="footer__badge">CE Marked</span>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="footer__nav" aria-label="Footer navigation">
          <h4 className="footer__nav-title">Navigation</h4>
          <ul className="footer__nav-list">
            {footerLinks.map(link => (
              <li key={link}>
                <a
                  href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                  className="footer__nav-link"
                  onClick={(e) => handleNav(e, link)}
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Legal */}
        <div className="footer__legal-col">
          <h4 className="footer__nav-title">Legal</h4>
          <ul className="footer__nav-list">
            {['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Security'].map(l => (
              <li key={l}>
                <a href="#" className="footer__nav-link">{l}</a>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact Info */}
        <div className="footer__contact">
          <h4 className="footer__nav-title">Contact</h4>
          <p className="footer__contact-text">hello@progena.health</p>
          <p className="footer__contact-text">+44 20 7946 0321</p>
          <p className="footer__contact-text" style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
            12 Harley Street, London, UK
          </p>
        </div>
      </div>

      <div className="footer__bottom">
        <div className="container footer__bottom-inner">
          <span>© {new Date().getFullYear()} Progena Health Technologies Ltd. All rights reserved.</span>
          <span className="footer__bottom-note">Designed for fertility specialists, not intended as direct medical advice.</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
