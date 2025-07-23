const fs = require('fs')
const path = require('path')

let workspace
const workspacePath = path.resolve(__dirname, 'workspace.json')
if (fs.existsSync(workspacePath)) {
  workspace = require(workspacePath)
} else {
  workspace = { projects: {} }
  const appsPath = path.resolve(__dirname, 'apps')
  const libsPath = path.resolve(__dirname, 'libs')
  const getProjectsFromDir = dir =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter(p => fs.existsSync(path.join(dir, p, 'project.json')))
          .forEach(p => (workspace.projects[p] = { root: path.join(dir, p) }))
      : undefined

  getProjectsFromDir(appsPath)
  getProjectsFromDir(libsPath)
}

module.exports = {
  '*.{js,ts,tsx,jsx,json,md,css,scss}': ['nx format:write --files'],
  '**/src/**/*.{js,jsx,ts,tsx}': allStagedFiles => {
    const filesProjectMap = new Map()

    for (const [projectName, projectConfig] of Object.entries(
      workspace.projects
    )) {
      const projectRoot =
        typeof projectConfig === 'string' ? projectConfig : projectConfig.root
      if (!projectRoot) continue

      const files = allStagedFiles.filter(fileName =>
        fileName.startsWith(projectRoot + '/')
      )

      if (files.length > 0) {
        filesProjectMap.set(projectName, files)
      }
    }

    return Array.from(filesProjectMap.entries()).map(
      ([projectName, files]) =>
        `nx lint ${projectName} --lintFilePatterns="${files.join(',')}"`
    )
  },
}
