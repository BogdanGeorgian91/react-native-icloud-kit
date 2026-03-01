const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

function withICloud(config, { containerIdentifier }) {
  if (!containerIdentifier) {
    throw new Error(
      "react-native-icloud-kit: containerIdentifier is required. " +
        'Example: ["react-native-icloud-kit/plugin/withICloud", { "containerIdentifier": "iCloud.com.example.app" }]'
    );
  }

  // Step 1: Add iCloud entitlements
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.icloud-container-identifiers"] = [
      containerIdentifier,
    ];
    config.modResults["com.apple.developer.icloud-services"] = ["CloudKit"];
    // KVS identifier uses the app's bundle ID (Apple's convention)
    config.modResults["com.apple.developer.ubiquity-kvstore-identifier"] =
      `$(TeamIdentifierPrefix)${config.ios?.bundleIdentifier ?? "$(CFBundleIdentifier)"}`;
    return config;
  });

  // Step 2: Write container ID to Info.plist for runtime access.
  // Entitlements are embedded in the code signature and cannot be read via
  // Bundle.main at runtime. The Swift module reads this custom key instead.
  config = withInfoPlist(config, (config) => {
    config.modResults.ICloudKitContainerIdentifier = containerIdentifier;
    return config;
  });

  return config;
}

module.exports = withICloud;
