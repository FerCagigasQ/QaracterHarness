import { writeFile } from "node:fs/promises";
import { createDefaultManifest } from "../../config/defaults.js";
import { ensureRepoLayout, fileExists, resolveApoloPaths } from "../../fs/layout.js";
import { commandOk, type CommandResult, type CommandService, type CommandServiceContext } from "../../core/index.js";

export interface InitCommandInput {
  readonly args: readonly string[];
}

export interface InitCommandOutput {
  readonly repoHome: string;
  readonly manifestPath: string;
  readonly initialized: boolean;
}

export class InitCommandService implements CommandService<InitCommandInput, InitCommandOutput> {
  async execute(input: InitCommandInput, context: CommandServiceContext): Promise<CommandResult<InitCommandOutput>> {
    const paths = resolveApoloPaths(context.cwd, context.env);
    await ensureRepoLayout(paths);

    if (await fileExists(paths.manifestPath)) {
      return commandOk("init", {
        message: `APOLO workspace already initialized at ${paths.repoHome}`,
        data: {
          repoHome: paths.repoHome,
          manifestPath: paths.manifestPath,
          initialized: false
        }
      });
    }

    const manifest = createDefaultManifest(context.cwd, context.env);
    await writeFile(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return commandOk("init", {
      message: `Initialized APOLO workspace at ${paths.repoHome}`,
      lines: ["Default init mode: pull-request"],
      data: {
        repoHome: paths.repoHome,
        manifestPath: paths.manifestPath,
        initialized: true
      }
    });
  }
}
