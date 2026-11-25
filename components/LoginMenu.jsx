"use client";

import React from "react";

// Start page "Anmelden" (25.11.2026): one button, one sign-in page for everyone. After signing in,
// /login sends each person to the right area automatically (lib/homeRoute). Earlier this was a menu with
// Mitarbeiter / Leitung / Inhaber; old links /login?als=… keep working.
export default function LoginMenu() {
  return <a className="dg-btn dg-ghost" href="/login">Anmelden</a>;
}
