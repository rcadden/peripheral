/* paths.js — where Peripheral keeps per-user data.
 *
 * NOT IN THE REPO, DELIBERATELY. The token store established this rule (see
 * tokens.js) and the state cache inherits it: anything the daemon writes
 * repeatedly belongs in the OS's per-user data directory, not in a project
 * directory that gets cloned, cleaned, synced, or made public.
 *
 * The repo has since moved out of OneDrive, which removes the sync argument —
 * but the other three reasons stand, and the state cache holds real event
 * titles from a work calendar. That is not repo material.
 *
 *   Windows:  %LOCALAPPDATA%\Peripheral\
 *   Other:    $XDG_CONFIG_HOME/peripheral/  (or ~/.config/peripheral/)
 */

import path from 'node:path';
import os from 'node:os';

/** The per-user data directory. Not created; callers mkdir on write. */
export function dataDir() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'Peripheral');
  }
  const base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(base, 'peripheral');
}

/** A file inside the data directory. */
export function dataFile(name) {
  return path.join(dataDir(), name);
}
