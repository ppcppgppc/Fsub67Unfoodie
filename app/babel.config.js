// babel-preset-expo 包含 expo-router 嘅 plugin,
// 佢負責注入 EXPO_ROUTER_APP_ROOT。冇呢個檔案,expo-router 會喺 bundle 時炒。
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
