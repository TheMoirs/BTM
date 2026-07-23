import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";

const app = express();
app.use(cookieParser());

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('DROP INDEX IF EXISTS unique_team_pair');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_team_pair 
      ON matches (tournament_id, stage, LEAST(team1_id, team2_id), GREATEST(team1_id, team2_id))
    `);
    log("Database initialized: unique_team_pair index ensured");
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    log(`Warning: Could not create unique index: ${msg}`);
  } finally {
    client.release();
  }
}

async function migrateOrphanedTournaments() {
  const client = await pool.connect();
  try {
    const tableCheck = await client.query(`
      SELECT COUNT(*) as cnt FROM information_schema.columns
      WHERE table_name = 'tournaments' AND column_name = 'user_id'
    `);
    if (parseInt(tableCheck.rows[0].cnt) === 0) {
      log("Skipping orphaned tournament migration: user_id column not yet present");
      return;
    }
    const userResult = await client.query(
      "SELECT id FROM users WHERE email = $1",
      ['ali@themoirs.co.uk']
    );
    if (userResult.rows.length === 0) {
      log("Skipping orphaned tournament migration: ali@themoirs.co.uk not registered yet");
      return;
    }
    const userId = userResult.rows[0].id;
    const updateResult = await client.query(
      "UPDATE tournaments SET user_id = $1 WHERE user_id IS NULL",
      [userId]
    );
    if (updateResult.rowCount && updateResult.rowCount > 0) {
      log(`Migrated ${updateResult.rowCount} orphaned tournament(s) to ali@themoirs.co.uk`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    log(`Warning: Could not migrate orphaned tournaments: ${msg}`);
  } finally {
    client.release();
  }
}

(async () => {
  // Initialize database constraints
  await initializeDatabase();
  // Assign any pre-existing tournaments (userId=null) to ali@themoirs.co.uk
  await migrateOrphanedTournaments();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
