"use client";

import { createContext, useContext, useState, useCallback, useSyncExternalStore, useEffect } from "react";

/* ─── Types ─── */

export type NotificationType = "success" | "error" | "warning" | "info";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
};

type NotificationsContextValue = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
};

/* ─── Context ─── */

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const STORAGE_KEY = "app-notifications-v1";
const MAX_NOTIFICATIONS = 50;

/* ─── localStorage sync store ───
 * useSyncExternalStore is the correct React primitive for reading from an
 * external store such as localStorage. It provides a matching server snapshot
 * so the server-rendered HTML and the client-rendered HTML are identical on
 * first paint, avoiding hydration mismatches.
 */

let cachedNotifications: Notification[] = [];
let lastStorageString: string | null = null;
const listeners = new Set<() => void>();

function readStoredNotifications(): Notification[] {
  if (typeof window === "undefined") return cachedNotifications;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === lastStorageString) return cachedNotifications;
    const parsed = stored ? (JSON.parse(stored) as Notification[]) : [];
    lastStorageString = stored;
    cachedNotifications = parsed;
    return parsed;
  } catch {
    return cachedNotifications;
  }
}

function writeStoredNotifications(next: Notification[]) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(next);
    localStorage.setItem(STORAGE_KEY, serialized);
    lastStorageString = serialized;
    cachedNotifications = next;
    listeners.forEach((listener) => listener());
  } catch {
    // Ignore localStorage errors
  }
}

function subscribeToStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  listeners.add(callback);
  const handleStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    readStoredNotifications();
    callback();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener("storage", handleStorage);
    listeners.delete(callback);
  };
}

const emptyServerSnapshot: Notification[] = [];

function getServerSnapshot(): Notification[] {
  return emptyServerSnapshot;
}

/* ─── Provider ─── */

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const notifications = useSyncExternalStore(
    subscribeToStorage,
    readStoredNotifications,
    getServerSnapshot,
  );

  const addNotification = useCallback((notification: Omit<Notification, "id" | "timestamp" | "read">): string => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    };

    const updated = [newNotification, ...notifications].slice(0, MAX_NOTIFICATIONS);
    writeStoredNotifications(updated);

    return id;
  }, [notifications]);

  const markAsRead = useCallback((id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    writeStoredNotifications(updated);
  }, [notifications]);

  const markAllAsRead = useCallback(() => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    writeStoredNotifications(updated);
  }, [notifications]);

  const dismissNotification = useCallback((id: string) => {
    const updated = notifications.filter((n) => n.id !== id);
    writeStoredNotifications(updated);
  }, [notifications]);

  const clearAll = useCallback(() => {
    writeStoredNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const value: NotificationsContextValue = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearAll,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

/* ─── Hook ─── */

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications debe usarse dentro de <NotificationsProvider>");
  return ctx;
}

/* ─── Notification Bell Component ─── */

export function NotificationBell({ placement = "default" }: { placement?: "default" | "sidebar" }) {
  const { unreadCount, notifications, markAsRead, markAllAsRead, dismissNotification, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-notification-bell]")) {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isOpen]);

  const handleNotificationClick = useCallback((notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      window.location.assign(notification.actionUrl);
    }
  }, [markAsRead]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Ahora";
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days}d`;
    return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  };

  const typeDot: Record<NotificationType, string> = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500",
  };

  return (
    <div data-notification-bell className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition ${placement === "sidebar" ? "text-sidebar-text-muted hover:bg-white/10 hover:text-white" : "hover:bg-surface-muted"}`}
        aria-label={`${unreadCount} notificaciones sin leer`}
      >
        <svg className={`h-5 w-5 ${placement === "sidebar" ? "text-current" : "text-text-muted"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={`absolute z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-white shadow-lg ${placement === "sidebar" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"}`}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-semibold text-text-primary">Notificaciones</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-medium text-primary hover:text-primary/80"
                >
                  Marcar todo leído
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-4"><p className="mb-3 text-xs font-medium text-text-muted">Sin notificaciones pendientes</p>{[0, 1, 2].map((row) => <div className="flex gap-3 border-t border-border-subtle py-3 first:border-0" key={row}><span className="skeleton-bone h-9 w-9 shrink-0 rounded-lg" /><div className="min-w-0 flex-1 space-y-2"><span className="skeleton-bone block h-2.5 w-2/3 rounded" /><span className="skeleton-bone block h-2 w-full rounded" /><span className="skeleton-bone block h-1.5 w-12 rounded" /></div></div>)}</div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={[
                      "flex gap-3 px-4 py-3 cursor-pointer transition hover:bg-surface-muted/50",
                      !notification.read && "bg-surface-muted/30",
                    ].join(" ")}
                  >
                    <div className={`mt-1 h-2 w-2 rounded-full ${typeDot[notification.type]} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-text-primary">
                        {notification.title}
                      </p>
                      <p className="text-sm text-text-muted line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        {formatTime(notification.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissNotification(notification.id);
                      }}
                      className="shrink-0 p-1 text-text-muted hover:text-text-primary"
                      aria-label="Descartar notificación"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2 text-center">
              <button
                onClick={() => clearAll()}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                Limpiar todas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
