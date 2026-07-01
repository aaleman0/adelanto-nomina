"use client";

import { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore } from "react";

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

function getStoredNotifications(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Notification[]) : [];
  } catch {
    return [];
  }
}

function subscribeToStorage(callback: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/* ─── Provider ─── */

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const storedNotifications = useSyncExternalStore(
    subscribeToStorage,
    getStoredNotifications,
    () => [],
  );
  const [notifications, setNotifications] = useState<Notification[]>(storedNotifications);

  // Keep local state in sync with external storage changes.
  useSyncExternalStore(
    subscribeToStorage,
    () => {
      const next = getStoredNotifications();
      if (JSON.stringify(next) !== JSON.stringify(notifications)) {
        setNotifications(next);
      }
      return null;
    },
    () => null,
  );

  // Persist to localStorage whenever local state changes.
  const persistNotifications = useCallback((next: Notification[]) => {
    setNotifications(next);
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const addNotification = useCallback((notification: Omit<Notification, "id" | "timestamp" | "read">): string => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    };

    const updated = [newNotification, ...notifications].slice(0, MAX_NOTIFICATIONS);
    persistNotifications(updated);

    return id;
  }, [notifications, persistNotifications]);

  const markAsRead = useCallback((id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    persistNotifications(updated);
  }, [notifications, persistNotifications]);

  const markAllAsRead = useCallback(() => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    persistNotifications(updated);
  }, [notifications, persistNotifications]);

  const dismissNotification = useCallback((id: string) => {
    const updated = notifications.filter((n) => n.id !== id);
    persistNotifications(updated);
  }, [notifications, persistNotifications]);

  const clearAll = useCallback(() => {
    persistNotifications([]);
  }, [persistNotifications]);

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

export function NotificationBell() {
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
        className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-muted transition"
        aria-label={`${unreadCount} notificaciones sin leer`}
      >
        <svg className="h-5 w-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-border bg-white shadow-lg z-50">
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
              <div className="px-4 py-8 text-center text-sm text-text-muted">
                <svg className="mx-auto mb-2 h-8 w-8 text-text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                No hay notificaciones
              </div>
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
