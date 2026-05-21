import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  hello: (): string => 'Hello from Electron preload!'
});
