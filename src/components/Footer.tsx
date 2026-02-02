import React from 'react';
import { FaInstagram, FaEnvelope } from 'react-icons/fa';

// TikTok ikon SVG komponens
const TikTokIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.04-.1z"/>
  </svg>
);

const socialLinks = [
  { 
    href: "https://www.instagram.com/senkisem.hu/", 
    icon: <FaInstagram />,
    label: "Instagram"
  },
  { 
    href: "https://www.tiktok.com/@senkisem.hu", 
    icon: <TikTokIcon />,
    label: "TikTok"
  },
  { 
    href: "mailto:senkisem.info@gmail.com", 
    icon: <FaEnvelope />,
    label: "Email"
  },
];

const Footer = () => {
  return (
    <footer className="w-screen bg-black border-t border-white/10 py-16 text-white">
      <div className="container mx-auto px-4 md:px-8 lg:px-16">
        {/* Desktop Layout - 4 Columns */}
        <div className="hidden md:grid md:grid-cols-4 gap-8 mb-12">
          {/* Senkisem Section */}
          <div>
            <h3 className="text-lg font-medium mb-4">Senkisem</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              Nem egy brand;<br />
              Üzenet.
            </p>
          </div>

          {/* Közösség Section */}
          <div>
            <h3 className="text-lg font-medium mb-4">Community</h3>
            <div className="flex gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-white transition-all duration-300 hover:bg-white/10 hover:-translate-y-0.5 backdrop-blur-sm"
                  aria-label={link.label}
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Ügyfélszolgálat Section */}
          <div>
            <h3 className="text-lg font-medium mb-4">Support</h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="mailto:senkisem.info@gmail.com"
                  className="text-white/60 text-sm hover:text-white transition-colors duration-300"
                >
                  senkisem.info@gmail.com
                </a>
              </li>
            </ul>
          </div>

          {/* Információk Section */}
          <div>
            <h3 className="text-lg font-medium mb-4">Info</h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="/"
                  className="text-white/60 text-sm hover:text-white transition-colors duration-300"
                >
                  About Us
                </a>
              </li>
              <li>
                <a 
                  href="/assets/ÁSZF.pdf"
                  className="text-white/60 text-sm hover:text-white transition-colors duration-300"
                >
                  Terms & Conditions
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Mobile Layout - Stacked */}
        <div className="md:hidden space-y-8 mb-12">
          {/* Senkisem Section */}
          <div>
            <h3 className="text-lg font-medium mb-3">Senkisem</h3>
            <p className="text-white/60 text-sm leading-relaxed">
              Not a Brand; Message.
            </p>
          </div>

          {/* Közösség Section */}
          <div>
            <h3 className="text-lg font-medium mb-3">Community</h3>
            <div className="flex gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-white transition-all duration-300 hover:bg-white/10 backdrop-blur-sm active:scale-95"
                  aria-label={link.label}
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Ügyfélszolgálat Section */}
          <div>
            <h3 className="text-lg font-medium mb-3">Support</h3>
            <a 
              href="mailto:senkisem.info@gmail.com"
              className="text-white/60 text-sm hover:text-white transition-colors duration-300"
            >
              senkisem.info@gmail.com
            </a>
          </div>

          {/* Információk Section */}
          <div>
            <h3 className="text-lg font-medium mb-3">Info</h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="/"
                  className="text-white/60 text-sm hover:text-white transition-colors duration-300"
                >
                  About Us
                </a>
              </li>
              <li>
                <a 
                  href="/assets/ÁSZF.pdf"
                  className="text-white/60 text-sm hover:text-white transition-colors duration-300"
                >
                  Terms & Conditions
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section - Copyright */}
        <div className="pt-8 border-t border-white/10">
          <p className="text-center text-white/40 text-sm">
            &copy; 2026 Senkisem - All rights reserved
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;