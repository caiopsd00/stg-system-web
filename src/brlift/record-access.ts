import {
  canAdminister,
  reportTeam,
  type Catalog,
  type Entry,
} from "../contracts/domain.ts";

export function recordVisibleToUser(
  entry: Entry,
  user: { id: string; role: string },
  technicians: Catalog[],
) {
  if (canAdminister(user.role)) return true;
  const technician = technicians.find((t) => t.data.userId === user.id);
  if (!technician) return false;
  return entry.kind === "reports"
    ? reportTeam(entry).some((t) => t.technicianId === technician.id)
    : entry.technicianId === technician.id ||
        entry.payload.approvedByTechnicianId === technician.id;
}
