import { useEffect, useCallback, useState } from 'react';

export const useIsMac = () => {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
  }, []);
  return isMac;
};

export const getOS = () => {
  if (typeof window === 'undefined') return 'win';
  return navigator.userAgent.toUpperCase().indexOf('MAC') >= 0 ? 'mac' : 'win';
};

export const useKeyboardShortcut = (keyOrCombo, callback, modifiers = {}) => {
  const memoizedCallback = useCallback(callback, [callback]);

  useEffect(() => {
    let targetKey = "";
    let targetModifiers = { ...modifiers };

    if (Array.isArray(keyOrCombo)) {
      const keys = keyOrCombo.map((k) => String(k).toLowerCase());
      targetKey = keys[keys.length - 1] || "";
      if (keys.includes("alt") || keys.includes("option")) targetModifiers.alt = true;
      if (keys.includes("ctrl") || keys.includes("cmd") || keys.includes("meta")) targetModifiers.ctrl = true;
      if (keys.includes("shift")) targetModifiers.shift = true;
    } else if (typeof keyOrCombo === "string") {
      targetKey = keyOrCombo;
    }

    const handleKeyDown = (event) => {
      // Don't trigger standard keypresses if user is typing in basic inputs, EXCEPT for Enter/Escape/modifier combos
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
        if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key !== 'Enter' && event.key !== 'Escape') {
          return;
        }
      }

      if (!event.key || !targetKey) return;

      let parsedKey = event.key.toLowerCase();
      if (event.code && event.code.startsWith('Key')) {
        parsedKey = event.code.replace('Key', '').toLowerCase();
      } else if (event.code && event.code.startsWith('Digit')) {
        parsedKey = event.code.replace('Digit', '').toLowerCase();
      }

      const keyMatch = parsedKey === String(targetKey).toLowerCase();
      
      const mac = getOS() === 'mac';
      const isCtrlOrCmdPressed = mac ? event.metaKey : event.ctrlKey;
      
      const ctrlMatch = targetModifiers.ctrl ? isCtrlOrCmdPressed : !isCtrlOrCmdPressed;
      const altMatch = targetModifiers.alt ? event.altKey : !event.altKey;
      const shiftMatch = targetModifiers.shift ? event.shiftKey : !event.shiftKey;

      if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
        event.preventDefault();
        event.stopPropagation();
        memoizedCallback(event);
      }
    };

    // Use capture phase to intercept before generic DOM handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [keyOrCombo, modifiers, memoizedCallback]);
};

export const formatShortcut = (keys) => {
  if (!keys) return '';
  const mac = getOS() === 'mac';
  const keyList = Array.isArray(keys) ? keys : [keys];
  return keyList.map(k => {
    const str = String(k);
    if (str.toLowerCase() === 'ctrl' || str.toLowerCase() === 'cmd') return mac ? '⌘' : 'Ctrl';
    if (str.toLowerCase() === 'alt' || str.toLowerCase() === 'option') return mac ? '⌥' : 'Alt';
    if (str.toLowerCase() === 'shift') return mac ? '⇧' : 'Shift';
    return mac ? str.toUpperCase() : str;
  }).join(mac ? '' : '+');
};
