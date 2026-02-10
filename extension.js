"use strict";

import GLib from "gi://GLib";
import Meta from "gi://Meta";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const TARGET_MONITOR_MODE_KEY = "target-monitor-mode";
const CENTER_WINDOWS_KEY = "center-windows";
const TARGET_MONITOR_MODE_MOUSE = "mouse-cursor";
const TARGET_MONITOR_MODE_FOCUSED = "focused-window";

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
    this._settings = this.getSettings();
    this._windowCreatedId = global.display.connect("window-created", (_display, win) => {
      this._onWindowCreated(win);
    });
  }

  disable() {
    if (this._windowCreatedId) {
      global.display.disconnect(this._windowCreatedId);
      this._windowCreatedId = null;
    }

    this._settings = null;
  }

  _getTargetMonitor() {
    const mode = this._settings?.get_string(TARGET_MONITOR_MODE_KEY) ?? TARGET_MONITOR_MODE_MOUSE;

    if (mode === TARGET_MONITOR_MODE_FOCUSED) {
      const focusedWindow = global.display.get_focus_window();
      if (focusedWindow) {
        return focusedWindow.get_monitor();
      }
    }

    const [pointerX, pointerY] = global.get_pointer();
    return getMonitorAtPoint(pointerX, pointerY);
  }

  _centerWindowInMonitor(win, monitorIndex) {
    if (!win) {
      return false;
    }

    // Let the WM keep placement for fullscreen/maximized windows.
    if (win.is_fullscreen() || win.get_maximized() !== Meta.MaximizeFlags.NONE) {
      return false;
    }

    // Recompute frame after GNOME has finalized placement/monitor move.
    const frameRect = win.get_frame_rect();
    const monitorRect = global.display.get_monitor_geometry(monitorIndex);
    const centeredX = monitorRect.x + Math.floor((monitorRect.width - frameRect.width) / 2);
    const centeredY = monitorRect.y + Math.floor((monitorRect.height - frameRect.height) / 2);

    win.move_frame(true, centeredX, centeredY);
    return true;
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

      const targetMonitor = this._getTargetMonitor();
      const currentMonitor = win.get_monitor();
      const centerWindows = this._settings?.get_boolean(CENTER_WINDOWS_KEY) ?? false;
      const frameRect = win.get_frame_rect();
      const nMonitors = global.display.get_n_monitors();

      if (targetMonitor < 0 || targetMonitor >= nMonitors) {
        return GLib.SOURCE_REMOVE;
      }

      const currentMonitorRect = global.display.get_monitor_geometry(currentMonitor);
      const targetMonitorRect = global.display.get_monitor_geometry(targetMonitor);
      const monitorChanged = currentMonitor !== targetMonitor;

      if (centerWindows) {
        const centered = this._centerWindowInMonitor(win, targetMonitor);

        // For windows that should not be centered (fullscreen/maximized),
        // still keep monitor targeting behavior.
        if (!centered && monitorChanged) {
          win.move_to_monitor(targetMonitor);
        }
      } else if (monitorChanged) {
        win.move_to_monitor(targetMonitor);

        const relativeX = frameRect.x - currentMonitorRect.x;
        const relativeY = frameRect.y - currentMonitorRect.y;

        const maxX = targetMonitorRect.x + Math.max(0, targetMonitorRect.width - frameRect.width);
        const maxY = targetMonitorRect.y + Math.max(0, targetMonitorRect.height - frameRect.height);

        const movedX = Math.min(Math.max(targetMonitorRect.x + relativeX, targetMonitorRect.x), maxX);
        const movedY = Math.min(Math.max(targetMonitorRect.y + relativeY, targetMonitorRect.y), maxY);

        win.move_frame(true, movedX, movedY);
      }

      return GLib.SOURCE_REMOVE;
    });
  }
}
