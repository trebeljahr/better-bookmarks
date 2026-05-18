import React from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Options } from "./Options";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in options");

createRoot(container).render(
  <React.StrictMode>
    <Options />
    <Toaster />
  </React.StrictMode>,
);
