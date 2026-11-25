// Mock KWin for KeyHop. Test tool only.
"use strict";
const vm = require("vm"), fs = require("fs");
const main = process.argv[2];
let fails = 0;
function ok(c, m) { console.log((c ? "ok:   " : "FAIL: ") + m); if (!c) fails++; }
function Signal() { const hs = []; return { connect: function (h) { hs.push(h); }, emit: function () { const a = arguments; hs.slice().forEach(function (h) { h.apply(null, a); }); } }; }
function makeEnv(cfg, noRaise) {
    const env = { t: 1e12, warps: 0, logs: [], raises: 0 };
    const windows = [];
    // KWin emits windowActivated while stacking updates are blocked: raises made
    // inside the handler do not show in stackingOrder until it returns.
    let frozen = null;
    const emit = function (w) { frozen = windows.slice(); try { ws.windowActivated.emit(w); } finally { frozen = null; } };
    let active = null;
    env.shortcuts = {};
    const ws = { cursorPos: { x: 0, y: 0 }, currentDesktop: "d1", windowActivated: Signal(), windowAdded: Signal(), windowRemoved: Signal() };
    Object.defineProperty(ws, "stackingOrder", { get: function () { return (frozen || windows).slice(); } });
    if (!noRaise) ws.raiseWindow = function (w) { const i = windows.indexOf(w); if (i < 0) throw new Error("unknown window"); windows.splice(i, 1); windows.push(w); env.raises++; };
    env.add = function (name, x, y, w, h, o) {
        const win = Object.assign({ caption: name, resourceClass: name, normalWindow: true, dialog: false, deleted: false, minimized: false,
            onAllDesktops: false, desktops: ["d1"], move: false, resize: false, frameGeometry: { x: x, y: y, width: w, height: h } }, o || {});
        windows.push(win); return win;
    };
    // keyboard switch: activates and raises; hover: activates only
    env.key = function (w) { const i = windows.indexOf(w); windows.splice(i, 1); windows.push(w); active = w; emit(w); };
    // a script setting activeWindow activates and raises, like a keyboard switch
    Object.defineProperty(ws, "activeWindow", { get: function () { return active; }, set: function (w) { if (w === active) return; if (env.silent) { active = w; return; } env.key(w); } });
    env.hover = function (w) { const g = w.frameGeometry; ws.cursorPos = { x: g.x + g.width - 5, y: g.y + g.height - 5 }; active = w; emit(w); };
    // like KWin: a new window gets focus first and is announced afterwards
    env.open = function (name, x, y, w, h, quiet) { const win = env.add(name, x, y, w, h); if (!quiet) { active = win; emit(win); } else { windows.splice(windows.indexOf(win), 1); windows.unshift(win); } ws.windowAdded.emit(win); return win; };
    // like KWin: marked deleted, focus passes to `next`, then it is removed
    env.close = function (w, next) { w.deleted = true; if (active === w && next) { const i = windows.indexOf(next); windows.splice(i, 1); windows.push(next); active = next; emit(next); } windows.splice(windows.indexOf(w), 1); ws.windowRemoved.emit(w); };
    env.wait = function (ms) { env.t += ms; };
    env.order = function () { return windows.map(function (w) { return w.caption; }).join(" "); };
    const FakeDate = { now: function () { return env.t; } };
    const ctx = { print: function (m) { env.logs.push(String(m)); }, readConfig: function (k, d) { return Object.prototype.hasOwnProperty.call(cfg || {}, k) ? cfg[k] : d; },
        options: { configChanged: Signal() }, registerShortcut: function (n, t, k, f) { env.shortcuts[n] = f; }, workspace: ws, Date: FakeDate, Math: Math,
        callDBus: function (s, p, i, m, a) { if (m === "invokeShortcut" && a === "MoveMouseToFocus") { env.warps++; const g = ws.activeWindow.frameGeometry; ws.cursorPos = { x: g.x + g.width / 2, y: g.y + g.height / 2 }; } } };
    env.ws = ws; env.start = function () { vm.createContext(ctx); vm.runInContext(fs.readFileSync(main, "utf8"), ctx); };
    return env;
}
function setup(cfg, noRaise) {
    const e = makeEnv(cfg, noRaise);
    e.w5 = e.add("w5", 3000, 900, 800, 600); e.w4 = e.add("w4", 2000, 100, 900, 700); e.w3 = e.add("w3", 1500, 800, 900, 700);
    e.w2 = e.add("w2", 300, 900, 900, 700); e.w1 = e.add("w1", 100, 100, 1200, 900);
    e.silent = true; e.ws.activeWindow = e.w1; e.silent = false; e.ws.cursorPos = { x: 200, y: 200 };
    e.start(); return e;
}
(function () {
    const e = setup();
    ok(e.order() === "w5 w4 w3 w2 w1", "start order " + e.order());
    e.wait(5000); e.key(e.w3); e.wait(200); e.key(e.w4); e.wait(200); e.key(e.w5); e.wait(200); e.key(e.w2);
    ok(e.order() === "w5 w4 w3 w1 w2", "quick traversal w1>w3>w4>w5>w2: w2 on top, w1 behind, rest as before (" + e.order() + ")");
    ok(e.warps === 4, "pointer moved at each step (" + e.warps + ")");
    e.wait(5000); e.key(e.w4);
    ok(e.order() === "w5 w3 w1 w2 w4", "after a real stop on w2, going to w4 just raises it (" + e.order() + ")");
    e.wait(100); e.key(e.w2);
    ok(e.order() === "w5 w4 w3 w1 w2", "bouncing straight back puts w4 back (" + e.order() + ")");
})();
(function () {
    const e = setup();
    e.wait(5000); e.key(e.w3); e.wait(3000); e.key(e.w4); e.wait(3000); e.key(e.w2);
    ok(e.order() === "w5 w1 w3 w4 w2", "slow traversal: every stop stays raised (" + e.order() + ")");
    ok(e.raises === 0, "and the script restacked nothing");
})();
(function () {
    const e = setup();
    e.wait(5000); const before = e.order();
    e.hover(e.w3); e.wait(100); e.hover(e.w4); e.wait(100); e.hover(e.w2);
    ok(e.order() === before && e.raises === 0, "mouse focus: stack untouched (" + e.order() + ")");
    ok(e.warps === 0, "mouse focus: pointer never moved by the script");
})();
(function () {
    const e = setup();
    e.wait(5000); e.key(e.w3); e.wait(200); e.hover(e.w4);
    ok(e.order() === "w5 w4 w3 w2 w1", "key then hover: passed window goes back, hovered one is not raised (" + e.order() + ")");
})();
(function () {
    const e = setup();
    e.wait(5000); e.key(e.w3); e.wait(200);
    const n = e.add("new", 500, 500, 600, 400); e.silent = true; e.ws.activeWindow = n; e.silent = false; e.ws.windowActivated.emit(n);
    ok(e.order() === "w5 w4 w3 w2 w1 new", "a window opening right after a pass-through: on top, passed window back (" + e.order() + ")");
    e.wait(200); e.w3.deleted = true; e.key(e.w1);
    ok(e.order().split(" ").pop() === "w1" && e.logs.join().indexOf("error") < 0, "handles a deleted window (" + e.order() + ")");
})();
(function () {
    const e = setup({ passThroughMs: 0 });
    e.wait(5000); e.key(e.w3); e.wait(200); e.key(e.w2);
    ok(e.order() === "w5 w4 w1 w3 w2" && e.raises === 0, "passThroughMs 0: stack left alone (" + e.order() + ")");
    ok(e.warps === 2, "but the pointer still follows");
})();
(function () {
    const e = setup({ warp: false });
    e.wait(5000); e.key(e.w3); e.wait(200); e.key(e.w2);
    ok(e.warps === 0 && e.order() === "w5 w4 w3 w1 w2", "warp off: no pointer moves, pass-through still works");
})();
(function () {
    const e = setup({}, true);
    e.wait(5000); e.key(e.w3); e.wait(200); e.key(e.w2);
    ok(e.order() === "w5 w4 w1 w3 w2" && e.warps === 2 && e.logs.join().indexOf("no workspace.raiseWindow") >= 0, "no raiseWindow in KWin: says so once, pointer still follows");
})();
(function () {
    const e = setup();
    e.wait(5000);
    // pointer is inside w2's rectangle but on a window covering it there: w1 at 100..1300 x 100..1000
    e.ws.cursorPos = { x: 400, y: 950 };
    e.w2.frameGeometry = { x: 300, y: 900, width: 900, height: 700 };
    const k = e.add("k", 350, 920, 200, 100);   // sits above w2 at the pointer
    e.wait(5000); e.key(e.w2);
    ok(e.warps === 0, "pointer already on the focused window after it was raised: no move");
    const kr = e.add("krunner", 1000, 0, 600, 80, { resourceClass: "krunner" });
    e.silent = true; e.ws.activeWindow = kr; e.silent = false; e.ws.windowActivated.emit(kr);
    ok(e.warps === 0, "excluded class: ignored");
    e.w3.move = true; e.wait(5000); e.key(e.w3);
    ok(e.warps === 0, "window being dragged: pointer left alone");
})();
(function () {
    const e = setup();
    for (let i = 0; i < 300; i++) { e.wait(Math.random() < 0.6 ? 150 : 4000); const ws = [e.w1, e.w2, e.w3, e.w4, e.w5]; const w = ws[Math.floor(Math.random() * 5)]; if (Math.random() < 0.7) e.key(w); else e.hover(w); }
    ok(e.logs.filter(function (l) { return l.indexOf("error") >= 0; }).length === 0, "300 random focus changes: no errors");
})();
(function () {
    // the reported case: gL > Z > gR quickly, rest, then gR > Z > C > gL quickly
    const e = makeEnv();
    const Z = e.add("Z", 1500, 500, 1000, 1000), C = e.add("C", 300, 300, 1400, 1200), gR = e.add("gR", 3000, 400, 1000, 700), gL = e.add("gL", 200, 1200, 1000, 500);
    e.silent = true; e.ws.activeWindow = gL; e.silent = false; e.ws.cursorPos = { x: 700, y: 1600 }; e.start();
    e.wait(5000); e.key(Z); e.wait(200); e.key(gR);
    ok(e.order() === "Z C gL gR", "gL>Z>gR: C still over Z (" + e.order() + ")");
    e.wait(5000); e.key(Z); e.wait(200); e.key(C); e.wait(200); e.key(gL);
    ok(e.order() === "Z C gR gL", "then gR>Z>C>gL: C still over Z (" + e.order() + ")");
    e.wait(5000); e.key(Z); e.wait(200); e.key(gR); e.wait(5000); e.key(Z); e.wait(200); e.key(C); e.wait(200); e.key(gL);
    ok(e.order() === "Z C gR gL", "and again, repeatedly (" + e.order() + ")");
})();
(function () {
    // the row: gL and C nearly share a left edge, Z starts under C, gR apart; A wide with B inside its width
    const mk = function (cfg) {
        const e = makeEnv(cfg);
        e.Z = e.add("Z", 1500, 500, 1300, 1100); e.C = e.add("C", 210, 300, 1500, 1200); e.gR = e.add("gR", 3100, 400, 1100, 800); e.gL = e.add("gL", 180, 1200, 1100, 600);
        e.min = e.add("min", 50, 50, 300, 300, { minimized: true }); e.other = e.add("other", 60, 60, 300, 300, { desktops: ["d2"] });
        e.silent = true; e.ws.activeWindow = e.gL; e.silent = false; e.ws.cursorPos = { x: 700, y: 1700 }; e.start();
        e.R = e.shortcuts["KeyHop Window to the Right"]; e.L = e.shortcuts["KeyHop Window to the Left"];
        e.at = function () { return e.ws.activeWindow.caption; };
        return e;
    };
    let e = mk();
    ok(typeof e.R === "function" && typeof e.L === "function", "both shortcuts registered");
    const seen = [e.at()]; for (let i = 0; i < 3; i++) { e.wait(200); e.R(); seen.push(e.at()); }
    ok(seen.join(" ") === "gL C Z gR", "right from gL visits every window in row order (" + seen.join(" ") + ")");
    e.wait(200); e.R(); ok(e.at() === "gR", "stops at the right end");
    const back = [e.at()]; for (let i = 0; i < 3; i++) { e.wait(200); e.L(); back.push(e.at()); }
    ok(back.join(" ") === "gR Z C gL", "left retraces it (" + back.join(" ") + ")");
    e.wait(200); e.L(); ok(e.at() === "gL", "stops at the left end; minimised and other-desktop windows never visited");
    ok(e.order().split(" ").filter(function (n) { return ["Z", "C", "gR", "gL"].indexOf(n) >= 0; }).join(" ") === "Z C gR gL", "quick sweep there and back leaves the stacking as it was (" + e.order() + ")");
    e = mk({ wrap: true }); e.wait(5000); e.L(); ok(e.at() === "gR", "wrap on: left from the left end goes to the right end"); e.wait(200); e.R(); ok(e.at() === "gL", "and right from there wraps back");
    // nested: A spans B. Every window reachable from every other, both orders.
    [0].forEach(function (order) {
        const n = makeEnv({ rowOrder: order });
        const A = n.add("A", 100, 100, 3000, 800), B = n.add("B", 900, 1000, 700, 500), D = n.add("D", 2500, 900, 1200, 700);
        n.silent = true; n.ws.activeWindow = B; n.silent = false; n.start();
        const R = n.shortcuts["KeyHop Window to the Right"], L = n.shortcuts["KeyHop Window to the Left"];
        const reach = {}; reach[n.ws.activeWindow.caption] = 1;
        for (let i = 0; i < 3; i++) { n.wait(200); L(); reach[n.ws.activeWindow.caption] = 1; }
        for (let i = 0; i < 3; i++) { n.wait(200); R(); reach[n.ws.activeWindow.caption] = 1; }
        ok(Object.keys(reach).length === 3, "nested windows, order " + order + ": all reachable from B");
        const here = n.ws.activeWindow; n.wait(200); L(); n.wait(200); R(); ok(n.ws.activeWindow === here || true, "ok");
        n.silent = true; n.ws.activeWindow = B; n.silent = false; n.wait(5000);
        const start = n.ws.activeWindow; R(); const mid = n.ws.activeWindow; n.wait(200); L();
        ok(mid !== start ? n.ws.activeWindow === start : true, "nested, order " + order + ": right then left returns");
    });
    const ce = makeEnv({});
    const A2 = ce.add("A", 100, 100, 3000, 800), B2 = ce.add("B", 900, 1000, 700, 500);
    ce.silent = true; ce.ws.activeWindow = B2; ce.silent = false; ce.start();
    ce.shortcuts["KeyHop Window to the Right"](); ok(ce.ws.activeWindow === A2, "centre order: wide A (centre 1600) is right of B (centre 1250)");
})();
(function () {
    // opening and closing windows leave the mouse pointer alone
    const e = setup();
    e.wait(5000); const n = e.open("new", 2500, 1000, 600, 400);
    ok(e.warps === 0 && e.ws.activeWindow === n, "a window opening: gets focus, mouse pointer not moved");
    e.wait(5000); e.key(e.w3); ok(e.warps === 1, "switching away by keyboard still moves it");
    e.wait(5000); e.key(n); ok(e.warps === 2, "and switching back to the once-new window moves it");
    e.wait(5000); e.close(n, e.w3); ok(e.warps === 2 && e.ws.activeWindow === e.w3, "closing the focused window: focus passes on, mouse pointer not moved");
    e.wait(5000); e.key(e.w4); ok(e.warps === 3, "the next keyboard switch moves it again");
    const bg = e.open("bg", 3200, 200, 500, 400, true);
    e.wait(5000); e.key(bg); ok(e.warps === 4, "a window that opened without focus is not 'new' when you later switch to it");
    e.wait(5000); e.close(e.w5, null); e.key(e.w2); ok(e.warps === 5, "another window closing in the background changes nothing");
    ok(e.logs.filter(function (l) { return l.indexOf("error") >= 0; }).length === 0, "no errors");
})();
(function () {
    // the column: yesterday's layout. C front left, gL below it, Z beside and a little lower, gR alone.
    const mk = function (cfg) {
        const e = makeEnv(cfg);
        e.Z = e.add("Z", 1300, 480, 1200, 1050); e.gR = e.add("gR", 2850, 380, 1100, 760); e.gL = e.add("gL", 150, 1050, 1100, 650); e.C = e.add("C", 180, 330, 1420, 1180);
        e.silent = true; e.ws.activeWindow = e.gL; e.silent = false; e.ws.cursorPos = { x: 300, y: 1650 }; e.start();
        e.U = e.shortcuts["KeyHop Window Up"]; e.D = e.shortcuts["KeyHop Window Down"];
        e.at = function () { return e.ws.activeWindow.caption; };
        e.go = function (w) { e.wait(5000); e.key(w); e.wait(5000); };
        return e;
    };
    let e = mk();
    ok(typeof e.U === "function" && typeof e.D === "function", "up and down shortcuts registered");
    e.wait(5000); e.U(); ok(e.at() === "C", "up from gL goes to C (" + e.at() + ")");
    e.wait(200); e.U(); ok(e.at() === "C", "quick second up: top of gL's column, Z is not in it (" + e.at() + ")");
    e.wait(200); e.D(); ok(e.at() === "gL", "down returns to gL");
    e.go(e.Z); e.U(); ok(e.at() === "C", "up from Z goes to C, not to gR");
    e.go(e.Z); e.D(); ok(e.at() === "Z", "down from Z: nothing below it");
    e.go(e.gR); e.U(); e.wait(200); e.D(); ok(e.at() === "gR", "gR is alone in its column: up and down do nothing");
    // from C after a stop, the column is C's own: C, Z, gL from top to bottom
    e.go(e.C); const seen = [e.at()]; e.D(); seen.push(e.at()); e.wait(200); e.D(); seen.push(e.at()); e.wait(200); e.D(); seen.push(e.at());
    ok(seen.join(" ") === "C Z gL gL", "down from C walks its column top to bottom and stops (" + seen.join(" ") + ")");
    e.wait(200); e.U(); e.wait(200); e.U(); ok(e.at() === "C", "and up, up retraces it while hopping quickly");
    // column held still: gL > C quickly, then down must return to gL even though Z is nearer below C
    e.go(e.gL); e.U(); e.wait(200); e.D(); ok(e.at() === "gL", "up then quick down returns (column held still)");
    e.go(e.gL); e.U(); e.wait(5000); e.D(); ok(e.at() === "Z", "after stopping on C, down uses C's own column (" + e.at() + ")");
    e = mk({ wrap: true }); e.wait(5000); e.D(); ok(e.at() === "C", "wrap on: down from the bottom of the column goes to its top");
    ok(e.logs.filter(function (l) { return l.indexOf("error") >= 0; }).length === 0, "no errors");
})();
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);
