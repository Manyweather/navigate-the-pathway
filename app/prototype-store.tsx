"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  createDefaultState,
  demoReducer,
  makeArtifact,
  meaningfulInactivityStart,
  prepareReturn,
  type DemoAction,
  type DemoState,
  type PersistenceStatus,
} from "./demo-model";
import { createDefaultPilotState, type PilotState } from "./pilot-model";

export type MediaFocus = "records" | "courses" | "story" | "support" | "unsure";
export type MediaView = "welcome" | "trust" | "setup" | "map" | "mission" | "stamp" | "home" | "cohort" | "vault";
export type StationId = "courses" | "evidence" | "service" | "cohort" | "reflection" | "application";

export type MediaArtifact = {
  id: string;
  missionId: string;
  stationId: StationId;
  label: string;
  response: string;
  savedAt: string;
};

export type MediaProgressState = {
  artifacts: MediaArtifact[];
  stamps: StationId[];
  suggestedStation: StationId;
  diagramProgress: Record<string, number>;
  viewedVideos: string[];
  commitment: string | null;
  reminderDate: string;
  focus: MediaFocus | null;
  lastUpdate: string;
  lastView: MediaView;
};

export type PrototypeStateV2 = DemoState & {
  prototypeVersion: 2;
  media: MediaProgressState;
  pilot: PilotState;
};

export const PROTOTYPE_STORAGE_KEY = "navigate.pathway.demo.v2";
export const PROTOTYPE_V1_STORAGE_KEY = "navigate.pathway.demo.v1";
export const DONOR_STORAGE_KEY = "navigate-demo:v3";
export const DONOR_V2_STORAGE_KEY = "navigate-demo:v2";
export const PIPELINE_STORAGE_KEY = "navigate.pipeline.progress.v1";
export const REENGAGEMENT_DISMISSAL_KEY = "navigate-demo:reengagement-dismissed";

export const emptyMediaProgress: MediaProgressState = {
  artifacts: [],
  stamps: [],
  suggestedStation: "evidence",
  diagramProgress: {},
  viewedVideos: [],
  commitment: null,
  reminderDate: "In 3 days",
  focus: null,
  lastUpdate: "",
  lastView: "welcome",
};

export function createDefaultPrototypeState(): PrototypeStateV2 {
  return {
    ...createDefaultState(),
    prototypeVersion: 2,
    media: structuredClone(emptyMediaProgress),
    pilot: createDefaultPilotState(),
  };
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const stationKind = {
  courses: "course_plan",
  evidence: "experience",
  service: "reflection",
  cohort: "goal",
  reflection: "reflection",
  application: "action_plan",
} as const;

function parsePipeline(raw: string | null): MediaProgressState | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<MediaProgressState>;
  if (!Array.isArray(parsed.artifacts) || !Array.isArray(parsed.stamps)) return null;
  return { ...structuredClone(emptyMediaProgress), ...parsed };
}

function parseDonor(raw: string | null): DemoState | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { version?: number; state?: DemoState };
  if (parsed.version !== 3 || parsed.state?.version !== 3) return null;
  return parsed.state;
}

function addLegacyMediaArtifacts(base: DemoState, media: MediaProgressState): DemoState {
  const existingIds = new Set(base.artifacts.map((item) => item.id));
  const migrated = media.artifacts
    .filter((item) => !existingIds.has(item.id))
    .map((item) => ({
      ...makeArtifact(stationKind[item.stationId], item.label, item.response, item.stationId),
      id: item.id,
      createdAt: item.savedAt,
      updatedAt: item.savedAt,
      metadata: { missionId: item.missionId, migratedFrom: PIPELINE_STORAGE_KEY },
    }));
  return { ...base, artifacts: [...migrated, ...base.artifacts] };
}

export function migratePrototypeState(storage: StorageLike): { state: PrototypeStateV2; recovered: boolean } {
  try {
    const currentRaw = storage.getItem(PROTOTYPE_STORAGE_KEY);
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw) as { version?: number; state?: PrototypeStateV2 };
      if (parsed.version === 2 && parsed.state?.prototypeVersion === 2 && parsed.state.pilot) {
        return { state: parsed.state, recovered: false };
      }
    }

    const v1Raw = storage.getItem(PROTOTYPE_V1_STORAGE_KEY);
    if (v1Raw) {
      const parsed = JSON.parse(v1Raw) as { version?: number; state?: DemoState & { prototypeVersion: 1; media: MediaProgressState } };
      if (parsed.version === 1 && parsed.state?.prototypeVersion === 1) {
        return { state: { ...parsed.state, prototypeVersion: 2, pilot: createDefaultPilotState() }, recovered: true };
      }
    }

    const donor = parseDonor(storage.getItem(DONOR_STORAGE_KEY));
    const media = parsePipeline(storage.getItem(PIPELINE_STORAGE_KEY));
    if (donor || media) {
      const base = donor ? prepareReturn(donor) : createDefaultState();
      const mergedBase = media ? addLegacyMediaArtifacts(base, media) : base;
      return {
        state: {
          ...mergedBase,
          scenario: "migrated",
          prototypeVersion: 2,
          media: media ?? structuredClone(emptyMediaProgress),
          pilot: createDefaultPilotState(),
        },
        recovered: true,
      };
    }
  } catch {
    return {
      state: {
        ...createDefaultPrototypeState(),
        announcement: "Saved demonstration data could not be read, so a fresh private example was opened.",
      },
      recovered: true,
    };
  }
  return { state: createDefaultPrototypeState(), recovered: false };
}

