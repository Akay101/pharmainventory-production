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

export const useKeyboardShortcut = (key, callback, modifiers = {}) => {
  const memoizedCallback = useCallback(callback, [callback]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      // Don't trigger standard keypresses if user is typing in basic inputs, EXCEPT for Enter/Escape/modifier combos
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
        if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key !== 'Enter' && event.key !== 'Escape') {
          return;
        }
      }
      let parsedKey = event.key.toLowerCase();
      if (event.code && event.code.startsWith('Key')) {
        parsedKey = event.code.replace('Key', '').toLowerCase();
      } else if (event.code && event.code.startsWith('Digit')) {
        parsedKey = event.code.replace('Digit', '').toLowerCase();
      }

      const keyMatch = parsedKey === key.toLowerCase();
      
      const mac = getOS() === 'mac';
      const isCtrlOrCmdPressed = mac ? event.metaKey : event.ctrlKey;
      
      const ctrlMatch = modifiers.ctrl ? isCtrlOrCmdPressed : !isCtrlOrCmdPressed;
      const altMatch = modifiers.alt ? event.altKey : !event.altKey;
      const shiftMatch = modifiers.shift ? event.shiftKey : !event.shiftKey;

      if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
        // Only preventDefault if the callback actually plans to do something, but typically global shortcuts should prevent default.
        event.preventDefault();
        event.stopPropagation();
        memoizedCallback(event);
      }
    };

    // Use capture phase to intercept before generic DOM handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [key, modifiers, memoizedCallback]);
};

export const formatShortcut = (keys) => {
  const mac = getOS() === 'mac';
  return keys.map(k => {
    if (k.toLowerCase() === 'ctrl' || k.toLowerCase() === 'cmd') return mac ? '⌘' : 'Ctrl';
    if (k.toLowerCase() === 'alt' || k.toLowerCase() === 'option') return mac ? '⌥' : 'Alt';
    if (k.toLowerCase() === 'shift') return mac ? '⇧' : 'Shift';
    return mac ? k.toUpperCase() : k;
  }).join(mac ? '' : '+');
};
