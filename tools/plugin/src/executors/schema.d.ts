export interface ZipExecutorSchema {
  outputPath?: string;
  sourceRoot?: string;
}

export interface BuildExecutorSchema {
  outputPath: string;
  sourceRoot?: string;
  tsConfig?: string;
}

export interface LintExecutorSchema {
  lintFilePatterns?: string[];
  fix?: boolean;
}
