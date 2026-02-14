import PropTypes from "prop-types";
import { cloneElement, isValidElement, memo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ----------------------------------------
   Position Offsets
---------------------------------------- */
const positionOffsets = {
  top: ({ top, left, width }) => ({
    top: top - 8,
    left: left + width / 2,
    transform: "translate(-50%, -100%)",
  }),
  bottom: ({ top, left, width, height }) => ({
    top: top + height + 8,
    left: left + width / 2,
    transform: "translate(-50%, 0)",
  }),
  left: ({ top, left, height }) => ({
    top: top + height / 2,
    left: left - 8,
    transform: "translate(-100%, -50%)",
  }),
  right: ({ top, left, width, height }) => ({
    top: top + height / 2,
    left: left + width + 8,
    transform: "translate(0, -50%)",
  }),

  "top-left": ({ top, left }) => ({
    top: top - 8,
    left,
    transform: "translate(0, -100%)",
  }),
  "top-right": ({ top, left, width }) => ({
    top: top - 8,
    left: left + width,
    transform: "translate(-100%, -100%)",
  }),
  "bottom-left": ({ top, left, height }) => ({
    top: top + height + 8,
    left,
    transform: "translate(0, 0)",
  }),
  "bottom-right": ({ top, left, width, height }) => ({
    top: top + height + 8,
    left: left + width,
    transform: "translate(-100%, 0)",
  }),
};

/* ----------------------------------------
   Tooltip Component
---------------------------------------- */
const CustomTooltip = ({
  children,
  text,
  position = "top",
  bgColor = "bg-gray-800",
  textColor = "text-white",
  className = "",
  breakWords = false,
  triggerClassName = "inline-block",
}) => {
  const triggerRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  const [coords, setCoords] = useState(null);
  const [show, setShow] = useState(false);

  /* -------- Show Tooltip -------- */
  const showTooltip = () => {
    clearTimeout(hideTimeoutRef.current);

    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const offset = positionOffsets[position](rect);

    setCoords(offset);
    setShow(true);
  };

  /* -------- Hide Tooltip (Delayed) -------- */
  const hideTooltip = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShow(false);
    }, 200); // ⏱️ delay so user can move to tooltip
  };

  return (
    <>
      {/* Trigger */}
      {isValidElement(children) ? (
        cloneElement(children, {
          ref: triggerRef,
          onMouseEnter: showTooltip,
          onMouseLeave: hideTooltip,
          style: {
            cursor: "pointer",
            ...(children.props.style || {}),
          },
        })
      ) : (
        <span
          ref={triggerRef}
          className={triggerClassName}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
        >
          {children}
        </span>
      )}

      {/* Tooltip */}
      {show &&
        coords &&
        createPortal(
          <div
            className={`fixed z-[9999] px-3 py-1 rounded-lg text-xs shadow-xl
            transition-opacity duration-150 ease-in-out
            ${bgColor} ${textColor}
            ${breakWords ? "break-words max-w-xs" : "whitespace-nowrap"}
            ${className}
          `}
            style={coords}
            onMouseEnter={() => clearTimeout(hideTimeoutRef.current)}
            onMouseLeave={hideTooltip}
          >
            {text}

            <span
              className="absolute"
              style={getArrowStyle(position, bgColor)}
            />
          </div>,
          document.body
        )}
    </>
  );
};

/* ----------------------------------------
   Arrow Styles
---------------------------------------- */
function getArrowStyle(position, bgColorClass) {
  const color = tailwindToColor(bgColorClass);

  const common = {
    width: 0,
    height: 0,
    borderStyle: "solid",
  };

  switch (position) {
    case "top":
      return {
        ...common,
        bottom: -6,
        left: "50%",
        transform: "translateX(-50%)",
        borderWidth: "6px 6px 0 6px",
        borderColor: `${color} transparent transparent transparent`,
      };
    case "bottom":
      return {
        ...common,
        top: -6,
        left: "50%",
        transform: "translateX(-50%)",
        borderWidth: "0 6px 6px 6px",
        borderColor: `transparent transparent ${color} transparent`,
      };
    case "left":
      return {
        ...common,
        right: -6,
        top: "50%",
        transform: "translateY(-50%)",
        borderWidth: "6px 0 6px 6px",
        borderColor: `transparent transparent transparent ${color}`,
      };
    case "right":
      return {
        ...common,
        left: -6,
        top: "50%",
        transform: "translateY(-50%)",
        borderWidth: "6px 6px 6px 0",
        borderColor: `transparent ${color} transparent transparent`,
      };
    default:
      return {};
  }
}

/* ----------------------------------------
   Tailwind → Hex Color Map
---------------------------------------- */
function tailwindToColor(bgColorClass) {
  const map = {
    "bg-gray-800": "#1f2937",
    "bg-black": "#000000",
    "bg-white": "#ffffff",
    "bg-red-500": "#ef4444",
    "bg-green-500": "#22c55e",
    "bg-blue-500": "#3b82f6",
  };

  return map[bgColorClass] || "#000000";
}

/* ----------------------------------------
   PropTypes
---------------------------------------- */
CustomTooltip.propTypes = {
  children: PropTypes.node,
  text: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  position: PropTypes.oneOf([
    "top",
    "bottom",
    "left",
    "right",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]),
  bgColor: PropTypes.string,
  textColor: PropTypes.string,
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  breakWords: PropTypes.bool,
};

export default memo(CustomTooltip);
