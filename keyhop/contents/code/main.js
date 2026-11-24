/*
 * KeyHop: a KWin script for switching windows by keyboard on a desktop of
 * overlapping windows. Most useful with "focus follows mouse".
 *
 *  1. The pointer follows focus. Whenever a window gets focus and the pointer
 *     is not on it, the pointer is moved to its centre (through KWin's own
 *     "Move Mouse to Focus" action; scripts cannot move the pointer
 *     themselves). A focus change made with the mouse never moves it, because
 *     then the pointer is on the window already.
 *
 *  2. Windows you only pass through drop back. Switching by keyboard raises
 *     every window on the way. A window that held focus for less than
 *     passThroughMs is put back where it was in the stacking order as soon as
 *     focus moves on, so after going w1 -> w3 -> w4 -> w2 quickly, w2 is on
 *     top, w1 right behind it, and w3 and w4 are where they were.
 *
 *  3. Two shortcuts, "Window to the Left" and "Window to the Right", that
 *     treat the windows on the desktop as one row from left to right. KWin's
 *     own direction shortcuts compare the centre of the current window with
 *     an edge of the others, which skips windows when they overlap. A single
 *     row reaches every window, and going right then left brings you back.
 *
 * 1 and 2 work from KWin's focus-change signal, so it does not matter how
 * focus was changed.
 */
"use strict";

function num(key, def) { const v = Number(readConfig(key, def)); return isFinite(v) ? v : def; }
function bool(key, def) { const v = readConfig(key, def); return v === true || v === "true"; }

let CFG = {};
function loadConfig() {
    CFG = {
        warp: bool("warp", true),
        // A window that held focus for less than this is "passed through"
        // and goes back to its old place in the stack. 0 = leave the stack alone.
        passThroughMs: Math.max(0, num("passThroughMs", 1000)),
        excludeClasses: String(readConfig("excludeClasses", "plasmashell,krunner,ksmserver-logout-greeter"))
            .toLowerCase().split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; }),
        wrap: bool("wrap", false),
        debug: bool("debug", false),
    };
}
loadConfig();
try { options.configChanged.connect(loadConfig); } catch (e) { /* older KWin */ }

function say(m) { print("keyhop: " + m); }
function log(m) { if (CFG.debug) say(m); }
function name(w) { return w ? "'" + w.caption + "'" : "nothing"; }
function guard(what, fn) {
    return function () {
        try { return fn.apply(null, arguments); }
        catch (e) { say("error in " + what + ": " + e + (e && e.stack ? "\n" + e.stack : "")); }
    };
}

const canRestack = typeof workspace.raiseWindow === "function";
if (!canRestack) say("this KWin has no workspace.raiseWindow: windows passed through will stay raised");

// Windows this script looks at: ordinary windows and dialogs.
function managed(w) {
    if (!w || w.deleted) return false;
    if (!(w.normalWindow || w.dialog)) return false;
    return CFG.excludeClasses.indexOf(String(w.resourceClass || "").toLowerCase()) === -1;
}
// Managed windows, bottom to top.
function stack() {
    const out = [];
    const all = workspace.stackingOrder;
    for (let i = 0; i < all.length; i++) if (managed(all[i])) out.push(all[i]);
    return out;
}
function inside(p, g) { return p.x >= g.x && p.x < g.x + g.width && p.y >= g.y && p.y < g.y + g.height; }
function onCurrentDesktop(w) {
    try {
        if (w.minimized) return false;
        if (w.onAllDesktops) return true;
        const ds = w.desktops || [];
        return ds.length === 0 || ds.indexOf(workspace.currentDesktop) !== -1;
    } catch (e) { return true; }
}

// ------------------------------------------------------------ the pointer
// Is the pointer on w, i.e. is w the topmost window under it?
function pointerOn(w) {
    const p = workspace.cursorPos;
    if (!inside(p, w.frameGeometry)) return false;
    const s = stack();
    for (let i = s.length - 1; i >= 0; i--) {
        if (s[i] === w) return true;
        if (onCurrentDesktop(s[i]) && inside(p, s[i].frameGeometry)) return false;
    }
    return true;
}
function warpTo(w) {
    if (!CFG.warp) return;
    if (w.move || w.resize) return;                 // being dragged: leave the pointer alone
    if (pointerOn(w)) return;
    log("pointer to " + name(w));
    callDBus("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component",
             "invokeShortcut", "MoveMouseToFocus");
}

