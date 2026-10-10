"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { t } from "@/lib/i18n";

export type Role = "generator" | "fleet" | "hub" | "facility" | "admin";
export interface User { id: number; email: string; name: string; role: Role; organization?: string; facility_id?: number | null; hub_id?: number | null }

interface AuthState {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  clear: () => void;
}

// Token is a short-lived JWT for this API only (no third-party secrets in the browser).
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: "wattcycle-auth" },
  ),
);

const ROLE_LABEL: Record<Role, string> = {
  generator: "Waste generator",
  fleet: "Fleet operator",
  hub: "Hub operator",
  facility: "Plant operator",
  admin: "System operator",
};
export const roleLabel = (r: Role) => t(ROLE_LABEL[r]);
