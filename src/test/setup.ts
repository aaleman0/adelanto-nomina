import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock de logger para evitar output en tests
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock de Supabase para tests
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: vi.fn(),
}));
