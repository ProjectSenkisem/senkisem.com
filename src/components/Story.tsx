import { useRef } from "react";
import AnimatedTitle from "./AnimateTitle";
import gsap from "gsap";
import RoundedCorner from "./RoundedCorner";
import Button from "./Button";
import { MouseEvent as ReactMouseEvent } from "react";

const Story = () => {
  const frameRef = useRef<HTMLImageElement | null>(null);

  const handleMouseLeave = () => {
    const element = frameRef.current;
    if (!element) return;

    gsap.to(element, {
      duration: 0.5,
      rotateX: 0,
      rotateY: 0,
      ease: "power1.inOut",
    });
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    const element = frameRef.current;
    if (!element) return;

    const { clientX, clientY } = e;
    const rect = element.getBoundingClientRect();

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;

    gsap.to(element, {
      duration: 0.5,
      rotateX,
      rotateY,
      transformPerspective: 800,
      ease: "power1.inOut",
    });
  };

  const handleJoinClick = () => {
    window.location.href = "/merch.html";
  };

  return (
    <section id="story" className="min-h-dvh w-screen bg-black text-blue-50">
      <div className="flex size-full flex-col items-center pt-2 pb-24">

        <div className="relative w-full max-w-7xl">
          <AnimatedTitle
            title={"You write <b>your </b> own Story <br/>"}
            sectionId="#story"
            containerClass="mt-5 pointer-events-none mix-blend-difference relative z-10 leading-[2.3]"
          />

          <div className="story-img-container flex justify-center mt-16">
            <div className="story-img-mask w-full max-w-5xl">
              <div className="story-img-content overflow-hidden rounded-2xl">

                <img
                  ref={frameRef}
                  src="img/bze.jpg"
                  alt="entrance"
                  onMouseLeave={handleMouseLeave}
                  onMouseEnter={handleMouseLeave}
                  onMouseMove={handleMouseMove}
                  className="
                    w-full
                    h-[520px]
                    md:h-[640px]
                    object-cover
                    object-center
                    will-change-transform
                    transition-transform
                  "
                />

              </div>
            </div>

            <RoundedCorner />
          </div>
        </div>

        <div className="-mt-64 flex w-full justify-center md:-mt-56 md:justify-end md:pe-32">
          <div className="flex w-fit flex-col items-center md:items-start">
            <p className="mt-3 max-w-sm text-center font-circular-web text-violet-50 md:text-left">
              This is not a brand. <br></br><br></br>

This is the end; <br></br>
of what they told you. <br></br>

And the beginning; <br></br>
of what you always knew.
            </p>

            <Button
              id="realm-button"
              title="Join"
containerClass="
  mt-6
  bg-blue-50
  flex
  items-center
  justify-center
  gap-1
  cursor-pointer
  md:self-start
"
              onClick={handleJoinClick}
            />
          </div>
        </div>

      </div>
    </section>
  );
};

export default Story;