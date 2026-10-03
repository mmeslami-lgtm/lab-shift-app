"use client";

import { createContext } from "react";

// Filled by <ProductGate>: who is logged in, for which company, with which role and products.
// Components below the gate read it to talk to the database for the right company.
export const OrgContext = createContext(null);
