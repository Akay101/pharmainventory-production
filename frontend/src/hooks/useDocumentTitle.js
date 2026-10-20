import { useEffect } from "react";

export const getPageTitle = (pathname) => {
  const cleanPath = pathname?.toLowerCase().replace(/\/$/, "") || "";

  switch (cleanPath) {
    case "":
    case "/dashboard":
      return "Dashboard - DavaDesk";
    case "/inventory":
      return "Inventory - DavaDesk";
    case "/purchases":
    case "/purchase":
      return "Purchase - DavaDesk";
    case "/billing":
      return "Billing - DavaDesk";
    case "/suppliers":
      return "Suppliers - DavaDesk";
    case "/customers":
      return "Customers - DavaDesk";
    case "/expiry":
      return "Expiry - DavaDesk";
    case "/returns":
      return "Returns - DavaDesk";
    case "/users":
      return "Users - DavaDesk";
    case "/reports":
      return "Reports - DavaDesk";
    case "/settings":
      return "Settings - DavaDesk";
    case "/login":
      return "Login - DavaDesk";
    case "/register":
      return "Register - DavaDesk";
    case "/upgrade":
      return "Upgrade - DavaDesk";
    case "/payment-success":
      return "Payment Success - DavaDesk";
    case "/scan":
      return "Scanner - DavaDesk";
    case "/scan-bill":
      return "Billing Scanner - DavaDesk";
    default: {
      if (
        cleanPath.startsWith("/purchases") ||
        cleanPath.startsWith("/purchase")
      ) {
        return "Purchase - DavaDesk";
      }
      if (cleanPath.startsWith("/billing")) {
        return "Billing - DavaDesk";
      }
      if (cleanPath.startsWith("/inventory")) {
        return "Inventory - DavaDesk";
      }
      if (cleanPath.startsWith("/customers")) {
        return "Customers - DavaDesk";
      }
      if (cleanPath.startsWith("/suppliers")) {
        return "Suppliers - DavaDesk";
      }
      if (cleanPath.startsWith("/reports")) {
        return "Reports - DavaDesk";
      }
      if (cleanPath.startsWith("/returns")) {
        return "Returns - DavaDesk";
      }
      if (cleanPath.startsWith("/expiry")) {
        return "Expiry - DavaDesk";
      }
      if (cleanPath.startsWith("/users")) {
        return "Users - DavaDesk";
      }
      if (cleanPath.startsWith("/settings")) {
        return "Settings - DavaDesk";
      }
      return "DavaDesk - Pharmacy Management Software";
    }
  }
};

export default function useDocumentTitle(title) {
  useEffect(() => {
    if (title) {
      document.title =
        title.includes(" - ") || title.includes("DavaDesk")
          ? title
          : `${title} - DavaDesk`;
    }
  }, [title]);
}
