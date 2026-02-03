import { useEffect, useState, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/all";

gsap.registerPlugin(ScrollTrigger);

const Hero = () => {
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [videoStartTime, setVideoStartTime] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Eszköz méret detektálás
  useEffect(() => {
    const checkDevice = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    
    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, []);

  // Video betöltés és lejátszás optimalizálás
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Előtöltés indítása
    video.load();

    const checkLoading = () => {
      if ((window as any).loadingDone) {
        // Próbáld elindítani a videót
        const playPromise = video.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Siker - állítsd be a start time-ot
              setVideoStartTime(Date.now());
            })
            .catch((err) => {
              console.log("Video autoplay delayed:", err);
              // Ha nem sikerül, próbáld újra kicsit később
              setTimeout(() => {
                video.play()
                  .then(() => {
                    setVideoStartTime(Date.now());
                  })
                  .catch(() => {
                    console.log("Video autoplay failed, waiting for user interaction");
                  });
              }, 100);
            });
        }
      } else {
        requestAnimationFrame(checkLoading);
      }
    };
    
    checkLoading();
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

  // GSAP animáció CSAK PC-n
  useGSAP(() => {
    if (!isDesktop) return;

    gsap.set("#video-frame", {
      clipPath: "polygon(14% 0%, 72% 0%, 88% 90%, 0% 95%)",
      borderRadius: "0 0 10% 10%",
    });

    gsap.from("#video-frame", {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
      borderRadius: "0 0 0 0",
      scrollTrigger: {
        trigger: "#video-frame",
        start: "center center",
        end: "bottom center",
        scrub: true,
      },
    });
  }, [isDesktop]);

  return (
    <div className="relative h-dvh w-screen overflow-x-hidden">
      <div
        id="video-frame"
        className="relative z-10 h-dvh w-screen overflow-hidden bg-black"
      >
        {/* HERO VIDEO */}
        <video
          ref={videoRef}
          src="videos/hero-1.mp4"
          loop
          muted
          playsInline
          preload="auto"
          webkit-playsinline="true"
          className="
            absolute left-1/2 top-1/2
            -translate-x-1/2 -translate-y-1/2
            w-[140%] h-[45%]
            object-fill
            bg-black
            md:w-full md:h-full md:object-cover
          "
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