// -------------------------------------------------------------- the stack
let cur = null;          // the window that has focus
let curSince = 0;        // since when
let tenure = [];         // stacking order while cur has had focus
let settled = [];        // stacking order to go back to: as if windows passed
                         // through since the last real stop had never been raised

function without(list, w) { return list.filter(function (x) { return x !== w; }); }

// Bring the managed windows into the order `want` (bottom to top). Only the
// windows from the first difference upwards are raised, in order. Returns the
// resulting order and how many windows were raised. The order is returned
// because KWin announces a focus change while its stacking updates are held
// back: raises made here do not show in workspace.stackingOrder until later,
// so it must not be read back.
function restack(want) {
    const have = stack();
    want = want.filter(function (w) { return have.indexOf(w) !== -1; });
    // windows not in `want` (opened since) keep their place relative to the top
    have.forEach(function (w, i) {
        if (want.indexOf(w) !== -1) return;
        let after = -1;
        for (let j = i - 1; j >= 0 && after < 0; j--) after = want.indexOf(have[j]);
        want.splice(after + 1, 0, w);
    });
    let i = 0;
    while (i < have.length && have[i] === want[i]) i++;
    if (i >= have.length) return { order: have, raised: 0 };
    for (let j = i; j < want.length; j++) workspace.raiseWindow(want[j]);
    return { order: want, raised: want.length - i };
}

const onActivated = guard("windowActivated", function (w) {
    if (!managed(w) || w === cur) return;
    const now = Date.now();
    const prev = cur && !cur.deleted ? cur : null;
    const passed = prev !== null && CFG.passThroughMs > 0 && now - curSince < CFG.passThroughMs;

    if (canRestack && CFG.passThroughMs > 0) {
        // A real stop makes the order it had the one to go back to.
        if (!passed) settled = tenure;
        let have = stack();
        const raised = have.length > 0 && have[have.length - 1] === w;
        if (passed) {
            // prev goes back to where it was; w stays on top if it was raised
            const want = raised ? without(settled, w).concat([w]) : settled.slice();
            if (!raised && want.indexOf(w) === -1) want.push(w);
            const r = restack(want);
            const n = r.raised;
            have = r.order;
            if (n > 0) log(name(prev) + " was passed through (" + (now - curSince) + " ms): put back, " + n + " window(s) restacked");
        }
        tenure = have;
    }
    cur = w;
    curSince = now;
    warpTo(w);
});

// ----------------------------------------------------------------- the row
// The windows on the current desktop as one row, left to right, by centre.
function row() {
    const key = function (w) {
        const g = w.frameGeometry;
        return [g.x + g.width / 2, g.x, g.y];
    };
    const items = stack().filter(onCurrentDesktop).map(function (w, i) { return { w: w, k: key(w), i: i }; });
    items.sort(function (a, b) {
        for (let n = 0; n < 3; n++) if (a.k[n] !== b.k[n]) return a.k[n] - b.k[n];
        return a.i - b.i;
    });
    return items.map(function (it) { return it.w; });
}
function hop(dir) {
    const r = row();
    if (r.length === 0) return;
    const at = r.indexOf(workspace.activeWindow);
    let to;
    if (at === -1) to = dir > 0 ? 0 : r.length - 1;     // focus is elsewhere: start at the near end
    else {
        to = at + dir;
        if (to < 0 || to >= r.length) {
            if (!CFG.wrap || r.length < 2) { log("end of the row"); return; }
            to = (to + r.length) % r.length;
        }
    }
    log((dir > 0 ? "right" : "left") + " to " + name(r[to]) + " (" + (to + 1) + " of " + r.length + ")");
    workspace.activeWindow = r[to];
}

function init() {
    const a = workspace.activeWindow;
    if (managed(a)) { cur = a; curSince = Date.now() - 3600000; }
    tenure = stack();
    settled = tenure.slice();
    workspace.windowActivated.connect(onActivated);
    registerShortcut("KeyHop Window to the Left", "KeyHop: Window to the Left", "", guard("left", function () { hop(-1); }));
    registerShortcut("KeyHop Window to the Right", "KeyHop: Window to the Right", "", guard("right", function () { hop(1); }));
    say("loaded (pointer follows focus: " + (CFG.warp ? "on" : "off") + "; pass-through: " +
        (CFG.passThroughMs > 0 && canRestack ? "under " + CFG.passThroughMs + " ms" : "off") + ")");
}
init();
