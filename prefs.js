"use strict";

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const TARGET_MONITOR_MODE_KEY = "target-monitor-mode";
const CENTER_WINDOWS_KEY = "center-windows";
const DEBUG_LOGGING_KEY = "debug-logging";
const TARGET_MONITOR_MODE_MOUSE = "mouse-cursor";
const TARGET_MONITOR_MODE_FOCUSED = "focused-window";

const TARGET_MODE_OPTIONS = [
  { id: TARGET_MONITOR_MODE_MOUSE, label: "Mouse cursor" },
  { id: TARGET_MONITOR_MODE_FOCUSED, label: "Currently focused window" },
];

export default class WindowOrganizerPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({ title: "Window Placement" });

    const targetModeRow = new Adw.ComboRow({
      title: "Target monitor",
      subtitle: "Where new windows should be moved",
      model: Gtk.StringList.new(TARGET_MODE_OPTIONS.map(option => option.label)),
    });

    const savedMode = settings.get_string(TARGET_MONITOR_MODE_KEY);
    const selectedIndex = TARGET_MODE_OPTIONS.findIndex(option => option.id === savedMode);
    targetModeRow.selected = selectedIndex >= 0 ? selectedIndex : 0;

    targetModeRow.connect("notify::selected", row => {
      const option = TARGET_MODE_OPTIONS[row.selected];
      settings.set_string(TARGET_MONITOR_MODE_KEY, option?.id ?? TARGET_MONITOR_MODE_MOUSE);
    });

    const centerWindowsRow = new Adw.SwitchRow({
      title: "Center windows",
      subtitle: "Center new windows on the target monitor",
    });
    settings.bind(CENTER_WINDOWS_KEY, centerWindowsRow, "active", Gio.SettingsBindFlags.DEFAULT);

    const debugLoggingRow = new Adw.SwitchRow({
      title: "Debug logging",
      subtitle: "Write detailed logs to GNOME Shell journal",
    });
    settings.bind(DEBUG_LOGGING_KEY, debugLoggingRow, "active", Gio.SettingsBindFlags.DEFAULT);

    group.add(targetModeRow);
    group.add(centerWindowsRow);
    group.add(debugLoggingRow);
    page.add(group);
    window.add(page);
  }
}
