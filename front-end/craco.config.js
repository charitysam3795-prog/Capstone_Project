module.exports = {
  webpack: {
    configure: (config) => {
      // Skip ESLint during webpack compile — big speedup for npm start.
      config.plugins = (config.plugins || []).filter(
        (plugin) => plugin?.constructor?.name !== 'ESLintWebpackPlugin'
      );

      for (const plugin of config.plugins) {
        if (
          plugin &&
          plugin.constructor?.name === 'MiniCssExtractPlugin' &&
          plugin.options
        ) {
          plugin.options.ignoreOrder = true;
        }
      }

      return config;
    },
  },
};