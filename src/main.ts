import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { ContainerCLI } from './container-cli';
import type {
  AppSettings,
  RunContainerRequest,
  BuildImageRequest,
  SaveImageRequest,
  CreateVolumeRequest,
  IpcResponse,
  SystemStatus,
  ContainerInfo,
  ImageInfo,
  VolumeInfo,
} from './types';

const isDev = process.argv.includes('--dev');

let mainWindow: BrowserWindow | null = null;
let cli = new ContainerCLI();

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    return JSON.parse(raw) as AppSettings;
  } catch {
    return { executablePath: ContainerCLI.findExecutable() };
  }
}

function saveSettings(settings: AppSettings): void {
  const dir = path.dirname(getSettingsPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

function sendProgress(message: string): void {
  mainWindow?.webContents.send('progress', message);
}

function registerIpcHandlers(): void {
  // System
  ipcMain.handle('system:status', async (): Promise<IpcResponse<SystemStatus>> => {
    try {
      const data = await cli.getSystemStatus();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('system:start', async (): Promise<IpcResponse> => {
    try {
      sendProgress('Starting system services...');
      await cli.startSystem();
      sendProgress('System started.');
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('system:stop', async (): Promise<IpcResponse> => {
    try {
      sendProgress('Stopping system services...');
      await cli.stopSystem();
      sendProgress('System stopped.');
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Containers
  ipcMain.handle('containers:list', async (): Promise<IpcResponse<ContainerInfo[]>> => {
    try {
      const data = await cli.listContainers();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('containers:start', async (_e, name: string): Promise<IpcResponse> => {
    try {
      sendProgress(`Starting container ${name}...`);
      await cli.startContainer(name);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('containers:stop', async (_e, name: string): Promise<IpcResponse> => {
    try {
      sendProgress(`Stopping container ${name}...`);
      await cli.stopContainer(name);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('containers:delete', async (_e, names: string[]): Promise<IpcResponse> => {
    try {
      sendProgress(`Deleting ${names.length} container(s)...`);
      await cli.deleteContainers(names);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('containers:run', async (_e, opts: RunContainerRequest): Promise<IpcResponse> => {
    try {
      sendProgress(`Creating container from ${opts.image}...`);
      await cli.runContainer(opts);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('containers:inspect', async (_e, name: string): Promise<IpcResponse<unknown>> => {
    try {
      const data = await cli.inspectContainer(name);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('containers:logs', async (_e, name: string): Promise<IpcResponse<string>> => {
    try {
      const data = await cli.getContainerLogs(name);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Images
  ipcMain.handle('images:list', async (): Promise<IpcResponse<ImageInfo[]>> => {
    try {
      const data = await cli.listImages();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('images:pull', async (_e, reference: string, platform?: string): Promise<IpcResponse> => {
    try {
      sendProgress(`Pulling ${reference}...`);
      await cli.pullImage(reference, platform, (d) => sendProgress(d.trim()));
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('images:build', async (_e, opts: BuildImageRequest): Promise<IpcResponse> => {
    try {
      sendProgress(`Building image ${opts.tag}...`);
      await cli.buildImage(opts, (d) => sendProgress(d.trim()));
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('images:save', async (_e, opts: SaveImageRequest): Promise<IpcResponse> => {
    try {
      sendProgress(`Saving images to ${opts.outputPath}...`);
      await cli.saveImages(opts);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('images:load', async (_e, tarPath: string): Promise<IpcResponse> => {
    try {
      sendProgress(`Loading images from ${tarPath}...`);
      await cli.loadImages(tarPath, (d) => sendProgress(d.trim()));
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('images:delete', async (_e, references: string[]): Promise<IpcResponse> => {
    try {
      sendProgress(`Deleting ${references.length} image(s)...`);
      await cli.deleteImages(references);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Volumes
  ipcMain.handle('volumes:list', async (): Promise<IpcResponse<VolumeInfo[]>> => {
    try {
      const data = await cli.listVolumes();
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('volumes:create', async (_e, opts: CreateVolumeRequest): Promise<IpcResponse> => {
    try {
      sendProgress(`Creating volume ${opts.name}...`);
      await cli.createVolume(opts);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('volumes:delete', async (_e, names: string[]): Promise<IpcResponse> => {
    try {
      sendProgress(`Deleting ${names.length} volume(s)...`);
      await cli.deleteVolumes(names);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Settings
  ipcMain.handle('settings:get', (): AppSettings => {
    return loadSettings();
  });

  ipcMain.handle('settings:set', (_e, settings: AppSettings): void => {
    saveSettings(settings);
    cli.setExecutablePath(settings.executablePath);
  });

  ipcMain.handle('settings:executableExists', (_e, execPath: string): boolean => {
    const testCli = new ContainerCLI(execPath);
    return testCli.executableExists();
  });

  // Dialogs
  ipcMain.handle('dialog:openFile', async (_e, filters?: { name: string; extensions: string[] }[]): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters ?? [],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle('dialog:openFolder', async (): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle('dialog:saveFile', async (_e, defaultName?: string): Promise<string | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
    });
    return result.canceled ? null : (result.filePath ?? null);
  });
}

function createWindow(): void {
  const settings = loadSettings();
  cli.setExecutablePath(settings.executablePath);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 800,
    minHeight: 560,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
