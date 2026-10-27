// 预加载脚本：渲染进程唯一能用到的桌面能力。
// 必须是 CommonJS（sandbox: true 时 Electron 不支持 ESM preload）。
const { contextBridge, ipcRenderer } = require("electron");

/** 订阅主进程事件，返回取消订阅函数。 */
function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("writara", {
  desktop: true,
  platform: process.platform,

  fs: {
    openFile: () => ipcRenderer.invoke("fs:open"),
    read: (target) => ipcRenderer.invoke("fs:read", target),
    save: (request) => ipcRenderer.invoke("fs:save", request),
    write: (target, text, format) =>
      ipcRenderer.invoke("fs:write", {
        path: target,
        text,
        encoding: format && format.encoding,
        bom: format && format.bom,
      }),
    authorizeRestore: (paths) => ipcRenderer.invoke("fs:authorizeRestore", paths),
    chooseFolder: (options) => ipcRenderer.invoke("fs:chooseFolder", options),
    scan: (root, limits) => ipcRenderer.invoke("fs:scan", { root, limits }),
    scanAssets: (root, limits) => ipcRenderer.invoke("fs:scanAssets", { root, limits }),
    readRootFile: (root, path) => ipcRenderer.invoke("fs:readRootFile", { root, path }),
    writeRootFile: (root, path, text) => ipcRenderer.invoke("fs:writeRootFile", { root, path, text }),
    createRootDir: (root, path) => ipcRenderer.invoke("fs:createRootDir", { root, path }),
    createFile: (root, name) => ipcRenderer.invoke("fs:createFile", { root, name }),
    restoreFile: (root, path, text) => ipcRenderer.invoke("fs:restoreFile", { root, path, text }),
    renameFile: (root, file, name) =>
      ipcRenderer.invoke("fs:rename", { root, from: file.path, name }),
    deleteFile: (root, file) => ipcRenderer.invoke("fs:delete", { root, path: file.path }),
    readImage: (root, relPath) => ipcRenderer.invoke("fs:readImage", { root, path: relPath }),
    saveImage: (docPath, options, fileName, data) =>
      ipcRenderer.invoke("fs:saveImage", { docPath, options, fileName, data }),
    reveal: (target) => ipcRenderer.invoke("fs:reveal", target),
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
    openPath: (target) => ipcRenderer.invoke("shell:openPath", target),
    showItemInFolder: (target) => ipcRenderer.invoke("shell:showItemInFolder", target),
  },

  menu: {
    updateState: (state) => ipcRenderer.invoke("menu:state", state),
  },

  ai: {
    detect: (force) => ipcRenderer.invoke("ai:detect", force === true),
    models: (agentId) => ipcRenderer.invoke("ai:models", agentId),
    run: (payload) => ipcRenderer.invoke("ai:run", payload),
    cancel: (runId) => ipcRenderer.invoke("ai:cancel", runId),
  },

  pdf: {
    export: (request) => ipcRenderer.invoke("pdf:export", request),
    preview: (request) => ipcRenderer.invoke("pdf:preview", request),
  },

  spell: {
    languages: () => ipcRenderer.invoke("spell:languages"),
    set: (languages) => ipcRenderer.invoke("spell:set", languages),
  },

  pandoc: {
    detect: (configured) => ipcRenderer.invoke("pandoc:detect", configured),
    export: (request) => ipcRenderer.invoke("pandoc:export", request),
  },

  store: {
    read: () => ipcRenderer.sendSync("store:read-sync"),
    write: (patch) => ipcRenderer.invoke("store:write", patch),
  },

  updates: {
    status: () => ipcRenderer.invoke("updates:status"),
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.invoke("updates:install"),
    onStatus: (callback) => subscribe("updates:status", callback),
  },

  setDirty: (value) => ipcRenderer.send("app:dirty", Boolean(value)),
  shellReady: () => ipcRenderer.send("app:shell-ready"),
  replyClose: (ok) => ipcRenderer.send("app:close-reply", Boolean(ok)),
  newWindow: () => ipcRenderer.invoke("app:new-window"),

  onMenuCommand: (callback) => subscribe("menu:command", callback),
  onOpenFile: (callback) => subscribe("app:open-file", callback),
  onFileChanged: (callback) => subscribe("app:file-changed", callback),
  onWorkspaceChanged: (callback) => subscribe("app:workspace-changed", callback),
  onCloseRequest: (callback) => subscribe("app:close-request", callback),
});
