import { spawn } from 'child_process';
import { existsSync } from 'fs';
import type {
  SystemStatus,
  ContainerInfo,
  ImageInfo,
  VolumeInfo,
  RunContainerRequest,
  BuildImageRequest,
  SaveImageRequest,
  CreateVolumeRequest,
} from './types';

const DEFAULT_PATHS = [
  '/opt/homebrew/bin/container',
  '/usr/local/bin/container',
  '/usr/bin/container',
];

const EXTENDED_PATH = `/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`;

export class ContainerCLI {
  private execPath: string;

  constructor(execPath?: string) {
    this.execPath = execPath || ContainerCLI.findExecutable();
  }

  static findExecutable(): string {
    for (const p of DEFAULT_PATHS) {
      if (existsSync(p)) return p;
    }
    return 'container';
  }

  setExecutablePath(p: string): void {
    this.execPath = p;
  }

  getExecutablePath(): string {
    return this.execPath;
  }

  executableExists(): boolean {
    if (this.execPath === 'container') {
      return DEFAULT_PATHS.some(p => existsSync(p));
    }
    return existsSync(this.execPath);
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.execPath, args, {
        env: { ...process.env, PATH: EXTENDED_PATH },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr.trim() || `Process exited with code ${code}`));
        }
      });

      proc.on('error', (err: Error) => reject(err));
    });
  }

  runWithStream(args: string[], onData: (data: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.execPath, args, {
        env: { ...process.env, PATH: EXTENDED_PATH },
      });

      proc.stdout.on('data', (d: Buffer) => onData(d.toString()));
      proc.stderr.on('data', (d: Buffer) => onData(d.toString()));

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      proc.on('error', (err: Error) => reject(err));
    });
  }

  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const output = await this.run(['system', 'status', '--format', 'json']);
      const data = JSON.parse(output) as Record<string, string>;
      return {
        running: data['status'] === 'running',
        version: data['apiServerVersion'] || '',
        appRoot: data['appRoot'] || '',
      };
    } catch {
      return { running: false, version: '', appRoot: '' };
    }
  }

  async startSystem(): Promise<void> {
    await this.run(['system', 'start']);
  }

  async stopSystem(): Promise<void> {
    await this.run(['system', 'stop']);
  }

  async listContainers(): Promise<ContainerInfo[]> {
    const output = await this.run(['list', '--all', '--format', 'json']);
    const data = JSON.parse(output) as Record<string, unknown>[];
    return (Array.isArray(data) ? data : []).map((c) => ({
      id: String(c['id'] || c['name'] || ''),
      name: String(c['name'] || c['id'] || ''),
      image: String(c['image'] || ''),
      status: String(c['status'] || 'unknown'),
      os: String(c['os'] || 'linux'),
      arch: String(c['arch'] || 'arm64'),
      ports: Array.isArray(c['ports']) ? (c['ports'] as string[]) : [],
    }));
  }

  async startContainer(name: string): Promise<void> {
    await this.run(['start', name]);
  }

  async stopContainer(name: string): Promise<void> {
    await this.run(['stop', name]);
  }

  async deleteContainers(names: string[]): Promise<void> {
    await this.run(['delete', '--force', ...names]);
  }

  async runContainer(opts: RunContainerRequest): Promise<void> {
    const args = ['run', '--detach'];
    if (opts.name) args.push('--name', opts.name);
    for (const p of opts.ports ?? []) args.push('--publish', p);
    for (const e of opts.envs ?? []) args.push('--env', e);
    for (const v of opts.volumes ?? []) args.push('--volume', v);
    args.push(opts.image);
    await this.run(args);
  }

  async inspectContainer(name: string): Promise<unknown> {
    const output = await this.run(['inspect', name]);
    return JSON.parse(output) as unknown;
  }

  async getContainerLogs(name: string): Promise<string> {
    try {
      return await this.run(['logs', name]);
    } catch {
      return '';
    }
  }

  async listImages(): Promise<ImageInfo[]> {
    const output = await this.run(['image', 'list', '--format', 'json']);
    const data = JSON.parse(output) as Record<string, unknown>[];
    return (Array.isArray(data) ? data : []).map((img) => {
      const ref = String(img['reference'] || '');
      const colonIdx = ref.lastIndexOf(':');
      const tag = colonIdx >= 0 ? ref.slice(colonIdx + 1) : 'latest';
      const name = colonIdx >= 0 ? ref.slice(0, colonIdx) : ref;
      const descriptor = img['descriptor'] as Record<string, unknown> | undefined;
      return {
        reference: ref,
        name,
        tag,
        digest: String(descriptor?.['digest'] || ''),
        fullSize: String(img['fullSize'] || ''),
      };
    });
  }

  async pullImage(reference: string, platform?: string, onData?: (d: string) => void): Promise<void> {
    const args = ['image', 'pull', reference];
    if (platform) args.push('--platform', platform);
    if (onData) {
      await this.runWithStream(args, onData);
    } else {
      await this.run(args);
    }
  }

  async buildImage(opts: BuildImageRequest, onData?: (d: string) => void): Promise<void> {
    const args = ['build', '--tag', opts.tag];
    if (opts.dockerfile) args.push('--file', opts.dockerfile);
    if (opts.platforms) args.push('--platform', opts.platforms);
    if (opts.targetStage) args.push('--target', opts.targetStage);
    for (const a of opts.buildArgs ?? []) args.push('--build-arg', a);
    args.push(opts.contextPath);
    if (onData) {
      await this.runWithStream(args, onData);
    } else {
      await this.run(args);
    }
  }

  async saveImages(opts: SaveImageRequest): Promise<void> {
    const args = ['image', 'save', '--output', opts.outputPath];
    if (opts.platform) args.push('--platform', opts.platform);
    args.push(...opts.references);
    await this.run(args);
  }

  async loadImages(tarPath: string, onData?: (d: string) => void): Promise<void> {
    const args = ['image', 'load', '--input', tarPath];
    if (onData) {
      await this.runWithStream(args, onData);
    } else {
      await this.run(args);
    }
  }

  async deleteImages(references: string[]): Promise<void> {
    await this.run(['image', 'delete', ...references]);
  }

  async listVolumes(): Promise<VolumeInfo[]> {
    const output = await this.run(['volume', 'list', '--format', 'json']);
    const data = JSON.parse(output) as Record<string, unknown>[];
    return (Array.isArray(data) ? data : []).map((v) => ({
      name: String(v['name'] || ''),
      driver: String(v['driver'] || ''),
      created: String(v['created'] || ''),
      size: String(v['size'] || ''),
      labels: (v['labels'] as Record<string, string>) || {},
    }));
  }

  async createVolume(opts: CreateVolumeRequest): Promise<void> {
    const args = ['volume', 'create'];
    if (opts.size) args.push('-s', opts.size);
    for (const l of opts.labels ?? []) args.push('--label', l);
    for (const o of opts.options ?? []) args.push('--opt', o);
    args.push(opts.name);
    await this.run(args);
  }

  async deleteVolumes(names: string[]): Promise<void> {
    await this.run(['volume', 'delete', ...names]);
  }
}
