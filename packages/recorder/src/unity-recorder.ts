import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  logger,
  type Scene,
  type UnityConfig,
  type VideoConfig,
} from '@auto-product-video-generator/core';
import type { PlatformRecorder, PlatformRecordOptions } from './types.js';

interface UnityRecorderContext {
  rootDir?: string;
  workDir: string;
}

export class UnityRecorder implements PlatformRecorder {
  private generatedDirectory?: string;

  constructor(
    private readonly target: UnityConfig,
    private readonly context: UnityRecorderContext
  ) {}

  async recordScene(
    scene: Scene,
    config: VideoConfig,
    options: PlatformRecordOptions,
    targetDurationSeconds = 1
  ): Promise<string> {
    const outputPath = resolve(options.outputDir, `scene-${scene.id}.mp4`);
    const scenarioIndex = options.sceneIndex ?? 0;
    const sceneNumber = this.target.sceneStartIndex + scenarioIndex;
    const configuredScene = this.target.scenes?.[scenarioIndex];

    if (this.target.scenes && configuredScene === undefined) {
      throw new Error(
        `No target.unity.scenes entry exists for APVG scene '${scene.id}'. ` +
          'Add another Unity scene path or record this APVG scene separately.'
      );
    }
    const ignoredActions = scene.actions.filter((action) => action.type !== 'wait');
    if (ignoredActions.length > 0) {
      logger.warn(
        `Unity Recorder loads the Scene directly; ${ignoredActions.length} interaction action(s) ` +
          `in '${scene.id}' are not executed.`
      );
    }

    logger.step(
      'record:unity',
      `Scene: ${scene.id} -> ${configuredScene || `Build Settings index ${sceneNumber}`}`
    );
    if (options.dryRun) {
      logger.dryRun(
        `Would record ${targetDurationSeconds.toFixed(1)}s to ${outputPath} with Unity Recorder`
      );
      return outputPath;
    }
    if (!this.context.rootDir) {
      throw new Error('Unity recording requires a resolved source project.');
    }

    const projectRoot = resolve(this.context.rootDir);
    assertUnityProject(projectRoot);
    const editorPath = await resolveUnityEditorPath(projectRoot, this.target.editorPath);
    const scriptPath = await this.installEditorScript(projectRoot);
    const logPath = resolve(this.context.workDir, 'unity-recorder.log');
    await mkdir(dirname(outputPath), { recursive: true });
    await mkdir(dirname(logPath), { recursive: true });
    if (existsSync(outputPath)) await rm(outputPath);

    const [width, height] = config.resolution.split('x').map(Number);
    const args = [
      '-batchmode',
      '-projectPath',
      projectRoot,
      '-executeMethod',
      'APVG.Editor.ApvgRecorder.Run',
      '-apvgOutput',
      outputPath,
      '-apvgDuration',
      String(Math.max(0.1, targetDurationSeconds)),
      '-apvgWarmup',
      String(this.target.sceneLoadWaitSeconds),
      '-apvgFps',
      String(config.fps),
      '-apvgWidth',
      String(width),
      '-apvgHeight',
      String(height),
      '-apvgAudio',
      String(this.target.includeAudio).toLowerCase(),
      '-apvgTimeout',
      String(this.target.timeoutSeconds),
      '-logFile',
      logPath,
    ];
    if (configuredScene) args.push('-apvgScene', configuredScene);
    else args.push('-apvgSceneIndex', String(sceneNumber));

    logger.info(`Unity Editor: ${editorPath}`);
    logger.dim(`Recorder script: ${scriptPath}`);
    await runUnity(editorPath, args, this.target.timeoutSeconds * 1000, logPath);
    if (!existsSync(outputPath)) {
      throw new Error(`Unity Recorder did not create ${outputPath}. See ${logPath}.`);
    }
    logger.success(`Saved: ${outputPath}`);
    return outputPath;
  }

  async dispose(): Promise<void> {
    if (!this.generatedDirectory) return;
    await rm(this.generatedDirectory, { recursive: true, force: true });
    await rm(`${this.generatedDirectory}.meta`, { force: true });
    this.generatedDirectory = undefined;
  }

  private async installEditorScript(projectRoot: string): Promise<string> {
    if (!this.generatedDirectory) {
      const token = `${process.pid}-${Date.now()}`;
      this.generatedDirectory = join(projectRoot, 'Assets', `APVGGenerated-${token}`);
      await mkdir(join(this.generatedDirectory, 'Editor'), { recursive: true });
    }
    const scriptPath = join(this.generatedDirectory, 'Editor', 'ApvgRecorder.cs');
    await writeFile(scriptPath, UNITY_EDITOR_SCRIPT, 'utf8');
    return scriptPath;
  }
}

