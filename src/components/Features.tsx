import React, { MouseEvent, ReactElement, useRef, useState } from "react";

interface bentoProsp {
  src: string;
  title: ReactElement;
  description: string;
  imageStyle?: React.CSSProperties;
}

interface bentoTiltProps {
  children: React.ReactNode;
  className?: string;
}

const BentoTilt = ({ children, className = "" }: bentoTiltProps) => {
  const [transformStyle, setTransformStyle] = useState<string>("");
  const itemRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: MouseEvent) => {
    if (!itemRef.current) return;

    const { left, top, width, height } =
      itemRef.current.getBoundingClientRect();

    const relativeX = (e.clientX - left) / width;
    const relativeY = (e.clientY - top) / height;

    const tiltX = (relativeX - 0.5) * 50;
    const tiltY = (relativeY - 0.5) * -50;
    const newTransform = `perspective(700px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(0.98, 0.98, 0.98)`;

    setTransformStyle(newTransform);
  };

  const handleMouseLeave = () => {
    setTransformStyle("");
  };

  return (
    <div
      className={`${className} duration-[0.2s]`}
      ref={itemRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform: transformStyle }}
    >
      {children}
    </div>
  );
};

// Ez a standard card: fekete bg + kép rajta
const BentoCard = ({ src, title, description, imageStyle }: bentoProsp) => {
  return (
    <div className="relative size-full bg-black">
      <img
        src={src}
        alt=""
        className="absolute left-0 top-0 size-full object-cover"
        style={imageStyle}
      />
      {/* Gradient overlay: alul sötétít, hogy a szöveg olvasható legyen */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="relative z-10 flex size-full flex-col justify-between p-5 text-blue-50">
        <div>
          <h1 className="bento-title special-font">{title}</h1>
          {description && (
            <p className="mt-3 max-w-64 text-xs md:text-base">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const Features = () => {
  return (
    <section id="features" className="bg-black pb-0">
      <div className="container mx-auto px-3 md:px-10">
        {/* Scrolling Text Section */}
        <div className="py-32">
          <p className="font-circular-web text-lg text-blue-50 text-center mb-8">
            Senkisem isn't just a brand.
          </p>

          <div className="relative overflow-hidden hidden">
            <div className="flex whitespace-nowrap animate-scroll">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center">
                  <h2 className="font-circular-web text-4xl md:text-6xl text-blue-50 mx-8">
                    ÜZENET.
                  </h2>
                  <h2 className="font-circular-web text-4xl md:text-6xl text-blue-50 mx-8">
                    MOZGALOM.
                  </h2>
                  <h2 className="font-circular-web text-4xl md:text-6xl text-blue-50 mx-8">
                    EMLÉKEZTETŐ.
                  </h2>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Nagy felső card: herop.png */}
        <BentoTilt className="border-hsla relative mb-7 h-96 w-full overflow-hidden rounded-md md:h-[65vh]">
          <BentoCard
            src="videos/herop.png"
            title={
              <>
                BRAND <b> ST</b>ORE
              </>
            }
            description="Every piece is a story. Every story is an experience. You don't wear logos – you wear messages."
            imageStyle={{ objectPosition: "center 11%" }}
          />
        </BentoTilt>

        {/* Grid: 3 alsó card */}
        <div className="grid h-[135vh] grid-cols-2 grid-rows-3 gap-7">
          {/* CARD 1: jgybg.png — standard BentoCard */}
          <BentoTilt className="bento-tilt_1 row-span-1 md:col-span-1 md:row-span-2">
            <BentoCard
              src="videos/jgybg.png"
              title={
                <>
                  Notes <b> From a </b> Stranger
                </>
              }
              description="The notes of a stranger who may have gone through the same things as you.
Or something completely different.
But that doesn’t matter now.
Because this book is not about me…
It’s about you."
            />
          </BentoTilt>

          {/* CARD 2: huae.png — custom design, fekete bg, gradient overlay a fehér kép felett */}
          <BentoTilt className="bento-tilt_1 row-span-1 md:col-span-1 md:ms-0">
            <div className="relative size-full bg-black">
              {/* Kép: object-contain, jobbra igazítva, hogy a bal oldalon legyen hely a szövegnek */}
              <img
                src="videos/huae.png"
                alt=""
                className="absolute left-0 top-0 size-full object-contain"
                style={{
                  objectPosition: "70% center",
                }}
              />
              {/* Erős bal oldali gradient: a fehér kép felett is olvasható lesz a szöveg */}
              <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
              {/* Egy kis alul gradient is, telefon-biztos */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="relative z-10 flex size-full flex-col justify-between p-5 text-blue-50">
                <div>
                  <h1 className="bento-title special-font">
                    User Manual <br /> For Life
                  </h1>
                  <p className="mt-3 max-w-64 text-xs md:text-base">
                    The continuation of the Notes. A system diagnostic based on real reader responses. It does not provide solutions : it signals a state. The Senkisem way.                  </p>
                </div>
              </div>
            </div>
          </BentoTilt>

          {/* CARD 3: feature-4.png — standard BentoCard */}
          <BentoTilt className="bento-tilt_1 md:col-span-1 md:me-0">
            <BentoCard
              src="videos/feature-4.png"
              title={
                <>
                  Something <b> New </b>  is Coming
                </>
              }
              description="?????????"
            />
          </BentoTilt>
        </div>
      </div>

      {/* CSS Animation */}
      <style>
{`
  @keyframes scrollLeft {
    0% { transform: translateX(0); }
    100% { transform: translateX(-33.333%); }
  }
`}
</style>
    </section>
  );
};

export default Features;