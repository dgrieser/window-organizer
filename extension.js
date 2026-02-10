"use strict";

import GLib from "gi://GLib";
import Meta from "gi://Meta";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const TARGET_MONITOR_MODE_KEY = "target-monitor-mode";
const CENTER_WINDOWS_KEY = "center-windows";
const DEBUG_LOGGING_KEY = "debug-logging";
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
  _isDebugEnabled() {
    return this._settings?.get_boolean(DEBUG_LOGGING_KEY) ?? false;
  }

  _debug(message) {
    if (!this._isDebugEnabled()) {
      return;
    }

    log(`[window-organizer] ${message}`);
  }

  enable() {
    this._settings = this.getSettings();
    this._debug("enabled");
    this._windowCreatedId = global.display.connect("window-created", (_display, win) => {
      this._onWindowCreated(win);
    });
  }

  disable() {
    this._debug("disabled");

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
        const monitor = focusedWindow.get_monitor();
        this._debug(`target monitor mode=focused-window -> ${monitor}`);
        return monitor;
      }

      this._debug("target monitor mode=focused-window but no focused window; falling back to mouse");
    }

    const [pointerX, pointerY] = global.get_pointer();
    const monitor = getMonitorAtPoint(pointerX, pointerY);
    this._debug(`target monitor mode=mouse-cursor pointer=(${pointerX},${pointerY}) -> ${monitor}`);
    return monitor;
  }

  _centerWindowInMonitor(win, monitorIndex) {
    if (!win) {
      this._debug("center skipped: missing window");
      return;
    }

    // Let the WM keep placement for fullscreen/maximized windows.
    if (win.is_fullscreen() || win.get_maximized() !== Meta.MaximizeFlags.NONE) {
      this._debug("center skipped: window is fullscreen or maximized");
      return;
    }

    // Recompute frame after GNOME has finalized placement/monitor move.
    const frameRect = win.get_frame_rect();
    const monitorRect = global.display.get_monitor_geometry(monitorIndex);
    const centeredX = monitorRect.x + Math.floor((monitorRect.width - frameRect.width) / 2);
    const centeredY = monitorRect.y + Math.floor((monitorRect.height - frameRect.height) / 2);

    win.move_frame(true, centeredX, centeredY);
  }

  _scheduleCenterWindowInMonitor(win, monitorIndex) {
    const maxAttempts = 8;
    let attempts = 0;
    this._debug(`start centering retries monitor=${monitorIndex} maxAttempts=${maxAttempts}`);

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
      if (!win) {
        this._debug("center retries stopped: missing window");
        return GLib.SOURCE_REMOVE;
      }

      // Let the WM keep placement for fullscreen/maximized windows.
      if (win.is_fullscreen() || win.get_maximized() !== Meta.MaximizeFlags.NONE) {
        this._debug("center retries stopped: window became fullscreen/maximized");
        return GLib.SOURCE_REMOVE;
      }

      const frameRect = win.get_frame_rect();
      if (frameRect.width <= 0 || frameRect.height <= 0) {
        attempts += 1;
        this._debug(`center attempt=${attempts}/${maxAttempts} skipped: invalid frame size`);
        return attempts < maxAttempts ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
      }

      const monitorRect = global.display.get_monitor_geometry(monitorIndex);
      const centeredX = monitorRect.x + Math.floor((monitorRect.width - frameRect.width) / 2);
      const centeredY = monitorRect.y + Math.floor((monitorRect.height - frameRect.height) / 2);
      const alreadyCentered =
        Math.abs(frameRect.x - centeredX) <= 1 && Math.abs(frameRect.y - centeredY) <= 1;
      const attemptNumber = attempts + 1;

      this._debug(
        `center attempt=${attemptNumber}/${maxAttempts} monitor=${monitorIndex} frame=(${frameRect.x},${frameRect.y} ${frameRect.width}x${frameRect.height}) target=(${centeredX},${centeredY}) alreadyCentered=${alreadyCentered}`
      );

      if (!alreadyCentered) {
        win.move_frame(true, centeredX, centeredY);
      }

      attempts += 1;
      if (alreadyCentered) {
        this._debug(`centering finished after ${attempts} attempts`);
      } else if (attempts >= maxAttempts) {
        this._debug("centering stopped: max attempts reached");
      }
      return alreadyCentered || attempts >= maxAttempts ? GLib.SOURCE_REMOVE : GLib.SOURCE_CONTINUE;
    });
  }

  _onWindowCreated(win) {
    if (!win) {
      this._debug("window-created skipped: missing window");
      return;
    }

    // Keep scope tight: only organize normal app windows.
    if (win.get_window_type() !== Meta.WindowType.NORMAL) {
      this._debug(`window-created ignored: type=${win.get_window_type()}`);
      return;
    }

    this._debug(`window-created title="${win.get_title()}"`);

    // Delay slightly so GNOME has finished constructing and placing the new window.
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
      if (!win) {
        this._debug("placement skipped after delay: missing window");
        return GLib.SOURCE_REMOVE;
      }

      const targetMonitor = this._getTargetMonitor();
      const currentMonitor = win.get_monitor();
      const centerWindows = this._settings?.get_boolean(CENTER_WINDOWS_KEY) ?? false;
      const frameRect = win.get_frame_rect();
      const nMonitors = global.display.get_n_monitors();

      if (targetMonitor < 0 || targetMonitor >= nMonitors) {
        this._debug(`invalid target monitor ${targetMonitor} (nMonitors=${nMonitors})`);
        return GLib.SOURCE_REMOVE;
      }

      const currentMonitorRect = global.display.get_monitor_geometry(currentMonitor);
      const targetMonitorRect = global.display.get_monitor_geometry(targetMonitor);
      const monitorChanged = currentMonitor !== targetMonitor;
      this._debug(
        `placing window currentMonitor=${currentMonitor} targetMonitor=${targetMonitor} center=${centerWindows} frame=(${frameRect.x},${frameRect.y} ${frameRect.width}x${frameRect.height}) currentRect=(${currentMonitorRect.x},${currentMonitorRect.y} ${currentMonitorRect.width}x${currentMonitorRect.height}) targetRect=(${targetMonitorRect.x},${targetMonitorRect.y} ${targetMonitorRect.width}x${targetMonitorRect.height})`
      );

      if (monitorChanged) {
        this._debug(`moving window to monitor ${targetMonitor}`);
        win.move_to_monitor(targetMonitor);
      }

      if (centerWindows) {
        this._scheduleCenterWindowInMonitor(win, targetMonitor);
      } else if (monitorChanged) {
        const relativeX = frameRect.x - currentMonitorRect.x;
        const relativeY = frameRect.y - currentMonitorRect.y;

        const maxX = targetMonitorRect.x + Math.max(0, targetMonitorRect.width - frameRect.width);
        const maxY = targetMonitorRect.y + Math.max(0, targetMonitorRect.height - frameRect.height);

        const movedX = Math.min(Math.max(targetMonitorRect.x + relativeX, targetMonitorRect.x), maxX);
        const movedY = Math.min(Math.max(targetMonitorRect.y + relativeY, targetMonitorRect.y), maxY);

        this._debug(`moving frame relatively to (${movedX},${movedY})`);
        win.move_frame(true, movedX, movedY);
      }

      return GLib.SOURCE_REMOVE;
    });
  }
}
