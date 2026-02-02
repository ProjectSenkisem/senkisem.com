import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import gsap from "gsap";
import { RiMenuLine, RiCloseLine } from "react-icons/ri";

const navItems = [
  { label: "Merch", href: "/merch.html" },
  { label: "Books", href: "/books.html" },
];

const NavBar = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const lastScrollY = useRef(0);
  const isHidden = useRef(false);

  const [navReady, setNavReady] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  /* =========================
     DELAYED APPEAR (HERO UTÁN)
  ========================= */
  useEffect(() => {
    if (!containerRef.current) return;

    gsap.set(containerRef.current, {
      opacity: 0,
      y: -30,
      pointerEvents: "none",
    });

    const waitForLoading = () => {
      if ((window as any).loadingDone) {
        setTimeout(() => setNavReady(true), 5000);
      } else {
        requestAnimationFrame(waitForLoading);
      }
    };

    waitForLoading();
  }, []);

  useEffect(() => {
    if (!navReady || !containerRef.current) return;

    gsap.to(containerRef.current, {
      opacity: 1,
      y: 0,
      duration: 1.4,
      ease: "power2.out",
      pointerEvents: "auto",
    });
  }, [navReady]);

  /* =========================
     SCROLL VISIBILITY (NO JITTER)
  ========================= */
  useEffect(() => {
    if (!navReady) return;

    const onScroll = () => {
      const currentY = window.scrollY;

      setIsScrolled(currentY > 10);

      if (currentY > lastScrollY.current + 10 && !isHidden.current) {
        isHidden.current = true;
        gsap.to(containerRef.current, {
          y: -120,
          opacity: 0,
          duration: 0.25,
          ease: "power2.out",
        });
      }

      if (currentY < lastScrollY.current - 10 && isHidden.current) {
        isHidden.current = false;
        gsap.to(containerRef.current, {
          y: 0,
          opacity: 1,
          duration: 0.25,
          ease: "power2.out",
        });
      }

      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [navReady]);

  return (
    <>
      <div ref={containerRef} className="fixed top-0 inset-x-0 z-50">
        <header
          className={clsx(
            "w-full backdrop-blur-xl border-b border-white/10 transition-all",
            isScrolled ? "bg-black/90 py-4" : "bg-black/40 py-6 md:py-8"
          )}
        >
          <nav className="container mx-auto px-4 md:px-12 flex items-center justify-between">
            {/* LOGO */}
            <a
              href="/"
              className="font-serif text-2xl text-white"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Senkisem
            </a>

            {/* DESKTOP NAV */}
            <div className="hidden lg:flex gap-12 absolute left-1/2 -translate-x-1/2">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-white/60 hover:text-white text-sm uppercase tracking-widest relative group"
                >
                  {item.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-px bg-white group-hover:w-full transition-all" />
                </a>
              ))}
            </div>

            {/* MOBILE MENU BUTTON */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden w-11 h-11 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center"
            >
              <RiMenuLine className="text-white text-xl" />
            </button>
          </nav>
        </header>
      </div>

      {/* MOBILE MENU */}
      <div
        className={clsx(
          "fixed top-0 left-0 w-80 h-screen bg-black/95 backdrop-blur-3xl z-[2001] transition-transform lg:hidden",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex justify-between items-center p-8 border-b border-white/10">
          <span className="font-serif text-2xl text-white">Senkisem</span>
          <button onClick={() => setIsMobileMenuOpen(false)}>
            <RiCloseLine className="text-white text-2xl" />
          </button>
        </div>

        <nav className="flex flex-col gap-6 p-8">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-white/60 hover:text-white uppercase tracking-widest text-left"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      {/* OVERLAY */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[2000]"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
};

export default NavBar;
