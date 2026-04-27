const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const { autoUpdater } = require("electron-updater");

// ---- Offline System ----
let offlineDb = null;
let imageCache = null;
let syncEngine = null;

function initializeOfflineSystem() {
    try {
        const { OfflineDatabase } = require("./offline/electron/offlineDatabase");
        const { ImageCache } = require("./offline/electron/imageCache");
        const { SyncEngine } = require("./offline/electron/syncEngine");

        const dbPath = path.join(app.getPath("userData"), "offline.db");
        offlineDb = new OfflineDatabase(dbPath);
        imageCache = new ImageCache(app.getPath("userData"), offlineDb);
        syncEngine = new SyncEngine({
            db: offlineDb,
            imageCache,
            supabaseUrl: "https://erpflowstudios.com",
            supabaseAnonKey: "",
            mainWindow,
        });

        console.log("[Offline] System initialized:", dbPath);
    } catch (err) {
        console.error("[Offline] Failed to initialize:", err.message || err);
    }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
    app.exit(0);
}

let splashWindow = null;
let mainWindow = null;
let splashStartTime = 0;
const MIN_SPLASH_MS = 6500;
let isQuitting = false;
let isAutoUpdaterInitialized = false;
let isCheckingForUpdates = false;
let isDownloadingUpdate = false;
let isInstallingUpdate = false;

function isTrustedAppOrigin(value) {
    if (!value || typeof value !== "string") return false;
    try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        if (parsed.origin === "https://erpflowstudios.com") return true;
        if (host === "localhost" || host === "127.0.0.1") return true;
        return false;
    } catch {
        return false;
    }
}

function isMediaPermission(permission) {
    const normalized = String(permission || "").toLowerCase();
    return normalized === "media" || normalized === "microphone" || normalized === "audiocapture" || normalized === "videoCapture".toLowerCase();
}

function prepareWindowsForQuit() {
    const allWindows = BrowserWindow.getAllWindows();
    for (const win of allWindows) {
        try {
            win.removeAllListeners("close");
            win.removeAllListeners("closed");
            win.destroy();
        } catch {
            // Best-effort teardown.
        }
    }
}

function gracefulQuit() {
    isQuitting = true;
    prepareWindowsForQuit();
    app.quit();

    // Installer-driven closes can occasionally leave Electron alive on Windows.
    // Force an exit shortly after requesting quit so updates/uninstalls can proceed.
    setTimeout(() => {
        app.exit(0);
    }, 2000);
}

async function launchDownloadedInstaller(updateInfo) {
    const installerPath = updateInfo?.downloadedFile || autoUpdater.installerPath;
    if (!installerPath) {
        return false;
    }

    if (process.platform === "win32") {
        try {
            const installDir = path.dirname(process.execPath);
            const installerArgs = ["--updated", "--force-run", `/D=${installDir}`];
            const packageFile = autoUpdater.downloadedUpdateHelper?.packageFile;
            if (packageFile) {
                installerArgs.push(`--package-file=${packageFile}`);
            }

            const child = spawn(installerPath, installerArgs, {
                cwd: path.dirname(installerPath),
                detached: true,
                stdio: "ignore",
                windowsHide: false
            });
            child.unref();

            if (typeof child.pid === "number" && child.pid > 0) {
                return true;
            }
        } catch {
            // Try shell.openPath fallback below.
        }
    }

    try {
        const openError = await shell.openPath(installerPath);
        return !openError;
    } catch {
        return false;
    }
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdaterEvent(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("updater-event", payload);
    }
}

function initializeAutoUpdater() {
    if (!app.isPackaged || isAutoUpdaterInitialized) {
        return;
    }

    isAutoUpdaterInitialized = true;

    autoUpdater.on("checking-for-update", () => {
        sendUpdaterEvent({
            event: "checking-for-update",
            status: "Checking for updates..."
        });
    });

    autoUpdater.on("update-available", (info) => {
        sendUpdaterEvent({
            event: "update-available",
            status: "Update available",
            version: info?.version || null
        });
    });

    autoUpdater.on("download-progress", (progressObj) => {
        sendUpdaterEvent({
            event: "download-progress",
            status: "Downloading update...",
            percent: typeof progressObj?.percent === "number" ? progressObj.percent : 0
        });
    });

    autoUpdater.on("update-downloaded", (updateInfo) => {
        if (isInstallingUpdate) {
            return;
        }

        isDownloadingUpdate = false;
        isInstallingUpdate = true;

        sendUpdaterEvent({
            event: "update-downloaded",
            status: "Update downloaded. Restarting to install...",
            percent: 100
        });

        setTimeout(async () => {
            isQuitting = true;
            prepareWindowsForQuit();
            const launched = await launchDownloadedInstaller(updateInfo);
            if (launched) {
                // Ensure installer process has started before we terminate ourselves.
                setTimeout(() => {
                    gracefulQuit();
                }, 900);
                return;
            }

            autoUpdater.quitAndInstall(false, true);
            setTimeout(() => app.exit(0), 4000);
        }, 800);
    });

    autoUpdater.on("error", (error) => {
        isCheckingForUpdates = false;
        isDownloadingUpdate = false;
        if (!isQuitting) {
            isInstallingUpdate = false;
        }

        sendUpdaterEvent({
            event: "error",
            status: "Update error",
            error: error?.message || String(error)
        });
    });

}

