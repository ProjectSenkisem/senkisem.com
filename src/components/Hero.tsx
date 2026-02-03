import { useEffect, useState, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/all";

gsap.registerPlugin(ScrollTrigger);

const Hero = () => {
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [videoStartTime, setVideoStartTime] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const checkIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Optimalizált loading check - interval helyett requestAnimationFrame
    let frameId: number;
    let lastCheck = 0;
    const checkInterval = 100; // Check every 100ms instead of every frame
    
    const checkLoading = (timestamp: number) => {
      if (timestamp - lastCheck >= checkInterval) {
        lastCheck = timestamp;
        
        if ((window as any).loadingDone && videoRef.current) {
          // Video lazy loading - csak amikor látható
          const observer = new IntersectionObserver(
            (entries) => {
              if (entries[0].isIntersecting) {
                videoRef.current?.play().catch(() => {});
                setVideoStartTime(Date.now());
                observer.disconnect();
              }
            },
            { threshold: 0.25 }
          );
          
          if (videoRef.current) {
            observer.observe(videoRef.current);
          }
          return; // Stop checking
        }
      }
      frameId = requestAnimationFrame(checkLoading);
    };
    
    frameId = requestAnimationFrame(checkLoading);
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (videoStartTime) {
      const timer = setTimeout(() => setShowScrollHint(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [videoStartTime]);

  useGSAP(() => {
    if (showScrollHint) {
      gsap.fromTo(
        "#scroll-hint",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 1.5, ease: "power2.out" }
      );
    }
  }, [showScrollHint]);

  useGSAP(() => {
    gsap.set("#video-frame", {
      clipPath: "polygon(14% 0%, 72% 0%, 88% 90%, 0% 95%)",
      borderRadius: "0 0 10% 10%",
    });

    const scrollTrigger = gsap.from("#video-frame", {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
      borderRadius: "0 0 0 0",
      scrollTrigger: {
        trigger: "#video-frame",
        start: "center center",
        end: "bottom center",
        scrub: 1, // Changed from true to 1 for smoother performance
        invalidateOnRefresh: true,
      },
    });

    return () => {
      scrollTrigger.scrollTrigger?.kill();
    };
  }, []);

  return (
    <div className="relative h-dvh w-screen overflow-x-hidden">
      <div
        id="video-frame"
        className="relative z-10 h-dvh w-screen overflow-hidden bg-black"
      >
        {/* HERO VIDEO with better attributes */}
        <video
          ref={videoRef}
          src="videos/hero-1.mp4"
          loop
          muted
          playsInline
          preload="metadata" // Changed from auto to metadata
          className="
            absolute left-1/2 top-1/2
            -translate-x-1/2 -translate-y-1/2
            w-[140%] h-[70%]
            object-fill
            bg-black
            md:w-full md:h-full md:object-cover
          "
          style={{ willChange: 'auto' }} // Remove will-change when not animating
        />

        {/* SCROLL HINT */}
        {showScrollHint && (
          <div className="pointer-events-none absolute bottom-8 left-1/2 z-50 -translate-x-1/2">
            <p
              id="scroll-hint"
              className="text-sm font-light tracking-wide text-neutral-300"
            >
              Scroll for more
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Hero;