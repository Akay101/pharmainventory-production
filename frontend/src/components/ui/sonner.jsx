import { useEffect, useState } from "react"
import { Toaster as Sonner, toast } from "sonner"

// The app's theme is the .light class on <html> (no next-themes provider),
// so toasts follow it instead of the OS setting.
const appTheme = () => (document.documentElement.classList.contains("light") ? "light" : "dark")
function useAppTheme() {
  const [theme, setTheme] = useState(appTheme)
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(appTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return theme
}

const Toaster = ({
  ...props
}) => {
  const theme = useAppTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-2xl group-[.toaster]:font-sans",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props} />
  );
}

export { Toaster, toast }