function createSplashScreen() {
    splashStartTime = Date.now();
    // Determine the correct icon path
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, "icons", "app.ico")
        : path.join(__dirname, "icons", "app.ico");

    splashWindow = new BrowserWindow({
        width: 546,
        height: 322,
        transparent: false,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        center: true,
        icon: iconPath,
        backgroundColor: '#000818',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Load splash screen HTML
    const splashPath = app.isPackaged
        ? path.join(process.resourcesPath, "splash.html")
        : path.join(__dirname, "splash.html");

    splashWindow.loadFile(splashPath, {
        query: {
            version: app.getVersion()
        }
    });
    splashWindow.setMenu(null);
}

function createWindow() {
    // Determine the correct icon path based on whether the app is packaged
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, "icons", "app.ico")
        : path.join(__dirname, "icons", "app.ico");

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false, // Don't show immediately
        autoHideMenuBar: true,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const session = mainWindow.webContents.session;
    session.setPermissionRequestHandler((webContents, permission, callback, details) => {
        if (!isMediaPermission(permission)) {
            callback(false);
            return;
        }

        const requestingUrl = details?.requestingUrl || webContents?.getURL?.() || "";
        callback(isTrustedAppOrigin(String(requestingUrl)));
    });

    session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (!isMediaPermission(permission)) {
            return true;
        }

        const originCandidate = requestingOrigin || details?.requestingUrl || webContents?.getURL?.() || "";
        return isTrustedAppOrigin(String(originCandidate));
    });

    const version = app.getVersion();
    mainWindow.loadURL(`https://erpflowstudios.com/app?desktopVersion=${version}`);

    mainWindow.on("close", (event) => {
        if (isQuitting) return;

        event.preventDefault();

        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: "question",
            buttons: ["Cancel", "Exit"],
            defaultId: 0,
            cancelId: 0,
            title: "Confirm Exit",
            message: "Are you sure you want to close ERP Flow Studios?"
        });

        if (choice === 1) {
            gracefulQuit();
        }
    });

    // When main window finishes loading, keep splash visible for the full
    // minimum duration so all animations play through before revealing the app.
    mainWindow.webContents.on("did-finish-load", () => {
        const elapsed = Date.now() - splashStartTime;
        const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
        setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.close();
                splashWindow = null;
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
                mainWindow.focus();
            }
        }, remaining);
    });

    // Handle main window close
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

// Allow the web app to trigger a graceful quit so the installer
// can replace the binary without file-lock errors.
ipcMain.on("quit-app", () => {
    gracefulQuit();
});

ipcMain.handle("updater-download-update", async () => {
    if (isDownloadingUpdate || isInstallingUpdate) {
        return { ok: true, skipped: true };
    }

    try {
        isDownloadingUpdate = true;
        await autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            error: error?.message || String(error)
        };
    } finally {
        if (!isInstallingUpdate) {
            isDownloadingUpdate = false;
        }
    }
});

ipcMain.handle("updater-check-for-updates", async () => {
    if (!app.isPackaged) {
        return { ok: false, error: "Auto updates are disabled in development mode." };
    }

    if (isCheckingForUpdates || isDownloadingUpdate || isInstallingUpdate) {
        return { ok: true, skipped: true };
    }

    try {
        isCheckingForUpdates = true;
        await autoUpdater.checkForUpdatesAndNotify();
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            error: error?.message || String(error)
        };
    } finally {
        isCheckingForUpdates = false;
    }
});

// ---- Offline System IPC Handlers ----

ipcMain.handle("offline-initial-sync", async (_event, { authToken, clinic, user }) => {
    if (!syncEngine) return { ok: false, error: "Offline system not initialized" };
    try {
        await syncEngine.initialSync(authToken, clinic, user);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

ipcMain.handle("offline-start-sync", async (_event, { authToken }) => {
    if (!syncEngine) return { ok: false, error: "Offline system not initialized" };
    syncEngine.start(authToken);
    return { ok: true };
});

ipcMain.handle("offline-stop-sync", async () => {
    if (syncEngine) syncEngine.stop();
    return { ok: true };
});

ipcMain.handle("offline-trigger-sync", async (_event, { reason }) => {
    if (!syncEngine) return { ok: false };
    await syncEngine.triggerImmediate(reason || "manual");
    return { ok: true };
});

ipcMain.handle("offline-db-query", async (_event, { method, args }) => {
    if (!offlineDb) return { ok: false, error: "DB not initialized" };
    try {
        const result = offlineDb[method](...(args || []));
        return { ok: true, data: result };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

ipcMain.handle("offline-image-resolve", async (_event, { cloudUrl }) => {
    if (!imageCache) return { localUrl: null };
    const fileUrl = imageCache.getFileUrl(cloudUrl);
    return { localUrl: fileUrl };
});

ipcMain.handle("offline-get-stats", async () => {
    if (!imageCache || !offlineDb) return { ok: false };
    return {
        ok: true,
        imageCache: imageCache.getStats(),
        syncQueue: offlineDb.getQueueCounts(),
        syncLogs: offlineDb.getSyncLogs(20),
    };
});

ipcMain.handle("offline-get-sync-logs", async (_event, { limit }) => {
    if (!offlineDb) return { ok: false, logs: [] };
    return { ok: true, logs: offlineDb.getSyncLogs(limit || 100) };
});

// Record user activity for adaptive sync timing
ipcMain.on("offline-user-activity", () => {
    if (syncEngine) syncEngine.recordActivity();
});

app.whenReady().then(() => {
    // Set the app user model ID for Windows to ensure proper taskbar/start menu icon
    if (process.platform === 'win32') {
        app.setAppUserModelId("com.erpflowstudios.desktop");
    }
    
    // Show splash screen first
    createSplashScreen();
    
    // Then create main window (hidden)
    createWindow();

    initializeAutoUpdater();

    // Initialize offline system after window is created
    initializeOfflineSystem();
});

app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

app.on("before-quit", () => {
    isQuitting = true;
    prepareWindowsForQuit();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
