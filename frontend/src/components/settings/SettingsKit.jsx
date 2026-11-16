import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

export function SectionCard({ icon: Icon, title, description, className, children }) {
  return (
    <section className={cn("glass bg-card/45 border border-border/70 shadow-md rounded-2xl p-6 max-md:p-4 space-y-4", className)}>
      <header className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold leading-tight">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Field({ label, required, error, hint, id, className, children, ...inputProps }) {
  const fieldId = id || inputProps["data-testid"];
  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      <Label htmlFor={fieldId} className="text-xs font-semibold text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children || <Input id={fieldId} aria-invalid={!!error} className={error ? "border-rose-500" : ""} {...inputProps} />}
      {error ? <p className="text-xs text-rose-500">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// What the Update bar shows while saving
export const uploadStatus = (imageLabel, percent) =>
  percent === null || percent >= 100 ? { text: "Saving your changes…", percent: null } : { text: `Uploading ${imageLabel}… ${percent}%`, percent };

/**
 * The one Update button for a section. Sits in the page while there's nothing to
 * save, and pins to the bottom of the screen once there is, taking the mobile
 * tab bar's place (see .mobile-action-bar).
 */
export function UpdateBar({ active, changes, blocked, status, error, onUpdate, onDiscard, testId }) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const saving = !!status;
  const dirty = changes > 0;
  const pinned = active && (dirty || saving);

  const message = saving ? (
    <div className="flex-1 min-w-0 space-y-1.5" data-testid={`${testId}-progress`}>
      <p className="text-sm font-semibold truncate">{status.text}</p>
      {status.percent !== null ? (
        <Progress value={status.percent} className="h-1.5" />
      ) : (
        <div className="h-1.5 rounded-full bg-primary/40 animate-pulse" />
      )}
    </div>
  ) : error ? (
    <p className="flex-1 min-w-0 flex items-start gap-2 text-sm font-semibold text-rose-500" role="alert" data-testid={`${testId}-error`}>
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{error}</span>
    </p>
  ) : dirty ? (
    <p className="flex-1 min-w-0 text-sm font-semibold" data-testid={`${testId}-count`}>
      {changes} unsaved {changes === 1 ? "change" : "changes"}
    </p>
  ) : (
    <p className="flex-1 min-w-0 flex items-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      Everything is saved
    </p>
  );

  const bar = (
    <div
      className={cn(
        pinned
          ? "fixed bottom-0 left-0 right-0 z-[100] bg-card/95 backdrop-blur-xl border-t-2 border-border shadow-2xl px-6 py-3.5 mobile-action-bar max-md:px-3 max-md:pt-2.5 max-md:pb-[calc(0.625rem+env(safe-area-inset-bottom))]"
          : "glass bg-card/45 border border-border/70 rounded-2xl px-5 py-3.5"
      )}
      data-testid={`${testId}-bar`}
    >
      <div className="mx-auto max-w-5xl flex items-center gap-3 max-md:flex-wrap">
        {message}
        <div className="flex items-center gap-2 shrink-0 max-md:w-full">
          {dirty && (
            <Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmDiscard(true)} className="max-md:flex-1" data-testid={`${testId}-discard`}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Discard
            </Button>
          )}
          <Button type="button" onClick={onUpdate} disabled={saving || !dirty || blocked} className="btn-primary max-md:flex-1" data-testid={testId}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {error && dirty ? "Try again" : "Update"}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* The page animates with a transform, which would pin the bar to the page instead of the screen */}
      {pinned ? (
        <>
          {createPortal(bar, document.body)}
          <div className="h-16 max-md:hidden" />
        </>
      ) : (
        bar
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>Everything you changed here goes back to the last saved details. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid={`${testId}-discard-confirm`}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
