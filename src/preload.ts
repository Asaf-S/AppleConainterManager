import { contextBridge, ipcRenderer } from 'electron';
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

contextBridge.exposeInMainWorld('electronAPI', {
  // System
  systemStatus: (): Promise<IpcResponse<SystemStatus>> =>
    ipcRenderer.invoke('system:status'),
  systemStart: (): Promise<IpcResponse> =>
    ipcRenderer.invoke('system:start'),
  systemStop: (): Promise<IpcResponse> =>
    ipcRenderer.invoke('system:stop'),

  // Containers
  containerList: (): Promise<IpcResponse<ContainerInfo[]>> =>
    ipcRenderer.invoke('containers:list'),
  containerStart: (name: string): Promise<IpcResponse> =>
    ipcRenderer.invoke('containers:start', name),
  containerStop: (name: string): Promise<IpcResponse> =>
    ipcRenderer.invoke('containers:stop', name),
  containerDelete: (names: string[]): Promise<IpcResponse> =>
    ipcRenderer.invoke('containers:delete', names),
  containerRun: (opts: RunContainerRequest): Promise<IpcResponse> =>
    ipcRenderer.invoke('containers:run', opts),
  containerInspect: (name: string): Promise<IpcResponse<unknown>> =>
    ipcRenderer.invoke('containers:inspect', name),
  containerLogs: (name: string): Promise<IpcResponse<string>> =>
    ipcRenderer.invoke('containers:logs', name),

  // Images
  imageList: (): Promise<IpcResponse<ImageInfo[]>> =>
    ipcRenderer.invoke('images:list'),
  imagePull: (reference: string, platform?: string): Promise<IpcResponse> =>
    ipcRenderer.invoke('images:pull', reference, platform),
  imageBuild: (opts: BuildImageRequest): Promise<IpcResponse> =>
    ipcRenderer.invoke('images:build', opts),
  imageSave: (opts: SaveImageRequest): Promise<IpcResponse> =>
    ipcRenderer.invoke('images:save', opts),
  imageLoad: (tarPath: string): Promise<IpcResponse> =>
    ipcRenderer.invoke('images:load', tarPath),
  imageDelete: (references: string[]): Promise<IpcResponse> =>
    ipcRenderer.invoke('images:delete', references),

  // Volumes
  volumeList: (): Promise<IpcResponse<VolumeInfo[]>> =>
    ipcRenderer.invoke('volumes:list'),
  volumeCreate: (opts: CreateVolumeRequest): Promise<IpcResponse> =>
    ipcRenderer.invoke('volumes:create', opts),
  volumeDelete: (names: string[]): Promise<IpcResponse> =>
    ipcRenderer.invoke('volumes:delete', names),

  // Settings
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:get'),
  setSettings: (s: AppSettings): Promise<void> =>
    ipcRenderer.invoke('settings:set', s),
  executableExists: (execPath: string): Promise<boolean> =>
    ipcRenderer.invoke('settings:executableExists', execPath),

  // Dialogs
  openFilePicker: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),
  openFolderPicker: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFolder'),
  saveFilePicker: (defaultName?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultName),

  // Events from main
  onProgress: (callback: (message: string) => void): void => {
    ipcRenderer.on('progress', (_event, message: string) => callback(message));
  },
});
