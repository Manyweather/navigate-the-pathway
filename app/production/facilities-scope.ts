import type { FacilitiesDemoState } from "./facilities-demo-model";

const outsideSummerlin = (value: string) => /henderson/i.test(value);

/** The original reference records stay in storage; active views use this projection. */
export function summerlinFacilitiesState(source: FacilitiesDemoState): FacilitiesDemoState {
  const rooms = source.rooms.filter((room) => room.building === "Summerlin Campus");
  const roomIds = new Set(rooms.map((room) => room.id));
  const inactiveRooms = source.rooms.filter((room) => !roomIds.has(room.id));
  const locationAllowed = (location: string) => !outsideSummerlin(location) && !inactiveRooms.some((room) => location.includes(room.name));
  const reservations = source.reservations.filter((row) => row.campus !== "Henderson Campus" && roomIds.has(row.roomId));
  const eventIds = new Set(reservations.map((row) => row.id));
  const requests = source.requests.filter((row) => locationAllowed(row.location) && (!row.reservationId || eventIds.has(row.reservationId)));
  const stock = source.stock.filter((row) => row.campus !== "Henderson Campus" && locationAllowed(row.location));
  const stockIds = new Set(stock.map((row) => row.id));
  const supplyRequests = source.supplyRequests.filter((row) => stockIds.has(row.itemId) && locationAllowed(row.deliveryLocation));
  const keyRequests = source.keyRequests.filter((row) => row.locations.every(locationAllowed));
  const visibleIds = new Set([...requests, ...reservations, ...supplyRequests, ...keyRequests].map((row) => row.id));
  const hiddenIds = [...source.requests, ...source.reservations, ...source.supplyRequests, ...source.keyRequests].filter((row) => !visibleIds.has(row.id)).map((row) => row.id);
  return { ...source, rooms, reservations, requests, stock, supplyRequests, keyRequests,
    notifications: source.notifications.filter((row) => visibleIds.has(row.recordId)),
    mapUploads: source.mapUploads.filter((row) => row.campus === "Summerlin Campus"),
    custody: source.custody.filter((row) => locationAllowed(row.holder) && !outsideSummerlin(row.itemName)),
    activity: source.activity.filter((row) => !outsideSummerlin(row.text) && !hiddenIds.some((id) => row.text.includes(id))),
  };
}

/** Applying a visible edit never deletes or overwrites inactive reference rows. */
export function mergeSummerlinFacilitiesState(source: FacilitiesDemoState, edited: FacilitiesDemoState): FacilitiesDemoState {
  const visible = summerlinFacilitiesState(source);
  const merge = <T extends { id: string }>(all: T[], before: T[], after: T[]) => {
    const visibleIds = new Set(before.map((row) => row.id));
    const hidden = all.filter((row) => !visibleIds.has(row.id));
    const hiddenIds = new Set(hidden.map((row) => row.id));
    return [...after.filter((row) => !hiddenIds.has(row.id)), ...hidden];
  };
  return { ...edited,
    rooms: merge(source.rooms, visible.rooms, edited.rooms),
    requests: merge(source.requests, visible.requests, edited.requests),
    reservations: merge(source.reservations, visible.reservations, edited.reservations),
    stock: merge(source.stock, visible.stock, edited.stock),
    supplyRequests: merge(source.supplyRequests, visible.supplyRequests, edited.supplyRequests),
    keyRequests: merge(source.keyRequests, visible.keyRequests, edited.keyRequests),
    notifications: merge(source.notifications, visible.notifications, edited.notifications),
    mapUploads: merge(source.mapUploads, visible.mapUploads, edited.mapUploads),
    custody: merge(source.custody, visible.custody, edited.custody),
    activity: merge(source.activity, visible.activity, edited.activity),
  };
}
