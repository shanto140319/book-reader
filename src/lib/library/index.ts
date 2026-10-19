// The library the app uses: Supabase when it's configured, otherwise this browser only.
// Both modules export the same functions; the type annotation keeps them in sync.

import { supabaseConfigured } from "@/lib/supabase/config";
import * as cloud from "./cloud";
import * as local from "./local";

export const library: typeof local = supabaseConfigured ? cloud : local;
