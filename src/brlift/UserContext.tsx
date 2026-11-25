import { createContext } from "react";
import type { UserRole } from "../contracts/domain";

export const UserContext = createContext<{ id: string; role: UserRole } | null>(
  null,
);
