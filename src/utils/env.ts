import { config } from 'dotenv';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Imported first by the entry point so the variables exist before any other
 * module is evaluated. `dotenv/config` only read `./.env`, so a global
 * (`npm link`) install started from another directory never found the key;
 * the per-user file works from anywhere. The first file to set a variable
 * wins, and real environment variables win over both.
 *
 * `quiet`: dotenv 17 otherwise prints an "injecting env" line to stdout on
 * every start, straight into the TUI.
 */
export const ENV_PATHS = [join(homedir(), '.flex-me-in', '.env'), '.env'];

config({ path: ENV_PATHS, quiet: true });
