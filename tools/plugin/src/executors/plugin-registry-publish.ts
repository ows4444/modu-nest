import { ExecutorContext, PromiseExecutor, logger } from '@nx/devkit';
import { PluginPublishExecutorSchema } from './schema';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const execAsync = promisify(exec);

const runExecutor: PromiseExecutor<PluginPublishExecutorSchema> = async (options, context: ExecutorContext) => {
  const {
    outputPath = 'dist',
    registryUrl = 'http://localhost:3001',
  } = options;

  const projectName = context.projectName;
  if (!projectName) {
    logger.error('Project name not found in context');
    return { success: false };
  }

  const projectRoot = context.projectGraph?.nodes[projectName]?.data?.root;
  if (!projectRoot) {
    logger.error(`Could not find project root for ${projectName}`);
    return { success: false };
  }

  const sourceRoot = path.join(context.root, projectRoot);
  const buildOutputDir = path.join(sourceRoot, outputPath);

  try {
    logger.info(`Publishing plugin ${projectName} to registry...`);

    // Verify build output exists
    if (!fs.existsSync(buildOutputDir)) {
      logger.error(`Build output directory not found: ${buildOutputDir}`);
      logger.info('Run plugin-build first to build the plugin');
      return { success: false };
    }

    // Create a zip file of the built plugin
    const zipFileName = `${projectName}.zip`;
    const zipPath = path.join(sourceRoot, zipFileName);
    
    // Remove existing zip if it exists
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    // Create zip archive of the dist directory
    logger.info('Creating plugin archive...');
    await execAsync(`cd "${buildOutputDir}" && zip -r "${zipPath}" .`);

    if (!fs.existsSync(zipPath)) {
      logger.error('Failed to create plugin archive');
      return { success: false };
    }

    // Upload to registry
    logger.info(`Uploading plugin to registry at ${registryUrl}...`);
    
    const formData = new FormData();
    formData.append('plugin', fs.createReadStream(zipPath));

    const response = await axios.post(`${registryUrl}/plugins/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 60000, // 60 second timeout
    });

    if (response.status === 200 || response.status === 201) {
      logger.info(`✓ Plugin ${projectName} published successfully to registry`);
      logger.info(`Plugin metadata: ${JSON.stringify(response.data, null, 2)}`);
    } else {
      logger.error(`Failed to publish plugin: ${response.status} ${response.statusText}`);
      return { success: false };
    }

    // Clean up zip file
    fs.unlinkSync(zipPath);
    logger.info('✓ Cleaned up temporary files');

    return { success: true };
  } catch (error) {
    logger.error(`Failed to publish plugin to registry: ${error}`);
    
    // Clean up zip file if it exists
    const zipPath = path.join(sourceRoot, `${projectName}.zip`);
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    
    return { success: false };
  }
};

export default runExecutor;