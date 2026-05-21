export interface SystemStatus {
  running: boolean;
  version: string;
  appRoot: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  os: string;
  arch: string;
  ports: string[];
}

export interface ImageInfo {
  reference: string;
  name: string;
  tag: string;
  digest: string;
  fullSize: string;
}

export interface VolumeInfo {
  name: string;
  driver: string;
  created: string;
  size: string;
  labels: Record<string, string>;
}

export interface RunContainerRequest {
  image: string;
  name?: string;
  ports?: string[];
  envs?: string[];
  volumes?: string[];
}

export interface BuildImageRequest {
  contextPath: string;
  dockerfile?: string;
  tag: string;
  platforms?: string;
  targetStage?: string;
  buildArgs?: string[];
}

export interface SaveImageRequest {
  references: string[];
  outputPath: string;
  platform?: string;
}

export interface CreateVolumeRequest {
  name: string;
  size?: string;
  labels?: string[];
  options?: string[];
}

export interface AppSettings {
  executablePath: string;
}

export interface IpcResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}
