import ExpoModulesCore
import Foundation

public class ICloudKVSModule: Module {
  private var kvs: NSUbiquitousKeyValueStore {
    NSUbiquitousKeyValueStore.default
  }

  public func definition() -> ModuleDefinition {
    Name("ICloudKVS")

    AsyncFunction("set") { (key: String, value: String) in
      self.kvs.set(value, forKey: key)
      self.kvs.synchronize()
    }

    AsyncFunction("get") { (key: String) -> String? in
      return self.kvs.string(forKey: key)
    }

    AsyncFunction("remove") { (key: String) in
      self.kvs.removeObject(forKey: key)
      self.kvs.synchronize()
    }
  }
}
