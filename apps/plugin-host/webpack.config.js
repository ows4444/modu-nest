const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets', './src/assets/plugins'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
  ],
  resolve: {
    fallback: {
      fs: false,
      path: false,
    },
  },
  externals: {
    // Mark dynamic plugin paths as external to avoid bundling warnings
    plugins: 'commonjs2 plugins',
  },
  module: {
    unknownContextCritical: false,
    unknownContextRegExp: /assets\/plugins/,
    unknownContextRequest: '.',
  },
};
