import React, { useState } from "react";
import { AlertCircle } from "lucide-react";

export default function WaveInput({
  id,
  name,
  type = "text",
  label = "",
  value = "",
  onChange,
  onBlur,
  onFocus,
  placeholder = " ",
  required = false,
  maxLength,
  disabled = false,
  error = "",
  helperText = "",
  leftIcon: LeftIcon = null,
  rightElement = null,
  className = "",
  inputClassName = "",
  "data-testid": testId,
  autoComplete = "off",
  ...rest
}) {
  const [isFocused, setIsFocused] = useState(false);

  const hasValue =
    value !== undefined && value !== null && String(value).length > 0;

  const handleFocus = (e) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  // Split label into individual characters for staggered wave animation
  const labelChars = label.split("").map((char, index) => (
    <span key={index} className="wave-char" style={{ "--index": index }}>
      {char === " " ? "\u00A0" : char}
    </span>
  ));

  return (
    <div className={`w-full ${className}`}>
      <div
        className={`wave-group relative ${LeftIcon ? "has-left-icon" : ""} ${
          rightElement ? "has-right-icon" : ""
        } ${hasValue ? "has-value" : ""} ${isFocused ? "is-focused" : ""} ${
          error ? "has-error" : ""
        } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {LeftIcon && (
          <span
            className={`wave-left-icon absolute left-0.5 top-1/2 -translate-y-1/2 z-10 transition-colors duration-200 pointer-events-none ${
              error
                ? "text-red-500"
                : isFocused
                ? "text-orange-500"
                : hasValue
                ? "text-foreground/80"
                : "text-muted-foreground"
            }`}
          >
            <LeftIcon className="w-4 h-4" />
          </span>
        )}

        <input
          id={id}
          name={name || id}
          type={type}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder || " "}
          required={required}
          maxLength={maxLength}
          disabled={disabled}
          autoComplete={autoComplete}
          data-testid={testId}
          className={`wave-input ${inputClassName}`}
          {...rest}
        />

        <span className="wave-bar"></span>

        {label && (
          <label htmlFor={id} className="wave-label">
            {labelChars}
            {required && (
              <span
                className="wave-char wave-required-star text-orange-500 font-bold ml-0.5"
                style={{ "--index": label.length }}
              >
                *
              </span>
            )}
          </label>
        )}

        {rightElement && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center">
            {rightElement}
          </div>
        )}
      </div>

      {/* Footer helper / error / char counter row */}
      {(error || helperText || maxLength) && (
        <div className="flex items-center justify-between text-[11px] px-0.5 pt-1 min-h-[16px]">
          {error ? (
            <div className="flex items-center gap-1 text-red-500 font-bold animate-in fade-in duration-150">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{error}</span>
            </div>
          ) : helperText ? (
            <span className="text-muted-foreground font-medium">
              {helperText}
            </span>
          ) : (
            <span />
          )}

          {maxLength && (
            <span
              className={`font-mono text-[10px] ml-auto shrink-0 ${
                String(value || "").length >= maxLength
                  ? "text-orange-500 font-bold"
                  : "text-muted-foreground"
              }`}
            >
              {String(value || "").length}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
