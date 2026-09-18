import postgres from "postgres";

// Reads DATABASE_URL from the environment — set it in the Deno Deploy
// dashboard for production, and in a local .env (loaded via `--env-file`)
// for `deno task dev`. Never hardcode it here.
const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = postgres(DATABASE_URL, {
  ssl: "require", // matches sslmode=verify-full in your connection string
});
