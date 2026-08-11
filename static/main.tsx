import React from "react";
import { createRoot } from "react-dom/client";
import { StaticPrototype } from "../app/static-prototype";
import "../app/globals.css";

const accessApiUrl = (
  import.meta.env.VITE_NTP_ACCESS_API_URL
  || "https://navigate-pathway-access.bmanyweather.workers.dev"
).replace(/\/$/, "");
const root = document.getElementById("root");

if (!root) throw new Error("Prototype root was not found.");

createRoot(root).render(
  <React.StrictMode>
    <StaticPrototype accessApiUrl={accessApiUrl} />
  </React.StrictMode>,
);
