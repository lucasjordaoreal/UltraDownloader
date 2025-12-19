// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import DriveStyleDownloader from "./Interface.jsx";

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <DriveStyleDownloader />
  </React.StrictMode>
);
