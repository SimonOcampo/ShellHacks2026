import { useId } from "react";

export default function HeroPhotoTrio({ src }: { src: string }) {
  const id = useId().replace(/:/g, "");

  return (
    <div className="hero-photo-trio" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <svg key={index} viewBox="66 40 267 480" className="hero-photo-capsule">
          <defs>
            <clipPath id={`${id}-${index}`}>
              <rect
                x="110"
                y="50"
                width="180"
                height="460"
                rx="90"
                transform="rotate(28 200 280)"
              />
            </clipPath>
          </defs>
          <image
            href={src}
            x={-index * 260}
            y="0"
            width="920"
            height="560"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${id}-${index})`}
          />
        </svg>
      ))}
    </div>
  );
}
