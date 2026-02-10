# Window Organizer

GNOME Shell extension that moves each newly created normal window to a configurable monitor target.

## Settings

- Target monitor mode:
  - Mouse cursor (default)
  - Currently focused window
- Center windows (default: off)
  - Off: if a window is moved to another monitor, keep its relative position
  - On: center new windows on the target monitor
- Debug logging (default: off)
  - Off: no diagnostic logs from the extension
  - On: write detailed monitor/placement logs to GNOME Shell journal

## Install (local)

1. Copy `window-organizer/` to:
   `~/.local/share/gnome-shell/extensions/window-organizer@david-grieser.de/`
2. Compile schemas:
   `glib-compile-schemas ~/.local/share/gnome-shell/extensions/window-organizer@david-grieser.de/schemas`
3. Restart GNOME Shell (or log out/in).
4. Enable the extension:
   `gnome-extensions enable window-organizer@david-grieser.de`

## Make Targets

- Validate schema:
  `make check`
- Build extension staging dir with compiled schemas:
  `make build`
- Create zip package in `build/`:
  `make package`
- Install to local GNOME extension directory:
  `make install`
- Install and enable extension:
  `make enable`
- Disable extension:
  `make disable`
