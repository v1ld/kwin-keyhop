# KeyHop

When you switch through several windows by keyboard, only the window you started on and the one you end on stay raised; the ones you pass through go back to how they were. Also moves the mouse pointer to the focused window (can be turned off).

A small KWin script for desktops with overlapping windows.

- **Windows you only pass through go back.** Going from one window to another with directional switching (for example Meta+arrows) brings every window on the way to the front. A window that had focus for less than a second is put back behind the windows that were in front of it, as soon as focus moves on. Go `w1 → w3 → w4 → w2` quickly and you end with `w2` in front, `w1` right behind it, and `w3` and `w4` where they were before you set off. Stay on a window longer than that and it stays in front.
- **The mouse pointer follows focus.** When a window gets focus and the mouse pointer is not on it, the mouse pointer moves to the centre of that window. A focus change made with the mouse never moves it, because then it is on the window already. A window opening does not move it either, nor does focus passing on because a window closed: those happen to you, often while the mouse is busy with something else.

- **Left and right along one row.** Two shortcuts, *KeyHop: Window to the Left* and *KeyHop: Window to the Right*, treat the windows on the desktop as a single row from left to right, ordered by their centres. KWin's own direction shortcuts compare the centre of the window you are on with an edge of the others, so with overlapping windows they skip some and can land somewhere unexpected. A single row reaches every window, and going right then left always brings you back.

The second part matters most with **focus follows mouse**, where a keyboard switch otherwise leaves the mouse pointer behind on the old window: the next nudge of the mouse can hand focus straight back, scrolling goes to the wrong window, and a window you can't point at can't be reached at all. The first part is useful with any focus setting. Tiling and scrolling window managers have no overlapping windows to tidy, so it is not for them.

It listens to KWin's focus-change signal, so it works whatever changed the focus: Alt+Tab, switch-window shortcuts, another script.

## Requirements

KDE Plasma 6 (KWin 6) on Wayland or X11. The mouse pointer is moved through KWin's own *Move Mouse to Focus* action, which was broken in Plasma 6.7.0 and fixed in the 6.7 bug-fix releases. To check that it works on your system, run this and watch the mouse pointer:

```
qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut MoveMouseToFocus
```

## Install

```
./install.sh
```

Installs or upgrades, enables the script and loads it into the running KWin. `./uninstall.sh` removes it.

## Shortcuts

The two row shortcuts have no keys when installed. Bind them in System Settings > Keyboard > Shortcuts (search for KeyHop). To use Meta+Left and Meta+Right, first clear those keys from KWin's *Switch to Window to the Left / Right*.

## Settings

System Settings > Window Management > KWin Scripts > KeyHop.

| Setting | Default | What it does |
|---|---|---|
| `passThroughMs` | 1000 | A window that had focus for less than this many milliseconds goes back behind the windows that were in front of it when focus moves on. 0 turns this off. |
| `warp` | true | Move the mouse pointer to a window that gets focus when the mouse pointer is not on it. |
| `wrap` | false | At the end of the row, carry on from the other end. Off: the shortcut does nothing there. |
| `excludeClasses` | `plasmashell,krunner,ksmserver-logout-greeter` | Window classes whose focus changes are ignored altogether. |
| `debug` | false | Log what the script does: `journalctl --user -b \| grep keyhop`. |

## Details

- **"On the window"** means the window is the frontmost one under the mouse pointer. If the mouse pointer is inside the focused window's rectangle but another window covers that spot, it is moved.
- **A window being dragged or resized** never pulls the mouse pointer.
- **Alt+Tab** does not bring the windows it steps through to the front, so only the mouse pointer part applies to it.
- **Mouse focus** does not bring windows to the front (unless you turned on raise on hover), so nothing is rearranged for it; a window passed through by keyboard just before still goes back.
- **Putting a window back** is done by raising, in order, the windows that were in front of it. If your KWin has no `workspace.raiseWindow`, the script says so in the log once and only moves the mouse pointer.
- **The row** holds the ordinary windows on the current desktop that are not minimised. Windows with exactly the same position in it are ordered by left edge, then by which is higher.
- **The mouse pointer goes to the centre** of the window, because that is what KWin's action does.

## Tests

`test/test.js` runs the script against a small stand-in for KWin, with no desktop needed:

```
node test/test.js keyhop/contents/code/main.js
```

## Licence

MIT, see `LICENSE`.

## Version history

- **1.0.1:** the mouse pointer is no longer moved when a window opens, or when focus passes on because a window closed.
- **1.0.0:** first version.
