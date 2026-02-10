"use strict";

import GLib from "gi://GLib";
import Meta from "gi://Meta";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

function getMonitorAtPoint(x, y) {
  const nMonitors = global.display.get_n_monitors();

  for (let i = 0; i < nMonitors; i++) {
    const rect = global.display.get_monitor_geometry(i);
    const inside =
      x >= rect.x &&
      x < rect.x + rect.width &&
      y >= rect.y &&
      y < rect.y + rect.height;

    if (inside) {
      return i;
    }
  }

  return global.display.get_current_monitor();
}

export default class WindowOrganizer extends Extension {
  enable() {
    this._windowCreatedId = global.display.connect("window-created", (_display, win) => {
      this._onWindowCreated(win);
    });
  }

  disable() {
    if (this._windowCreatedId) {
      global.display.disconnect(this._windowCreatedId);
      this._windowCreatedId = null;
    }
  }

  _onWindowCreated(win) {
    if (!win) {
      return;
    }

    // Keep scope tight: only organize normal app windows.
    if (win.get_window_type() !== Meta.WindowType.NORMAL) {
      return;
    }

    // Delay slightly so GNOME has finished constructing and placing the new window.
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      if (!win) {
        return GLib.SOURCE_REMOVE;
      }

      const [pointerX, pointerY] = global.get_pointer();
      const targetMonitor = getMonitorAtPoint(pointerX, pointerY);
      const currentMonitor = win.get_monitor();

      if (
        targetMonitor >= 0 &&
        targetMonitor < global.display.get_n_monitors() &&
        currentMonitor !== targetMonitor
      ) {
        win.move_to_monitor(targetMonitor);
      }

      return GLib.SOURCE_REMOVE;
    });
  }
}