type MediaAction =
  | { type: "PATCH_MEDIA"; patch: Partial<MediaProgressState> }
  | { type: "UPDATE_MEDIA"; update: MediaProgressState | ((current: MediaProgressState) => MediaProgressState) }
  | { type: "REPLACE_MEDIA"; media: MediaProgressState }
  | { type: "UPDATE_PILOT"; update: PilotState | ((current: PilotState) => PilotState) }
  | { type: "REPLACE_PILOT"; pilot: PilotState }
  | { type: "RESET_PROTOTYPE" };

export type PrototypeAction = DemoAction | MediaAction;

function prototypeReducer(state: PrototypeStateV2, action: PrototypeAction): PrototypeStateV2 {
  if (action.type === "PATCH_MEDIA") {
    return {
      ...state,
      media: { ...state.media, ...action.patch },
      lastActiveAt: new Date().toISOString(),
    };
  }
  if (action.type === "UPDATE_MEDIA") {
    const media = typeof action.update === "function" ? action.update(state.media) : action.update;
    return { ...state, media, lastActiveAt: new Date().toISOString() };
  }
  if (action.type === "REPLACE_MEDIA") {
    return { ...state, media: action.media, lastActiveAt: new Date().toISOString() };
  }
  if (action.type === "UPDATE_PILOT") {
    const pilot = typeof action.update === "function" ? action.update(state.pilot) : action.update;
    return { ...state, pilot, lastActiveAt: new Date().toISOString() };
  }
  if (action.type === "REPLACE_PILOT") return { ...state, pilot: action.pilot };
  if (action.type === "RESET_PROTOTYPE") return createDefaultPrototypeState();
  return { ...demoReducer(state, action), prototypeVersion: 2, media: state.media, pilot: state.pilot };
}

type PrototypeContextValue = {
  state: PrototypeStateV2;
  dispatch: React.Dispatch<PrototypeAction>;
  hydrated: boolean;
  recovered: boolean;
  persistenceStatus: PersistenceStatus;
  lastSavedAt: string | null;
  inactivityGapStartedAt: string | null;
  setMediaProgress: (update: MediaProgressState | ((current: MediaProgressState) => MediaProgressState)) => void;
  setPilotState: (update: PilotState | ((current: PilotState) => PilotState)) => void;
  dismissReengagementNudge: () => void;
  clearDeviceData: () => void;
};

const PrototypeContext = createContext<PrototypeContextValue | null>(null);

export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(prototypeReducer, undefined, createDefaultPrototypeState);
  const [hydrated, setHydrated] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [inactivityGapStartedAt, setInactivityGapStartedAt] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    const restored = migratePrototypeState(window.localStorage);
    dispatch({ type: "PATCH", patch: restored.state });
    dispatch({ type: "REPLACE_MEDIA", media: restored.state.media });
    dispatch({ type: "REPLACE_PILOT", pilot: restored.state.pilot });
    // These values mirror the browser-storage synchronization above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecovered(restored.recovered);
    setPersistenceStatus(restored.recovered ? "recovered" : "saved");
    const gap = meaningfulInactivityStart(restored.state.lastActiveAt);
    setInactivityGapStartedAt(
      gap && window.localStorage.getItem(REENGAGEMENT_DISMISSAL_KEY) !== gap ? gap : null,
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // This state mirrors the pending browser-storage write below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPersistenceStatus((value) => (value === "unavailable" ? value : "saving"));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          PROTOTYPE_STORAGE_KEY,
          JSON.stringify({ version: 2, state }),
        );
        setLastSavedAt(new Date().toISOString());
        setPersistenceStatus("saved");
      } catch {
        setPersistenceStatus("unavailable");
      }
    }, 220);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [hydrated, state]);

  const value = useMemo<PrototypeContextValue>(() => ({
    state,
    dispatch,
    hydrated,
    recovered,
    persistenceStatus,
    lastSavedAt,
    inactivityGapStartedAt,
    setMediaProgress: (update) => dispatch({ type: "UPDATE_MEDIA", update }),
    setPilotState: (update) => dispatch({ type: "UPDATE_PILOT", update }),
    dismissReengagementNudge: () => {
      if (inactivityGapStartedAt) {
        try {
          window.localStorage.setItem(REENGAGEMENT_DISMISSAL_KEY, inactivityGapStartedAt);
        } catch {
          // The in-session dismissal still applies.
        }
      }
      setInactivityGapStartedAt(null);
    },
    clearDeviceData: () => {
      for (const key of [
        PROTOTYPE_STORAGE_KEY,
        PROTOTYPE_V1_STORAGE_KEY,
        DONOR_STORAGE_KEY,
        DONOR_V2_STORAGE_KEY,
        PIPELINE_STORAGE_KEY,
        REENGAGEMENT_DISMISSAL_KEY,
      ]) {
        window.localStorage.removeItem(key);
      }
      setRecovered(false);
      setInactivityGapStartedAt(null);
      dispatch({ type: "RESET_PROTOTYPE" });
    },
  }), [hydrated, inactivityGapStartedAt, lastSavedAt, persistenceStatus, recovered, state]);

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype() {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error("usePrototype must be used inside PrototypeProvider");
  return value;
}
