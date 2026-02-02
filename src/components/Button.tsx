import React from "react";

interface buttonProps {
  id: string;
  title: string;
  rightIcon?: React.ReactElement;
  leftIcon?: React.ReactElement;
  containerClass?: string;
  onClick?: () => void; // ← ÚJ SOR
}

const Button = ({
  title,
  id,
  rightIcon,
  leftIcon,
  containerClass,
  onClick, // ← ÚJ PARAMÉTER
}: buttonProps) => {
  return (
    <button
      id={id}
      className={`group relative z-10 w-fit cursor-pointer overflow-hidden rounded-full px-7 py-3 text-black ${containerClass} `}
      onClick={onClick} // ← ÚJ SOR
      >
      <span>{leftIcon}</span>
      <span className="relative incline-flex overlfow-hidden font-general text-xs uppercase ">
        <div>{title}</div>
      </span>
      <span>{rightIcon}</span>
    </button>
  );
};

export default Button;