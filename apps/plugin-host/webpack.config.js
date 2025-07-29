const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const path = require('path');

module.exports = {
  output: {
    devtoolModuleFilenameTemplate(info) {
      const { absoluteResourcePath, namespace, resourcePath } = info;
      if (path.isAbsolute(absoluteResourcePath)) {
        return path.relative(path.join(__dirname, 'dist'), absoluteResourcePath);
      }
      return `webpack://${namespace}/${resourcePath}`;
    },
    path: path.join(__dirname, 'dist'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
  ],
};
