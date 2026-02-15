import { env } from "@alike/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export const db = drizzle(env.DATABASE_URL, { schema });

// Export all queries and schema
export * from "./schema";
export * from "./queries";
export * from "./events";
