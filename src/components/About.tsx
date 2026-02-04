import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/all";
import AnimateTitle from "./AnimateTitle";

gsap.registerPlugin(ScrollTrigger);

const About = () => {
  useGSAP(() => {
    const clipAnimation = gsap.timeline({
      scrollTrigger: {
        trigger: "#clip",
        start: "center center",
        end: "+=800 center",
        scrub: 0.5,
        pin: true,
        pinSpacing: true,
      },
    });

    clipAnimation.to(".mask-clip-path", {
      width: "100vw",
      height: "100vh",
      borderRadius: 0,
      ease: "none",
    });
  }, []);

  return (
    <div id="about" className="min-h-screen w-screen">
      {/* HEADER */}
      <div className="relative mb-8 mt-36 flex flex-col items-center gap-5">
        <p className="font-general text-sm uppercase md:text-[10px]">
          What is Senkisem?
        </p>

        <div className="flex flex-col items-center gap-6">
          <AnimateTitle
            sectionId="about"
            title={`Not<b> A</b> Brand;`}
            containerClass="mt-5 text-center !text-black animate-title"
          />

          <AnimateTitle
            sectionId="about-message"
            title={`Message.`}
            containerClass="text-center !text-black animate-title"
          />
        </div>

        <div className="about-subtext text-center mt-8">
          <p>"Senki sem" is a Hungarian phrase that translates to "nobody"</p>
          <p className="text-gray-500"></p>
        </div>
      </div>

      {/* IMAGE CLIP SECTION */}
      <div className="h-screen w-screen" id="clip">
        <div className="mask-clip-path about-image relative overflow-hidden">
          <img
            src="videos/about.png"
            alt="About"
            className="absolute left-0 top-0 size-full object-cover border border-black"
          />
        </div>
      </div>
    </div>
  );
};

export default About;