export async function resolveUnityEditorPath(
  projectRoot: string,
  configured?: string
): Promise<string> {
  const explicit = configured || process.env.UNITY_EDITOR_PATH;
  if (explicit) {
    const path = resolve(explicit);
    if (!existsSync(path)) throw new Error(`Unity Editor executable not found: ${path}`);
    return path;
  }

  const versionFile = join(projectRoot, 'ProjectSettings', 'ProjectVersion.txt');
  const versionText = await readFile(versionFile, 'utf8');
  const version = versionText.match(/^m_EditorVersion:\s*(\S+)/m)?.[1];
  if (!version) throw new Error(`Could not read the Unity version from ${versionFile}.`);
  const candidates = unityEditorCandidates(version);
  const found = candidates.find(existsSync);
  if (found) return found;
  throw new Error(
    `Unity Editor ${version} was not found. Set target.unity.editorPath or UNITY_EDITOR_PATH. ` +
      `Checked: ${candidates.join(', ')}`
  );
}

export function unityEditorCandidates(version: string): string[] {
  switch (process.platform) {
    case 'win32':
      return [join('C:\\Program Files\\Unity\\Hub\\Editor', version, 'Editor', 'Unity.exe')];
    case 'darwin':
      return [join('/Applications/Unity/Hub/Editor', version, 'Unity.app/Contents/MacOS/Unity')];
    default:
      return [join('/opt/unity/editors', version, 'Editor', 'Unity')];
  }
}

function assertUnityProject(root: string): void {
  for (const required of ['Assets', 'Packages', 'ProjectSettings/ProjectVersion.txt']) {
    if (!existsSync(join(root, ...required.split('/')))) {
      throw new Error(`Not a Unity project (missing ${required}): ${root}`);
    }
  }
  const manifest = join(root, 'Packages', 'manifest.json');
  const text = existsSync(manifest) ? readFileSync(manifest, 'utf8') : '';
  if (!text.includes('com.unity.recorder')) {
    throw new Error(
      `Unity Recorder is not installed in ${manifest}. ` +
        'Install com.unity.recorder with Unity Package Manager first.'
    );
  }
}

