import * as React from "react"

import { cn } from "@/lib/utils"

// On phones a `mobileCards` table shows each row as a card. Cells are labelled
// from their column header; a header's `data-card` sets how its cells sit in
// the card: "title" (top, full width), "full", "actions" (bottom row) or "hide".
function labelCells(table) {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1]
  if (!headRow) return
  const cols = []
  for (const th of headRow.cells) {
    const label = th.dataset.cardLabel ?? th.textContent.replace(/[*↑↓⇅]/g, "").trim()
    for (let i = 0; i < (th.colSpan || 1); i++) cols.push({ label, card: th.dataset.card })
  }
  for (const body of [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])]) {
    for (const row of body.rows) {
      let col = 0
      for (const td of row.cells) {
        const meta = td.colSpan > 1 ? null : cols[col]
        col += td.colSpan || 1
        if (td.hasAttribute("data-card-own")) continue
        const label = meta?.label ?? ""
        if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label)
        if (meta?.card) {
          if (td.getAttribute("data-card") !== meta.card) td.setAttribute("data-card", meta.card)
        } else if (td.hasAttribute("data-card")) td.removeAttribute("data-card")
      }
    }
  }
}

function useMobileCards(tableRef, enabled) {
  React.useLayoutEffect(() => {
    const table = tableRef.current
    if (!enabled || !table) return
    let frame = 0
    const run = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => labelCells(table))
    }
    labelCells(table)
    const observer = new MutationObserver(run)
    observer.observe(table, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [tableRef, enabled])
}

const Table = React.forwardRef(({ className, wrapperClassName, mobileCards = false, ...props }, ref) => {
  const innerRef = React.useRef(null)
  const setRef = React.useCallback(
    (el) => {
      innerRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref]
  )
  useMobileCards(innerRef, mobileCards)
  return (
    <div className={cn("relative w-full overflow-auto", wrapperClassName, mobileCards && "table-cards-wrap")}>
      <table
        ref={setRef}
        className={cn("w-full caption-bottom text-sm", className, mobileCards && "table-cards")}
        {...props} />
    </div>
  )
})
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props} />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props} />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-all duration-200 hover:bg-muted/60 data-[state=selected]:bg-muted",
      className
    )}
    {...props} />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props} />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
