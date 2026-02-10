import { useState, useRef, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Plus, Trash2, Save, X, Check, Edit2 } from "lucide-react";
import { cn } from "../lib/utils";

// Editable cell component
const EditableCell = ({ 
  value, 
  onChange, 
  type = "text", 
  options = [], 
  placeholder = "",
  className = "",
  editable = true,
  onKeyDown
}) => {
  if (!editable) {
    return <span className={className}>{value || "-"}</span>;
  }

  if (type === "select" && options.length > 0) {
    return (
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className={cn("h-8 text-xs", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("h-8 text-xs px-2", className)}
      onKeyDown={onKeyDown}
    />
  );
};

// Main editable table component
export default function EditableTable({
  columns,
  data,
  onDataChange,
  onRowAdd,
  onRowDelete,
  onRowSave,
  emptyRow,
  showAddRow = true,
  stickyHeader = true,
  maxHeight = "400px",
  className = "",
}) {
  const [editingId, setEditingId] = useState(null);
  const [newRow, setNewRow] = useState(null);
  const tableRef = useRef(null);

  // Start adding a new row
  const handleStartAdd = () => {
    setNewRow({ ...emptyRow, _isNew: true, _tempId: Date.now() });
    setEditingId(null);
  };

  // Cancel adding new row
  const handleCancelAdd = () => {
    setNewRow(null);
  };

  // Save new row
  const handleSaveNewRow = () => {
    if (onRowAdd && newRow) {
      const { _isNew, _tempId, ...rowData } = newRow;
      onRowAdd(rowData);
      setNewRow(null);
    }
  };

  // Update new row field
  const handleNewRowChange = (field, value) => {
    setNewRow((prev) => ({ ...prev, [field]: value }));
  };

  // Start editing existing row
  const handleStartEdit = (rowId) => {
    setEditingId(rowId);
    setNewRow(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // Save edited row
  const handleSaveEdit = (row) => {
    if (onRowSave) {
      onRowSave(row);
    }
    setEditingId(null);
  };

  // Update existing row field
  const handleRowChange = (rowId, field, value) => {
    if (onDataChange) {
      const updatedData = data.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      );
      onDataChange(updatedData);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e, isNewRow, rowId) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isNewRow) {
        handleSaveNewRow();
      } else {
        handleSaveEdit(data.find((r) => r.id === rowId));
      }
    } else if (e.key === "Escape") {
      if (isNewRow) {
        handleCancelAdd();
      } else {
        handleCancelEdit();
      }
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div 
        className="overflow-auto rounded-lg border border-border"
        style={{ maxHeight }}
        ref={tableRef}
      >
        <table className="w-full text-sm">
          <thead className={cn(
            "bg-muted/50",
            stickyHeader && "sticky top-0 z-10"
          )}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider border-b border-border whitespace-nowrap",
                    col.width && `w-[${col.width}]`
                  )}
                  style={col.width ? { width: col.width } : {}}
                >
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium text-muted-foreground text-xs uppercase tracking-wider border-b border-border w-[100px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {/* New row input */}
            {newRow && (
              <tr className="bg-primary/5 animate-fade-in">
                {columns.map((col) => (
                  <td key={col.key} className="px-2 py-2">
                    <EditableCell
                      value={newRow[col.key]}
                      onChange={(val) => handleNewRowChange(col.key, val)}
                      type={col.type || "text"}
                      options={col.options || []}
                      placeholder={col.placeholder || col.label}
                      onKeyDown={(e) => handleKeyDown(e, true)}
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-primary hover:bg-primary/20"
                      onClick={handleSaveNewRow}
                      data-testid="save-new-row-btn"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      onClick={handleCancelAdd}
                      data-testid="cancel-new-row-btn"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            )}

            {/* Existing rows */}
            {data.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    isEditing && "bg-primary/5"
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-2 py-2">
                      {isEditing ? (
                        <EditableCell
                          value={row[col.key]}
                          onChange={(val) => handleRowChange(row.id, col.key, val)}
                          type={col.type || "text"}
                          options={col.options || []}
                          placeholder={col.placeholder || col.label}
                          onKeyDown={(e) => handleKeyDown(e, false, row.id)}
                        />
                      ) : (
                        <span className="text-sm">
                          {col.render ? col.render(row[col.key], row) : row[col.key] || "-"}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-primary hover:bg-primary/20"
                            onClick={() => handleSaveEdit(row)}
                            data-testid={`save-row-${row.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:bg-muted"
                            onClick={handleCancelEdit}
                            data-testid={`cancel-row-${row.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/20"
                            onClick={() => handleStartEdit(row.id)}
                            data-testid={`edit-row-${row.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {onRowDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/20"
                              onClick={() => onRowDelete(row)}
                              data-testid={`delete-row-${row.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Empty state */}
            {data.length === 0 && !newRow && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No items yet. Click "Add Item" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add button */}
      {showAddRow && !newRow && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={handleStartAdd}
          data-testid="add-row-btn"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      )}
    </div>
  );
}

// Export cell component for custom use
export { EditableCell };
