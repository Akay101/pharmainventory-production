// Access management in the UI: hide what a user can't use. The server
// enforces the same rules on every request; this only keeps the screen honest.
import { useLocation } from "react-router-dom";
import { useAuth } from "../../App";
import NoAccessPage from "./NoAccessPage";

/** { read, create, update, delete, any } for one module */
export function useAccess(module) {
  const { can } = useAuth();
  const read = can(module, "read");
  const create = can(module, "create");
  const update = can(module, "update");
  const del = can(module, "delete");
  return { read, create, update, delete: del, any: create || update || del };
}

/** Renders children only when the user may do `action` in `module` */
export function Can({ module, action = "read", children, fallback = null }) {
  const { can } = useAuth();
  return can(module, action) ? children : fallback;
}

/** Route guard: the page, or the "no access" page */
export function RequireAccess({ module, action = "read", adminOnly = false, children }) {
  const { can, isAdmin } = useAuth();
  const location = useLocation();
  const allowed = adminOnly ? isAdmin : can(module, action);
  if (allowed) return children;
  return <NoAccessPage module={adminOnly ? "users" : module} action={action} path={location.pathname} />;
}
