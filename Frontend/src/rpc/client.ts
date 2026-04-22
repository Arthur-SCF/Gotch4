import { hc } from "hono/client";
import type { AppType } from "@backend/index";

const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;

export const client = hc<AppType>(apiUrl);