function runUnity(command: string, args: string[], timeoutMs: number, logPath: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Unity Recorder timed out after ${timeoutMs / 1000}s. See ${logPath}.`));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not start Unity Editor '${command}': ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(`Unity Recorder exited with code ${code}: ${stderr.trim()}\nSee ${logPath}.`)
        );
      }
    });
  });
}

export const UNITY_EDITOR_SCRIPT = String.raw`// Generated temporarily by APVG. Requires com.unity.recorder.
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Recorder;
using UnityEditor.Recorder.Input;
using UnityEngine;

namespace APVG.Editor
{
    [InitializeOnLoad]
    public static class ApvgRecorder
    {
        const string ActiveKey = "APVG.Recorder.Active";
        const string ObservedPlayKey = "APVG.Recorder.ObservedPlay";
        const string StartedKey = "APVG.Recorder.Started";
        const string OutputKey = "APVG.Recorder.Output";
        const string DeadlineKey = "APVG.Recorder.Deadline";
        const string DurationKey = "APVG.Recorder.Duration";
        const string WarmupKey = "APVG.Recorder.Warmup";
        const string FpsKey = "APVG.Recorder.Fps";
        const string WidthKey = "APVG.Recorder.Width";
        const string HeightKey = "APVG.Recorder.Height";
        const string AudioKey = "APVG.Recorder.Audio";
        static RecorderController controller;

        static ApvgRecorder()
        {
            if (SessionState.GetBool(ActiveKey, false))
                EditorApplication.update += WatchRecording;
        }

        public static void Run()
        {
            try
            {
                var output = Arg("-apvgOutput");
                var scenePath = OptionalArg("-apvgScene") ?? BuildScene(ArgInt("-apvgSceneIndex"));
                var timeout = ArgInt("-apvgTimeout");

                Directory.CreateDirectory(Path.GetDirectoryName(output));
                EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);

                SessionState.SetBool(ActiveKey, true);
                SessionState.SetBool(ObservedPlayKey, false);
                SessionState.SetBool(StartedKey, false);
                SessionState.SetString(OutputKey, output);
                SessionState.SetString(DeadlineKey, DateTime.UtcNow.AddSeconds(timeout).Ticks.ToString());
                SessionState.SetString(DurationKey, Arg("-apvgDuration"));
                SessionState.SetString(WarmupKey, Arg("-apvgWarmup"));
                SessionState.SetInt(FpsKey, ArgInt("-apvgFps"));
                SessionState.SetInt(WidthKey, ArgInt("-apvgWidth"));
                SessionState.SetInt(HeightKey, ArgInt("-apvgHeight"));
                SessionState.SetBool(AudioKey, bool.Parse(Arg("-apvgAudio")));
                EditorApplication.update -= WatchRecording;
                EditorApplication.update += WatchRecording;
                EditorApplication.EnterPlaymode();
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                ClearState();
                EditorApplication.Exit(1);
            }
        }

        static void WatchRecording()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                SessionState.SetBool(ObservedPlayKey, true);

            if (EditorApplication.isPlaying && !SessionState.GetBool(StartedKey, false))
            {
                try
                {
                    StartRecorderInPlayMode();
                    SessionState.SetBool(StartedKey, true);
                }
                catch (Exception error)
                {
                    Debug.LogException(error);
                    ClearState();
                    EditorApplication.Exit(1);
                }
                return;
            }

            long deadline;
            if (long.TryParse(SessionState.GetString(DeadlineKey, "0"), out deadline) && DateTime.UtcNow.Ticks > deadline)
            {
                Debug.LogError("APVG Unity Recorder timed out.");
                ClearState();
                EditorApplication.Exit(1);
                return;
            }

            if (!SessionState.GetBool(ObservedPlayKey, false) || EditorApplication.isPlayingOrWillChangePlaymode)
                return;

            var output = SessionState.GetString(OutputKey, "");
            var ok = File.Exists(output);
            if (!ok) Debug.LogError("Unity Recorder output was not created: " + output);
            ClearState();
            EditorApplication.Exit(ok ? 0 : 1);
        }

        static void StartRecorderInPlayMode()
        {
            var output = SessionState.GetString(OutputKey, "");
            var duration = SessionDouble(DurationKey);
            var warmup = SessionDouble(WarmupKey);
            var movie = ScriptableObject.CreateInstance<MovieRecorderSettings>();
            movie.name = "APVG Movie Recorder";
            movie.Enabled = true;
            movie.OutputFormat = MovieRecorderSettings.VideoRecorderOutputFormat.MP4;
            movie.OutputFile = Path.ChangeExtension(output, null);
            movie.ImageInputSettings = new GameViewInputSettings
            {
                OutputWidth = SessionState.GetInt(WidthKey, 1920),
                OutputHeight = SessionState.GetInt(HeightKey, 1080)
            };
            movie.AudioInputSettings.PreserveAudio = SessionState.GetBool(AudioKey, false);

            var settings = ScriptableObject.CreateInstance<RecorderControllerSettings>();
            settings.AddRecorderSettings(movie);
            settings.SetRecordModeToTimeInterval((float)warmup, (float)(warmup + duration));
            settings.FrameRate = SessionState.GetInt(FpsKey, 30);
            settings.CapFrameRate = true;
            settings.ExitPlayMode = true;
            controller = new RecorderController(settings);
            controller.PrepareRecording();
            if (!controller.StartRecording())
                throw new Exception("Unity Recorder refused to start. Check the Game View and Recorder settings.");
        }

        static string BuildScene(int enabledIndex)
        {
            var scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).ToArray();
            if (enabledIndex < 0 || enabledIndex >= scenes.Length)
                throw new Exception("Build Settings scene index " + enabledIndex + " is unavailable; enabled scene count is " + scenes.Length + ".");
            return scenes[enabledIndex].path;
        }

        static string Arg(string name) => OptionalArg(name) ?? throw new Exception("Missing command line argument: " + name);
        static string OptionalArg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
        }
        static int ArgInt(string name) => int.Parse(Arg(name));
        static double ArgDouble(string name) => double.Parse(Arg(name), System.Globalization.CultureInfo.InvariantCulture);
        static double SessionDouble(string name) => double.Parse(SessionState.GetString(name, "0"), System.Globalization.CultureInfo.InvariantCulture);

        static void ClearState()
        {
            EditorApplication.update -= WatchRecording;
            SessionState.EraseBool(ActiveKey);
            SessionState.EraseBool(ObservedPlayKey);
            SessionState.EraseBool(StartedKey);
            SessionState.EraseString(OutputKey);
            SessionState.EraseString(DeadlineKey);
            SessionState.EraseString(DurationKey);
            SessionState.EraseString(WarmupKey);
            SessionState.EraseInt(FpsKey);
            SessionState.EraseInt(WidthKey);
            SessionState.EraseInt(HeightKey);
            SessionState.EraseBool(AudioKey);
        }
    }
}
`;
